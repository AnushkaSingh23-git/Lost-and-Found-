// BLUE – Lost and Found, Reinvented. Zero-dependency Node server: REST API + static frontend + SQLite.
const http = require('http');
const fs = require('fs');
const path = require('path');
const database = require('./db');
const { seed } = require('./seed');
const { findMatches, categoryOf } = require('./matcher');
const { findVectorMatches, EmbeddingServiceError } = require('./vector-matcher');
const { parseReport } = require('./parser');
const { CATEGORIES, COLOURS, LOCATIONS, STORAGE_POINTS } = require('./data');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const ALERT_THRESHOLD = 60;
const VECTOR_ALERT_THRESHOLD = 68;

const seeded = seed();
if (seeded) console.log(`Seeded ${seeded} sample records.`);

// ---------- helpers ----------
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (res, status, error) => send(res, status, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 1e5) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const clean = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function validateReport(body, type) {
  const name = clean(body.name, 80);
  const location = clean(body.location, 60);
  if (!name) return { error: 'Please say what the item is.' };
  if (!LOCATIONS.some(l => l.id === location)) return { error: 'Please choose a campus location.' };
  let time = body.time ? new Date(body.time) : new Date();
  if (isNaN(time)) return { error: 'That date/time is not valid.' };
  if (time > new Date(Date.now() + 5 * 60e3)) return { error: 'The time cannot be in the future.' };
  const stored_at = type === 'found' ? (clean(body.stored_at, 60) || 'Security Desk') : null;
  return {
    item: {
      type, name, category: categoryOf(name) || categoryOf(body.description), colour: clean(body.colour, 30),
      brand: clean(body.brand, 40), location, time: time.toISOString(), description: clean(body.description, 500), stored_at
    }
  };
}

function candidatesFor(item) {
  return database.listItems({ type: item.type === 'lost' ? 'found' : 'lost', status: 'open' });
}

function matchesFor(item) {
  return findMatches(item, candidatesFor(item));
}

async function vectorMatchesFor(item) {
  const matches = await findVectorMatches(item, candidatesFor(item));
  return matches.filter(match => database.getItem(match.item.id)?.status === 'open').slice(0, 6);
}

function stats() {
  const all = database.listItems();
  const lost = all.filter(i => i.type === 'lost');
  const found = all.filter(i => i.type === 'found');
  const reunited = all.filter(i => i.status === 'reunited');

  const tally = (rows, key) => {
    const m = {};
    for (const r of rows) if (r[key]) m[r[key]] = (m[r[key]] || 0) + 1;
    return Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  };
  const itemCounts = tally(lost, 'category').map(x => ({ ...x, icon: CATEGORIES[x.name]?.icon || '📦' }));
  const hotspots = LOCATIONS.map(l => {
    const here = all.filter(i => i.location === l.id);
    return {
      name: l.id, short: l.short, x: l.x, y: l.y, w: l.w, h: l.h,
      total: here.length, lost: here.filter(i => i.type === 'lost').length, found: here.filter(i => i.type === 'found').length,
      topItem: tally(here, 'category')[0]?.name || null
    };
  }).sort((a, b) => b.total - a.total);

  return {
    totals: {
      all: all.length, lost: lost.length, found: found.length, reunited: reunited.length,
      openLost: lost.filter(i => i.status === 'open').length, openFound: found.filter(i => i.status === 'open').length,
      reunionRate: all.length ? Math.round((reunited.length / all.length) * 100) : 0
    },
    topItems: itemCounts.slice(0, 3),
    allItems: itemCounts,
    topLocations: hotspots.slice(0, 3),
    hotspots
  };
}

