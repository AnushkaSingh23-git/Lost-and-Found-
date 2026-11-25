// Generates 150 realistic (fake) lost & found records. Deterministic, anonymous – no personal data.
const { CATEGORIES, LOCATIONS, STORAGE_POINTS } = require('./data');
const database = require('./db');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAT_WEIGHTS = {
  'Water Bottle': 14, 'Hoodie': 11, 'Earbuds': 10, 'ID Card': 9, 'Keys': 7, 'Wallet': 6, 'Backpack': 5, 'Phone': 4,
  'Charger': 5, 'Umbrella': 4, 'Calculator': 4, 'Glasses': 3, 'Notebook': 4, 'Laptop': 2, 'Jacket': 3, 'Watch': 2,
  'USB Drive': 2, 'Headphones': 3
};
const LOC_WEIGHTS = {
  'Central Library': 18, 'Main Cafeteria': 14, 'Student Union': 10, 'Engineering Block': 10, 'Sports Complex': 10,
  'Computer Center': 8, 'Science Labs': 6, 'Main Auditorium': 5, 'Hostel Quad': 5, 'Parking Lot': 3, 'Admin Building': 3, 'Bus Stop': 3
};
// [word used by the person who lost it, word used by the person who found it]
const COLOUR_PAIRS = [
  ['Navy', 'Blue'], ['Blue', 'Blue'], ['Blue', 'Navy'], ['Black', 'Black'], ['Black', 'Black'], ['Grey', 'Gray'], ['Charcoal', 'Grey'],
  ['White', 'White'], ['Red', 'Maroon'], ['Maroon', 'Red'], ['Green', 'Olive'], ['Olive', 'Green'], ['Yellow', 'Mustard'],
  ['Pink', 'Pink'], ['Brown', 'Tan'], ['Purple', 'Lavender'], ['Silver', 'Grey'], ['Orange', 'Orange'], ['Sky blue', 'Blue']
];

