const { once } = require('node:events');

process.env.LF_DB = ':memory:';
const database = require('./db');
const { LOCATIONS } = require('./data');
const { server } = require('./server');
const { model } = require('./vector-matcher');

// Each row describes one item using the finder's wording and the owner's wording.
const paraphrases = [
  ['Protractor', 'Clear semicircular angle measuring tool', 'Geometry angle measurer', 'A transparent half-circle for measuring degrees'],
  ['Wireless gamepad', 'Black plastic with dual thumbsticks and a scratched trigger', 'Video game controller', 'Two analog sticks and scuff on the rear button'],
  ['Stapler', 'Small red metal office supply with silver base', 'Paper fastener', 'Red desktop tool for pinning sheets together'],
  ['Bicycle helmet', 'Matte shell with air vents and adjustable chin buckle', 'Cycling head protection', 'Vented protective shell with an adjustable strap'],
  ['Measuring tape', 'Retractable metric strip, yellow casing', 'Retractable ruler', 'Yellow housing with a metal measuring strip'],
  ['Drawing compass', 'Metal legs and sharp pivot with pencil clamp', 'Drafting circle tool', 'Hinged instrument holds a lead and draws arcs'],
  ['Lunchbox', 'Rectangular teal case with layered food compartments', 'Bento container', 'Stacked food trays with teal lid'],
  ['Blue flash drive', 'Small metal body with 32GB marking', 'Thumb drive', 'Little blue storage device marked 32GB'],
  ['Power bank', 'White rectangular battery for charging another device', 'Portable battery pack', 'White backup battery with a charge indicator'],
  ['Blue jean jacket', 'Denim with a sewn flower patch on one sleeve', 'Denim coat', 'Blue clothing with embroidered flower on arm'],
  ['Insulated tumbler', 'Purple stainless steel with a sliding sip lid', 'Travel mug', 'Vacuum-insulated purple cup with a sliding opening'],
  ['Gray sweatshirt', 'Front pocket and frayed left sleeve', 'Graphite hoodie', 'Large front pouch and torn cuff'],
  ['Optical mouse', 'Black wireless device with a wheel and a loose cover', 'Wireless pointing device', 'Small black computer peripheral with a scroll wheel'],
  ['Soccer cleats', 'White pairs with blue studs and scuffed toes', 'Football boots', 'White sports footwear with blue spikes'],
  ['Ukulele', 'Compact wooden instrument with four strings', 'Miniature guitar', 'Small wooden four-string instrument'],
  ['Mechanical pencil', 'Silver push button and pink eraser', 'Propelling pencil', 'Silver lead holder with clickable top'],
  ['Mustard umbrella', 'Yellow folding canopy with bent spoke', 'Yellow rain parasol', 'Portable rain shield with one damaged rib'],
  ['Pink stationery pouch', 'Canvas with three pen slots and a zipper', 'Magenta pencil case', 'Fabric zip container with slots for writing supplies']
];

const absentItems = [
  ['Electric cello', 'Full-size purple instrument with a missing bridge'],
  ['Rubiks cube', 'White frame with a few peeling tiles'],
  ['Badminton racket', 'Broken strings and a red handle'],
  ['Harmonica', 'Ten-hole brass mouth organ in velvet'],
  ['Purple yoga mat', 'Long foam roll with matching straps'],
  ['Slide trombone', 'Dented bell and black hard-shell case'],
  ['North Face charcoal hoodie', 'Neon green sleeves and a stitched robotics club emblem'],
  ['Navy Yeti water bottle', 'Bright orange lid and hand-painted moon motif'],
  ['Green Dell laptop charger', 'Right angle connector and braided bright green lead'],
  ['Pink campus ID card', 'Glitter case with a purple owl clip'],
  ['White calculator', 'Gold buttons and a triangular cover'],
  ['Black headphones', 'Orange ear cushions and a cracked green headband']
];

const matchers = [
  { label: 'Fuzzy', route: '/api/items' },
  { label: 'Vector', route: '/api/vector/items' }
];
const hour = 3600000;
const now = Date.now();
let randomState = 846217;

function random() {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 2 ** 32;
}

function shuffled(values) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickLocation() {
  return LOCATIONS[Math.floor(random() * LOCATIONS.length)];
}

function iso(time) {
  return new Date(time).toISOString();
}

function insertParaphrase(row, index) {
  const [foundName, foundDescription, lostName, lostDescription] = row;
  const place = pickLocation();
  const time = now - Math.floor(6 + random() * 132) * hour;
  const found = database.insertItem({
    type: 'found', name: foundName, description: foundDescription,
    location: index % 4 === 0 ? place.near[0] : place.id,
    time: iso(time + (1 + Math.floor(random() * 5)) * hour)
  });
  const lost = database.insertItem({
    type: 'lost', name: lostName, description: lostDescription, location: place.id, time: iso(time)
  });
  return { id: lost.id, target: found.id };
}

async function evaluate(base, cases) {
  const results = matchers.map(({ label }) => ({ label, ranks: [], suggestions: 0, alerts: 0 }));
  for (const { id, target } of cases) {
    for (const [index, { route }] of matchers.entries()) {
      const response = await fetch(`${base}${route}/${id}/matches`);
      const data = await response.json();
      if (!response.ok) throw new Error(`${route} returned ${response.status}: ${data.error}`);
      const { matches, alertThreshold } = data;
      const rank = matches.findIndex(match => match.item.id === target) + 1;
      const result = results[index];
      result.ranks.push(rank);
      if (matches.length) result.suggestions++;
      if (matches[0]?.score >= alertThreshold) result.alerts++;
    }
  }
  return results;
}

async function rankSummary(base, group, cases) {
  return (await evaluate(base, cases)).map(({ label, ranks }) => {
    const hitRate = maxRank => `${ranks.filter(rank => rank > 0 && rank <= maxRank).length}/${cases.length}`;
    return { Group: group, Matcher: label, 'Top 1': hitRate(1), 'Top 3': hitRate(3), 'Top 6': hitRate(6) };
  });
}

async function main() {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Comparing fuzzy and vector matching using ${model}`);

  const linked = database.listItems({ type: 'lost', status: 'reunited' })
    .filter(item => item.matched_id)
    .map(item => ({ id: item.id, target: item.matched_id }));
  const setLinkedStatus = database.db.prepare('UPDATE items SET status = ? WHERE matched_id IS NOT NULL');
  setLinkedStatus.run('open');
  const ranks = await rankSummary(base, 'Seeded pairs', shuffled(linked));
  setLinkedStatus.run('reunited');

  const fresh = shuffled(paraphrases).map(insertParaphrase);
  ranks.push(...await rankSummary(base, 'Paraphrases with descriptions', fresh));
  const clearDescription = database.db.prepare("UPDATE items SET description = '' WHERE id = ?");
  for (const { id } of fresh) clearDescription.run(id);
  ranks.push(...await rankSummary(base, 'Paraphrases without lost descriptions', fresh));
  console.table(ranks);

  const absent = shuffled(absentItems).map(([name, description]) => database.insertItem({
    type: 'lost', name, description, location: pickLocation().id,
    time: iso(now - (2 + Math.floor(random() * 96)) * hour)
  }));
  console.log('Reports with no known counterpart');
  console.table((await evaluate(base, absent)).map(({ label, suggestions, alerts }) => ({
    Matcher: label, Suggestions: `${suggestions}/${absent.length}`, 'False alerts': `${alerts}/${absent.length}`
  })));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => server.close());
