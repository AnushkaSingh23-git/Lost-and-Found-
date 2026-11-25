const { locationScore, timeScore } = require('./matcher');
const database = require('./db');

function resolveEmbeddingsUrl(raw) {
  const base = (raw || 'http://172.16.0.2:1234/v1/embeddings').trim().replace(/\/+$/, '');
  if (base.endsWith('/v1/embeddings') || base.endsWith('/embeddings')) return base;
  if (base.endsWith('/v1')) return `${base}/embeddings`;
  return `${base}/v1/embeddings`;
}

const endpoint = resolveEmbeddingsUrl(process.env.LF_EMBEDDINGS_URL);
const modelsEndpoint = endpoint.replace(/\/embeddings$/, '/models');
const model = process.env.LF_EMBEDDINGS_MODEL || 'text-embedding-nomic-embed-text-v1.5@q8_0';
const apiKey = process.env.LF_EMBEDDINGS_API_KEY;
const timeoutMs = Math.max(1000, Number(process.env.LF_EMBEDDINGS_TIMEOUT_MS) || 30000);
const useNomicPrefixes = model.toLowerCase().includes('nomic-embed-text');
const cache = new Map();
const batchSize = 8;
const cacheLimit = 1024;

class EmbeddingServiceError extends Error {
  constructor(cause) {
    super('Vector matching is unavailable. Check the embedding server and model configuration.', { cause });
  }
}

function reportText(item, purpose) {
  const text = [item.name, item.colour, item.brand, item.description].filter(Boolean).join('. ');
  return useNomicPrefixes ? `search_${purpose}: ${text}` : text;
}

function unitVector(values) {
  if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) {
    throw new Error('Invalid embedding vector');
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm || !Number.isFinite(norm)) throw new Error('Invalid embedding norm');
  return Float32Array.from(values, value => value / norm);
}

async function embedBatch(input) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input, encoding_format: 'float' }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'error'
    });
    if (!response.ok) throw new Error(`Embedding service returned HTTP ${response.status}`);
    const { data } = await response.json();
    if (!Array.isArray(data) || data.length !== input.length) throw new Error('Incomplete embeddings');
    const byIndex = new Map(data.map(({ index, embedding }) => [index, embedding]));
    const vectors = input.map((_, index) => unitVector(byIndex.get(index)));
    input.forEach((key, index) => cache.set(key, vectors[index]));
    while (cache.size > cacheLimit) cache.delete(cache.keys().next().value);
    return vectors;
  } catch (cause) {
    throw new EmbeddingServiceError(cause);
  }
}

async function embed(texts) {
  const vectors = new Map();
  const missing = [...new Set(texts)].filter(text => {
    if (!cache.has(text)) return true;
    vectors.set(text, cache.get(text));
    return false;
  });
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = missing.slice(offset, offset + batchSize);
    const result = await embedBatch(batch);
    batch.forEach((text, index) => vectors.set(text, result[index]));
  }
  return texts.map(text => vectors.get(text));
}

async function embedWithDocuments(queryText, candidates) {
  const candidateTexts = candidates.map(c => reportText(c, 'document'));
  const savedIds = candidates.filter(c => c.id != null).map(c => c.id);
  const stored = savedIds.length ? database.getItemEmbeddings(savedIds, model) : new Map();

  const candidateVectors = new Array(candidates.length);
  const textsToEmbed = [queryText];
  const missingIndices = [];
  const pendingPersist = [];

  candidates.forEach((candidate, index) => {
    const text = candidateTexts[index];
    const hit = candidate.id != null ? stored.get(candidate.id) : null;
    if (hit && hit.textInput === text) {
      candidateVectors[index] = hit.vector;
      cache.set(text, hit.vector);
      return;
    }
    if (cache.has(text)) {
      const vec = cache.get(text);
      candidateVectors[index] = vec;
      if (candidate.id != null) pendingPersist.push({ itemId: candidate.id, textInput: text, vector: vec });
      return;
    }
    missingIndices.push(index);
    textsToEmbed.push(text);
  });

  const embedded = await embed(textsToEmbed);
  const queryVector = embedded[0];

  missingIndices.forEach((candidateIdx, i) => {
    const vec = embedded[i + 1];
    candidateVectors[candidateIdx] = vec;
    const candidate = candidates[candidateIdx];
    if (candidate.id != null) {
      pendingPersist.push({ itemId: candidate.id, textInput: candidateTexts[candidateIdx], vector: vec });
    }
  });

  if (pendingPersist.length) {
    database.saveItemEmbeddings(pendingPersist, model);
  }

  return { queryVector, candidateVectors };
}

