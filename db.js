// SQLite database (built into Node 22.5+, no npm install needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { categoryOf } = require('./matcher');

const DB_FILE = process.env.LF_DB || path.join(__dirname, 'lostfound.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL CHECK (type IN ('lost','found')),
    name         TEXT NOT NULL,
    category     TEXT,
    colour       TEXT,
    brand        TEXT,
    location     TEXT NOT NULL,
    time         TEXT NOT NULL,           -- when it was lost / found (ISO)
    description  TEXT DEFAULT '',
    stored_at    TEXT,                    -- found items: where the item is being held
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reunited')),
    matched_id   INTEGER,                 -- the report this was reunited with
    created_at   TEXT NOT NULL,
    reunited_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_items_type_status ON items(type, status);
  CREATE TABLE IF NOT EXISTS item_embeddings (
    item_id    INTEGER PRIMARY KEY,
    model      TEXT NOT NULL,
    text_input TEXT NOT NULL,
    vector     BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const insertStmt = db.prepare(`
  INSERT INTO items (type, name, category, colour, brand, location, time, description, stored_at, status, matched_id, created_at, reunited_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function insertItem(o) {
  const r = insertStmt.run(
    o.type, o.name, o.category || categoryOf(o.name), o.colour || '', o.brand || '', o.location, o.time,
    o.description || '', o.stored_at || null, o.status || 'open', o.matched_id || null,
    o.created_at || new Date().toISOString(), o.reunited_at || null
  );
  return getItem(Number(r.lastInsertRowid));
}

const getStmt = db.prepare('SELECT * FROM items WHERE id = ?');
const getItem = id => getStmt.get(id) || null;

function listItems({ type, status, q } = {}) {
  const where = [], args = [];
  if (type) { where.push('type = ?'); args.push(type); }
  if (status) { where.push('status = ?'); args.push(status); }
  if (q) {
    where.push('(name LIKE ? OR description LIKE ? OR colour LIKE ? OR brand LIKE ? OR location LIKE ?)');
    for (let i = 0; i < 5; i++) args.push('%' + q + '%');
  }
  const sql = 'SELECT * FROM items' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY created_at DESC, id DESC';
  return db.prepare(sql).all(...args);
}

function count() {
  return db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
}

function markReunited(id, matchedId) {
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const upd = db.prepare("UPDATE items SET status = 'reunited', matched_id = ?, reunited_at = ? WHERE id = ?");
    upd.run(matchedId ?? null, now, id);
    if (matchedId) upd.run(id, now, matchedId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function clearAll() {
  db.exec('DELETE FROM item_embeddings; DELETE FROM items; DELETE FROM sqlite_sequence WHERE name = \'items\';');
}

function getItemEmbeddings(itemIds, model) {
  const out = new Map();
  if (!itemIds.length) return out;
  for (let i = 0; i < itemIds.length; i += 500) {
    const chunk = itemIds.slice(i, i + 500);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT item_id, text_input, vector FROM item_embeddings WHERE model = ? AND item_id IN (${placeholders})`
    ).all(model, ...chunk);
    for (const row of rows) {
      const bytes = Uint8Array.from(row.vector);
      out.set(row.item_id, {
        textInput: row.text_input,
        vector: new Float32Array(bytes.buffer)
      });
    }
  }
  return out;
}

const upsertEmbeddingStmt = db.prepare(`
  INSERT INTO item_embeddings (item_id, model, text_input, vector, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(item_id) DO UPDATE SET
    model = excluded.model,
    text_input = excluded.text_input,
    vector = excluded.vector,
    updated_at = excluded.updated_at
`);

function saveItemEmbeddings(entries, model) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const entry of entries) {
      const blob = Buffer.from(entry.vector.buffer, entry.vector.byteOffset, entry.vector.byteLength);
      upsertEmbeddingStmt.run(entry.itemId, model, entry.textInput, blob, now);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function countEmbeddings(model) {
  return db.prepare('SELECT COUNT(*) AS n FROM item_embeddings WHERE model = ?').get(model).n;
}

module.exports = { db, insertItem, getItem, listItems, count, markReunited, clearAll, getItemEmbeddings, saveItemEmbeddings, countEmbeddings };
