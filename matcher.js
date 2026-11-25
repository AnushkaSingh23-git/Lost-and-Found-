// Smart matching between lost and found reports.
// Score = weighted blend of item, colour, location, time, brand and description similarity (0-100).
const { SYN_INDEX, COLOURS, COLOUR_NEAR, LOCATIONS } = require('./data');

const WEIGHTS = { item: 30, colour: 20, location: 20, time: 10, brand: 10, description: 10 };

const STOP = new Set(('a an the and or of in on at to with for from by is it its was were has have had this that these those near some very ' +
  'my i lost found small big old new one two item thing please left front back side attached included').split(' '));

const ALL_COLOUR_WORDS = new Map();
for (const [fam, c] of Object.entries(COLOURS)) for (const w of c.words) ALL_COLOUR_WORDS.set(w, fam);

// Words that just name the item type ("hoodie", "bottle") – already scored by the item check.
const ITEM_WORDS = new Set(SYN_INDEX.flatMap(([s]) => s.split(' ')).map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)));

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stem = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

function tokens(text) {
  return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => !STOP.has(w) && !ALL_COLOUR_WORDS.has(w) && w.length > 1)
    .map(stem);
}

function categoryOf(text) {
  const t = String(text || '').toLowerCase();
  for (const [syn, cat] of SYN_INDEX) {
    if (new RegExp('\\b' + esc(syn) + 's?\\b').test(t)) return cat;
  }
  return null;
}

function colourFamilyOf(text) {
  const words = String(text || '').toLowerCase().match(/[a-z-]+/g) || [];
  for (const w of words) if (ALL_COLOUR_WORDS.has(w)) return ALL_COLOUR_WORDS.get(w);
  
  return null;
}

function normBrand(b) {
  const s = String(b || '').toLowerCase().trim();
  if (!s || ['none', 'unknown', 'no brand', 'n/a', 'na', 'unbranded', 'not sure', 'generic'].includes(s)) return '';
  return s.replace(/[^a-z0-9]/g, '');
}

function locationScore(a, b) {
  if (!a || !b) return 0.3;
  if (a === b) return 1;
  const la = LOCATIONS.find(l => l.id === a);
  if (la && la.near.includes(b)) return 0.55;
  const lb = LOCATIONS.find(l => l.id === b);
  if (lb && lb.near.includes(a)) return 0.55;
  return 0.1;
}

function timeScore(lost, found) {
  const tl = new Date(lost).getTime(), tf = new Date(found).getTime();
  if (isNaN(tl) || isNaN(tf)) return 0.3;
  const hours = Math.abs(tf - tl) / 3600e3;
  let s;
  if (hours <= 6) s = 1;
  else if (hours <= 24) s = 0.9;
  else if (hours <= 72) s = 0.7;
  else if (hours <= 168) s = 0.4;
  else if (hours <= 336) s = 0.15;
  else s = 0;
  // An item can't be found before it was lost (allow 2h of slack for vague reports).
  if (tf < tl - 2 * 3600e3) s *= 0.4;
  return s;
}

function overlap(a, b) {
  if (!a.length || !b.length) return null;
  const A = new Set(a), B = new Set(b);
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  // Overlap coefficient, softened so one shared word is a decent hint, not a perfect score.
  return Math.min(1, n / Math.min(A.size, B.size, 4) * 0.9 + (n >= 3 ? 0.1 : 0));
}

function scorePair(lost, found) {
  const reasons = [];

  // --- Item: category synonyms, falling back to shared name words ---
  const catL = lost.category || categoryOf(lost.name);
  const catF = found.category || categoryOf(found.name);
  let item;
  if (catL && catF) {
    item = catL === catF ? 1 : 0;
    if (item) reasons.push(`Same kind of item (${catL})`);
  } else {
    item = (overlap(tokens(lost.name), tokens(found.name)) || 0) * 0.7;
    if (item > 0.3) reasons.push('Similar item name');
  }

  // --- Colour: families (navy ≈ blue), close shades earn partial credit ---
  const cl = colourFamilyOf(lost.colour) || colourFamilyOf(lost.name) || colourFamilyOf(lost.description);
  
  const cf = colourFamilyOf(found.colour) || colourFamilyOf(found.name) || colourFamilyOf(found.description);
  let colour;
  if (!cl || !cf) colour = 0.4;
  else if (cl === cf) {
    colour = 1;
    const wl = colourWord(lost) || cl, wf = colourWord(found) || cf;
    reasons.push(wl === wf ? `Same colour (${cl})` : `Colour match: ${wl} ≈ ${wf}`);
  } else {
    colour = COLOUR_NEAR[[cl, cf].sort().join('|')] || 0;
    if (colour) reasons.push(`Similar colours (${cl} / ${cf})`);
  }

  // --- Brand ---
  const bl = normBrand(lost.brand), bf = normBrand(found.brand);
  let brand;
  if (!bl || !bf) brand = 0.5;
  else if (bl === bf || bl.includes(bf) || bf.includes(bl)) { brand = 1; reasons.push(`Same brand (${found.brand})`); }
  else brand = 0;

  // --- Location ---
  const location = locationScore(lost.location, found.location);
  if (location === 1) reasons.push(`Same place (${found.location})`);
  else if (location >= 0.5) reasons.push('Nearby locations');

  // --- Time ---
  const time = timeScore(lost.time, found.time);
  if (time >= 0.9) reasons.push('Reported within a day');
  else if (time >= 0.7) reasons.push('Reported within 3 days');

  // --- Description ---
  const detail = it => tokens(it.description + ' ' + it.name).filter(w => !ITEM_WORDS.has(w));
  const d = overlap(detail(lost), detail(found));
  const description = d === null ? 0.3 : d;
  if (description >= 0.5) reasons.push('Descriptions overlap');

  const parts = { item, colour, location, time, brand, description };
  let total = 0;
  for (const k of Object.keys(WEIGHTS)) total += parts[k] * WEIGHTS[k];
  // A different kind of item should never look like a strong match.
  if (item === 0) total = Math.min(total, 25);
  // Clearly different colours (e.g. green vs grey) make a match much less likely.
  if (cl && cf && colour === 0) total *= 0.85;

  const breakdown = {};
  for (const k of Object.keys(WEIGHTS)) breakdown[k] = Math.round(parts[k] * 100);
  return { score: Math.round(Math.max(0, Math.min(100, total))), breakdown, reasons };
}

function colourWord(it) {
  const words = (String(it.colour || '') + ' ' + String(it.name || '')).toLowerCase().match(/[a-z-]+/g) || [];
  return words.find(w => ALL_COLOUR_WORDS.has(w)) || '';
}

// Find best matches for `item` among `candidates` (the opposite report type).
function findMatches(item, candidates, { min = 35, limit = 6 } = {}) {
  const out = [];
  for (const c of candidates) {
    if (c.type === item.type || c.status !== 'open' || c.id === item.id) continue;
    const lost = item.type === 'lost' ? item : c;
    const found = item.type === 'found' ? item : c;
    const r = scorePair(lost, found);
    if (r.score >= min) out.push({ item: c, ...r });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

module.exports = { scorePair, findMatches, categoryOf, colourFamilyOf, WEIGHTS };