// ---------- routes ----------
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (m === 'GET' && p === '/api/meta') {
    return send(res, 200, {
      categories: Object.entries(CATEGORIES).map(([name, c]) => ({ name, icon: c.icon, brands: c.brands })),
      colours: Object.entries(COLOURS).map(([name, c]) => ({ name, hex: c.hex })),
      locations: LOCATIONS.map(({ id, short, x, y, w, h }) => ({ id, short, x, y, w, h })),
      storagePoints: STORAGE_POINTS
    });
  }

  if (m === 'GET' && p === '/api/stats') return send(res, 200, stats());

  if (m === 'GET' && p === '/api/items') {
    const type = url.searchParams.get('type') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const q = clean(url.searchParams.get('q'), 60) || undefined;
    const limit = Math.min(500, +url.searchParams.get('limit') || 500);
    return send(res, 200, database.listItems({ type, status, q }).slice(0, limit));
  }

  const createReport = m === 'POST' && p.match(/^\/api\/(vector\/)?(lost|found)$/);
  if (createReport) {
    const [, vector, type] = createReport;
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, 'Please send a report object.');
    const { item, error } = validateReport(body, type);
    if (error) return fail(res, 400, error);
    // Finish embedding work before inserting so an unavailable provider leaves no partial report.
    const vectorMatches = vector ? await vectorMatchesFor(item) : null;
    const saved = database.insertItem(item);
    const matches = vectorMatches ?? matchesFor(saved);
    const best = matches[0];
    const alertThreshold = vector ? VECTOR_ALERT_THRESHOLD : ALERT_THRESHOLD;
    return send(res, 201, {
      item: saved,
      matches,
      alert: best && best.score >= alertThreshold
        ? { score: best.score, message: type === 'lost'
            ? `Good news! A ${best.item.name.toLowerCase()} matching yours (${best.score}%) was handed in at ${best.item.location}.`
            : `Someone reported losing a ${best.item.name.toLowerCase()} that looks like this (${best.score}% match).` }
        : null
    });
  }

  if (m === 'POST' && p === '/api/parse') {
    const body = await readBody(req);
    return send(res, 200, parseReport(clean(body.text, 300)));
  }

  let mm;
  if ((mm = p.match(/^\/api\/items\/(\d+)$/)) && m === 'GET') {
    const item = database.getItem(+mm[1]);
    if (!item) return fail(res, 404, 'Report not found.');
    return send(res, 200, { item, matchedWith: item.matched_id ? database.getItem(item.matched_id) : null });
  }

  if ((mm = p.match(/^\/api\/(vector\/)?items\/(\d+)\/matches$/)) && m === 'GET') {
    const [, vector, id] = mm;
    const item = database.getItem(+id);
    if (!item) return fail(res, 404, 'Report not found.');
    if (item.status !== 'open') return send(res, 200, { item, matches: [] });
    const matches = vector ? await vectorMatchesFor(item) : matchesFor(item);
    const current = vector ? database.getItem(+id) : item;
    if (!current) return fail(res, 404, 'Report not found.');
    return send(res, 200, { item: current, matches: current.status === 'open' ? matches : [] });
  }

  if ((mm = p.match(/^\/api\/items\/(\d+)\/reunite$/)) && m === 'POST') {
    const item = database.getItem(+mm[1]);
    if (!item) return fail(res, 404, 'Report not found.');
    if (item.status === 'reunited') return fail(res, 409, 'This item has already been reunited.');
    const body = await readBody(req);
    let other = null;
    if (body.matchId != null) {
      other = database.getItem(+body.matchId);
      if (!other) return fail(res, 404, 'Matching report not found.');
      if (other.type === item.type) return fail(res, 400, 'A lost report can only be reunited with a found report.');
      if (other.status === 'reunited') return fail(res, 409, 'The matching item has already been reunited.');
    }
    database.markReunited(item.id, other ? other.id : null);
    return send(res, 200, { item: database.getItem(item.id), matchedWith: other ? database.getItem(other.id) : null });
  }

  return fail(res, 404, 'Unknown API route.');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (e instanceof EmbeddingServiceError) return fail(res, 503, e.message);
    fail(res, e.message === 'Invalid JSON' ? 400 : 500, e.message || 'Server error');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`\n  BLUE – Lost and Found is running at http://localhost:${PORT}\n`));
}

module.exports = { server, stats };
