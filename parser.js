// Turns a one-line report like "Lost: Grey hoodie, Library, yesterday at 4 PM" into form fields.
const { LOCATIONS, CATEGORIES, COLOURS } = require('./data');
const { categoryOf } = require('./matcher');

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());

function parseReport(text, now = new Date()) {
  let t = ' ' + String(text || '').trim() + ' ';
  const lower = () => t.toLowerCase();
  const out = { type: null, name: '', colour: '', brand: '', location: '', time: null, description: '' };

  // Type
  const typeM = lower().match(/^\s*(i\s+)?(lost|found|missing|picked up)\b\s*:?/);
  if (typeM) {
    out.type = typeM[2] === 'found' || typeM[2] === 'picked up' ? 'found' : 'lost';
    t = ' ' + t.slice(typeM[0].length + 1);
  } else if (/\bfound\b/i.test(t)) out.type = 'found';
  else out.type = 'lost';

  // Time: day + optional clock time
  let day = 0, hasDay = false, hour = null, minute = 0;
  const dayRules = [
    [/\bday before yesterday\b/i, 2], [/\byesterday\b/i, 1], [/\blast night\b/i, 1], [/\btoday\b/i, 0],
    [/\bthis (morning|afternoon|evening)\b/i, 0], [/\btonight\b/i, 0]
  ];
  for (const [re, d] of dayRules) {
    const m = t.match(re);
    if (m) {
      day = d; hasDay = true;
      if (/morning/i.test(m[0])) hour = 9;
      if (/afternoon/i.test(m[0])) hour = 14;
      if (/evening|night/i.test(m[0])) hour = 20;
      t = t.replace(re, ' ');
      break;
    }
  }
  const daysAgo = t.match(/\b(\d+)\s+days?\s+ago\b/i);
  if (daysAgo) { day = +daysAgo[1]; hasDay = true; t = t.replace(daysAgo[0], ' '); }
  const hoursAgo = t.match(/\b(\d+)\s+(hours?|hrs?|minutes?|mins?)\s+ago\b/i);
  let agoMs = 0;
  if (hoursAgo) { agoMs = +hoursAgo[1] * (/^m/i.test(hoursAgo[2]) ? 60e3 : 3600e3); t = t.replace(hoursAgo[0], ' '); }

  const clock = t.match(/\b(?:at|around|about|by|~)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\W)/i)
    || t.match(/\b(?:at|around|about)\s+(\d{1,2})[:.](\d{2})\b/i);
  if (clock) {
    hour = +clock[1] % 12;
    minute = clock[2] ? +clock[2] : 0;
    const mer = (clock[3] || '').toLowerCase();
    if (mer.startsWith('p')) hour += 12;
    if (!mer) hour = +clock[1];
    t = t.replace(clock[0], ' ');
  } else if (/\bnoon\b/i.test(t)) { hour = 12; t = t.replace(/\bnoon\b/i, ' '); }

  if (agoMs) out.time = new Date(now.getTime() - agoMs).toISOString();
  else if (hasDay || hour !== null) {
    const d = new Date(now);
    d.setDate(d.getDate() - day);
    if (hour !== null) d.setHours(hour, minute, 0, 0);
    else d.setHours(12, 0, 0, 0);
    if (d > now) d.setDate(d.getDate() - 1); // "at 9 PM" said in the morning means last night
    out.time = d.toISOString();
  } else out.time = now.toISOString();

  // Location (longest alias first)
  const aliases = LOCATIONS.flatMap(l => l.alias.map(a => [a, l.id])).sort((a, b) => b[0].length - a[0].length);
  for (const [a, id] of aliases) {
    const re = new RegExp('\\b(?:(?:in|at|near|inside|outside|by|from)\\s+(?:the\\s+)?)?' + esc(a) + '\\b', 'i');
    if (re.test(t)) { out.location = id; t = t.replace(re, ' '); break; }
  }

  // Brand
  const brands = [...new Set(Object.values(CATEGORIES).flatMap(c => c.brands))].sort((a, b) => b.length - a.length);
  for (const b of brands) {
    const re = new RegExp('\\b' + esc(b) + '\\b', 'i');
    if (re.test(t)) { out.brand = b; break; }
  }

  // Colour
  const colourWords = Object.values(COLOURS).flatMap(c => c.words).sort((a, b) => b.length - a.length);
  for (const w of colourWords) {
    const m = t.match(new RegExp('\\b' + esc(w) + '\\b', 'i'));
    if (m) { out.colour = cap(m[0].toLowerCase()); break; }
  }

  // Remaining text: first chunk is the item, the rest becomes the description.
  const chunks = t.split(/[,;.\n]+/).map(s => s.replace(/\s+/g, ' ').replace(/^\s*(a|an|my|the|and|with)\s+/i, '').trim()).filter(Boolean);
  const itemIdx = Math.max(0, chunks.findIndex(c => categoryOf(c)));
  const item = chunks[itemIdx] || '';
  out.name = item ? item[0].toUpperCase() + item.slice(1) : '';
  out.description = chunks.filter((_, i) => i !== itemIdx).join('. ');
  out.category = categoryOf(out.name);
  return out;
}

module.exports = { parseReport };