function seed({ reset = false } = {}) {
  if (reset) database.clearAll();
  if (database.count() > 0) return 0;

  const rand = rng(20240915);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const weighted = w => {
    const entries = Object.entries(w);
    let r = rand() * entries.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of entries) { if ((r -= v) <= 0) return k; }
    return entries[0][0];
  };
  const now = Date.now();
  const H = 3600e3;
  const iso = ms => new Date(ms).toISOString();
  const nearLoc = loc => (rand() < 0.75 ? loc : pick(LOCATIONS.find(l => l.id === loc).near));

  // A time of day on a day N days ago, between 8:00 and 20:00.
  const daysAgoAt = (days, hour) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d.getTime();
  };

  const rows = [];
  const cap = ms => Math.min(ms, now - 0.5 * H);

  function makeName(colourWord, cat) {
    return `${colourWord} ${pick(CATEGORIES[cat].nouns)}`;
  }

  // --- 60 genuine lost/found pairs (28 already reunited) ---
  for (let i = 0; i < 60; i++) {
    const cat = weighted(CAT_WEIGHTS);
    const c = CATEGORIES[cat];
    const [lw, fw] = cat === 'ID Card' ? pick([['Blue', 'Blue'], ['White', 'White'], ['Blue', 'Navy']]) : pick(COLOUR_PAIRS);
    const brand = c.brands.length ? pick(c.brands) : '';
    const loc = weighted(LOC_WEIGHTS);
    const lostMs = daysAgoAt(Math.floor(rand() * 14) + (i < 40 ? 1 : 0), 8 + rand() * 12);
    const foundMs = cap(lostMs + (1 + rand() * 30) * H);
    const [f1, f2, f3] = [...c.features].sort(() => rand() - 0.5);
    const reunited = i < 28;
    const lostRow = {
      type: 'lost', name: makeName(lw, cat), category: cat, colour: lw, brand: rand() < 0.15 ? '' : brand, location: loc,
      time: iso(lostMs), description: `Has a ${f1} and ${f2}.`, created_at: iso(lostMs + rand() * 3 * H)
    };
    const foundRow = {
      type: 'found', name: makeName(fw, cat), category: cat, colour: fw, brand: rand() < 0.2 ? '' : brand, location: nearLoc(loc),
      time: iso(foundMs), description: `Picked up with ${f1}. ${f3[0].toUpperCase() + f3.slice(1)}.`,
      stored_at: pick(STORAGE_POINTS), created_at: iso(foundMs + rand() * H)
    };
    if (reunited) {
      lostRow.status = foundRow.status = 'reunited';
      lostRow.reunited_at = foundRow.reunited_at = iso(Math.min(now, foundMs + (2 + rand() * 20) * H));
      lostRow._pair = foundRow._pair = i;
    }
    rows.push(lostRow, foundRow);
  }

  // --- Found items handed in recently (these power the "grey hoodie" demo) ---
  const scripted = [
    { name: 'Grey Nike hoodie', category: 'Hoodie', colour: 'Grey', brand: 'Nike', location: 'Central Library', time: daysAgoAt(1, 17.2),
      description: 'College logo on the chest, size medium, front kangaroo pocket. Left on a study table.', stored_at: 'Library Help Desk' },
    { name: 'Charcoal sweatshirt', category: 'Hoodie', colour: 'Charcoal', brand: 'H&M', location: 'Computer Center', time: daysAgoAt(1, 18.5),
      description: 'Zipper front, slightly faded.', stored_at: 'Security Desk' },
    { name: 'Black hoodie', category: 'Hoodie', colour: 'Black', brand: 'Adidas', location: 'Central Library', time: daysAgoAt(2, 13),
      description: 'Drawstring missing one end.', stored_at: 'Library Help Desk' },
    { name: 'Grey jacket', category: 'Jacket', colour: 'Grey', brand: 'Columbia', location: 'Student Union', time: daysAgoAt(1, 16),
      description: 'Zipper pockets and hood attached.', stored_at: 'Student Union Info Desk' },
    { name: 'Grey hoodie', category: 'Hoodie', colour: 'Grey', brand: '', location: 'Sports Complex', time: daysAgoAt(8, 11),
      description: 'Left on a bench near the gym.', stored_at: 'Security Desk' }
  ];
  for (const s of scripted) rows.push({ type: 'found', ...s, time: iso(cap(s.time)), created_at: iso(cap(s.time) + 0.3 * H) });

  // --- 25 singles (13 lost, 12 found) with no counterpart yet ---
  for (let i = 0; i < 25; i++) {
    const cat = weighted(CAT_WEIGHTS);
    const c = CATEGORIES[cat];
    const type = i % 2 === 0 ? 'lost' : 'found';
    const [lw, fw] = pick(COLOUR_PAIRS);
    const word = type === 'lost' ? lw : fw;
    const ms = cap(daysAgoAt(Math.floor(rand() * 13), 8 + rand() * 12));
    const [f1, f2] = [...c.features].sort(() => rand() - 0.5);
    rows.push({
      type, name: makeName(word, cat), category: cat, colour: word, brand: c.brands.length && rand() < 0.8 ? pick(c.brands) : '',
      location: weighted(LOC_WEIGHTS), time: iso(ms),
      description: type === 'lost' ? `Has a ${f1}.` : `Found with ${f1}, ${f2}.`,
      stored_at: type === 'found' ? pick(STORAGE_POINTS) : null, created_at: iso(ms + 0.4 * H)
    });
  }

  // Insert in chronological order, then link reunited pairs.
  rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const byPair = {};
  database.db.exec('BEGIN');
  for (const r of rows) {
    const pair = r._pair;
    delete r._pair;
    const saved = database.insertItem(r);
    if (pair !== undefined) (byPair[pair] ||= []).push(saved.id);
  }
  for (const ids of Object.values(byPair)) {
    database.db.prepare('UPDATE items SET matched_id = ? WHERE id = ?').run(ids[1], ids[0]);
    database.db.prepare('UPDATE items SET matched_id = ? WHERE id = ?').run(ids[0], ids[1]);
  }
  database.db.exec('COMMIT');
  return rows.length;
}

module.exports = { seed };

if (require.main === module) {
  const n = seed({ reset: process.argv.includes('--reset') });
  console.log(n ? `Seeded ${n} records.` : `Database already has ${database.count()} records (use --reset to re-seed).`);
}
