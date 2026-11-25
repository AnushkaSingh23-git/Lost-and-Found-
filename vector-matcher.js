const { locationScore, timeScore } = require('./matcher');

const endpoint = process.env.LF_EMBEDDINGS_URL || 'http://127.0.0.1:1234/v1/embeddings';
const model = process.env.LF_EMBEDDINGS_MODEL || 'nomic-embed-text-v1.5';
const apiKey = process.env.LF_EMBEDDINGS_API_KEY;
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
      signal: AbortSignal.timeout(10000),
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

function similarity(a, b) {
  if (a.length !== b.length) {
    cache.clear();
    throw new EmbeddingServiceError(new Error('Embedding dimensions changed'));
  }
  return Math.max(0, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0)));
}

async function findVectorMatches(item, candidates) {
  const eligible = candidates.filter(candidate => !item.category || !candidate.category || item.category === candidate.category);
  if (!eligible.length) return [];
  const texts = eligible.map(candidate => reportText(candidate, 'document'));
  const [query, ...vectors] = await embed([reportText(item, 'query'), ...texts]);
  return eligible.flatMap((candidate, i) => {
    const semantic = similarity(query, vectors[i]);
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

module.exports = { findVectorMatches, EmbeddingServiceError };