async function indexItemEmbedding(item) {
  if (!item || item.id == null) return null;
  const text = reportText(item, 'document');
  const stored = database.getItemEmbeddings([item.id], model).get(item.id);
  if (stored && stored.textInput === text) return stored.vector;
  const [vector] = await embed([text]);
  database.saveItemEmbeddings([{ itemId: item.id, textInput: text, vector }], model);
  return vector;
}

function similarity(a, b) {
  if (a.length !== b.length) {
    cache.clear();
    throw new EmbeddingServiceError(new Error('Embedding dimensions changed'));
  }
  return Math.max(0, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0)));
}

async function findVectorMatches(item, candidates) {
  const eligible = candidates.filter(candidate =>
    candidate.id !== item.id &&
    (!item.category || !candidate.category || item.category === candidate.category)
  );
  if (!eligible.length) return [];
  const { queryVector, candidateVectors } = await embedWithDocuments(reportText(item, 'query'), eligible);
  return eligible.flatMap((candidate, i) => {
    const semantic = similarity(queryVector, candidateVectors[i]);
    const sameCategory = Boolean(item.category && item.category === candidate.category);
    if (semantic < (sameCategory ? 0.5 : 0.55)) return [];
    const category = sameCategory ? 1 : 0.5;
    const location = locationScore(item.location, candidate.location);
    const [lost, found] = item.type === 'lost' ? [item, candidate] : [candidate, item];
    const time = timeScore(lost.time, found.time);
    const score = Math.round(semantic * 65 + category * 15 + location * 15 + time * 5);
    const reasons = [`Item text similarity: ${Math.round(semantic * 100)}%`];
    if (sameCategory) reasons.push(`Same kind of item (${item.category})`);
    if (location === 1) reasons.push(`Same place (${candidate.location})`);
    else if (location >= 0.5) reasons.push('Nearby locations');
    if (time >= 0.9) reasons.push('Reported within a day');
    const breakdown = {
      semantic: Math.round(semantic * 100),
      category: Math.round(category * 100),
      location: Math.round(location * 100),
      time: Math.round(time * 100)
    };
    return [{ item: candidate, score, breakdown, reasons }];
  }).sort((a, b) => b.score - a.score);
}

async function searchItemsByVector(queryText, items, { limit = 50, minSemantic = 0.45 } = {}) {
  const q = String(queryText || '').trim();
  if (!q || !items.length) return [];
  const formattedQuery = useNomicPrefixes ? `search_query: ${q}` : q;
  const { queryVector, candidateVectors } = await embedWithDocuments(formattedQuery, items);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);

  return items.flatMap((item, i) => {
    const semantic = similarity(queryVector, candidateVectors[i]);
    const haystack = [item.name, item.category, item.colour, item.brand, item.location, item.description]
      .filter(Boolean).join(' ').toLowerCase();
    const lexical = terms.length > 0 && terms.every(t => haystack.includes(t));
    if (!lexical && semantic < minSemantic) return [];
    const score = Math.round(Math.min(1, semantic + (lexical ? 0.15 : 0)) * 100);
    return [{ item, score, semantic: Math.round(semantic * 100), lexical }];
  }).sort((a, b) => b.score - a.score || b.semantic - a.semantic).slice(0, limit);
}

async function getVectorStatus() {
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const response = await fetch(modelsEndpoint, {
      headers,
      signal: AbortSignal.timeout(3000),
      redirect: 'error'
    });
    if (!response.ok) {
      return { available: false, endpoint, model, modelLoaded: false, error: `HTTP ${response.status}` };
    }
    const body = await response.json();
    const ids = Array.isArray(body?.data) ? body.data.map(m => m.id) : [];
    const modelLoaded = ids.includes(model);
    return {
      available: true,
      endpoint,
      model,
      modelLoaded,
      indexedCount: database.countEmbeddings(model),
      totalItems: database.count()
    };
  } catch (err) {
    return {
      available: false,
      endpoint,
      model,
      modelLoaded: false,
      indexedCount: database.countEmbeddings(model),
      totalItems: database.count(),
      error: err.message
    };
  }
}

module.exports = {
  findVectorMatches,
  searchItemsByVector,
  indexItemEmbedding,
  getVectorStatus,
  EmbeddingServiceError,
  endpoint,
  model
};
