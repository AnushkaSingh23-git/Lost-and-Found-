// End-to-end API test. Runs against a fresh in-memory database, so your real data is untouched.
process.env.LF_DB = ':memory:';
const assert = require('assert');
const { server } = require('./server');
const testVector = process.argv.includes('--vector');

let base;
const call = async (path, body) => {
  const res = await fetch(base + path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  return { status: res.status, data: await res.json() };
};
const fmt = iso => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

(async () => {
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  let ok = 0;
  const pass = msg => { ok++; console.log('  ✔ ' + msg); };

  // 1. Seed data + stats
  const stats = (await call('/api/stats')).data;
  assert.strictEqual(stats.totals.all, 150);
  pass(`150 seeded records (${stats.totals.lost} lost, ${stats.totals.found} found, ${stats.totals.reunited} reunited)`);
  console.log('    Top 3 most-lost items:', stats.topItems.map(i => `${i.name} (${i.count})`).join(', '));
  console.log('    Top 3 hotspots:       ', stats.topLocations.map(l => `${l.name} (${l.total})`).join(', '));

  // 2. The required scenario: "Lost: Grey hoodie, Library, yesterday at 4 PM."
  const text = 'Lost: Grey hoodie, Library, yesterday at 4 PM.';
  const parsed = (await call('/api/parse', { text })).data;
  assert.strictEqual(parsed.type, 'lost');
  assert.strictEqual(parsed.location, 'Central Library');
  assert.strictEqual(parsed.colour, 'Grey');
  assert.strictEqual(new Date(parsed.time).getHours(), 16);
  pass(`Parsed "${text}" → ${parsed.name} | ${parsed.colour} | ${parsed.location} | ${fmt(parsed.time)}`);

  const lost = await call('/api/lost', parsed);
  assert.strictEqual(lost.status, 201);
  const { item, matches, alert } = lost.data;
  pass(`Saved lost report #${item.id}; ${matches.length} matches returned`);
  console.log('\n    Score  Found item                 Location           Found at');
  for (const m of matches) {
    console.log(`    ${String(m.score + '%').padEnd(6)} ${m.item.name.padEnd(26)} ${m.item.location.padEnd(18)} ${fmt(m.item.time)}`);
  }
  console.log();
  assert.ok(matches.length >= 1);
  assert.strictEqual(matches[0].item.name, 'Grey Nike hoodie');
  assert.ok(matches[0].score >= 80, 'best match should score highly');
  assert.ok(matches.every(m => m.item.category === 'Hoodie'), 'only hoodies/sweatshirts should match');
  assert.ok(alert && alert.score >= 60);
  pass(`Best match is the grey hoodie handed in at the library (${matches[0].score}%) and a match alert fired`);

  // 3. Saved and retrievable
  const again = (await call(`/api/items/${item.id}/matches`)).data;
  assert.strictEqual(again.item.name, 'Grey hoodie');
  assert.deepStrictEqual(again.matches.map(m => m.score), matches.map(m => m.score));
  pass('Report persisted and matches are reproducible via GET /api/items/:id/matches');
  const vecStatus = await call('/api/vector/status');
  assert.strictEqual(vecStatus.status, 200);
  assert.strictEqual(typeof vecStatus.data.available, 'boolean');
  assert.ok(vecStatus.data.endpoint && vecStatus.data.model);
  pass(`Vector status endpoint responded (available=${vecStatus.data.available}, model=${vecStatus.data.model})`);

  if (testVector) {
    assert.strictEqual(vecStatus.data.available, true, 'LM Studio embedding server must be reachable for --vector tests');
    assert.strictEqual(vecStatus.data.modelLoaded, true, `Configured model ${vecStatus.data.model} must be loaded`);
    const response = await call(`/api/vector/items/${item.id}/matches`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.data.mode, 'vector');
    assert.strictEqual(response.data.matches[0].item.id, matches[0].item.id);
    assert.ok(response.data.matches[0].breakdown.semantic > 0);
    assert.strictEqual(response.data.matches[0].breakdown.category, 100);
    const afterFirstStatus = (await call('/api/vector/status')).data;
    assert.ok(afterFirstStatus.indexedCount > 0, 'candidate embeddings should be persisted in SQLite');
    pass(`Vector search ranks the seeded grey hoodie first and cached ${afterFirstStatus.indexedCount} embeddings in SQLite`);
  }

  // 4. Synonym matching: "Navy bottle" ↔ "Blue water bottle"
  const f = (await call('/api/found', { name: 'Blue water bottle', location: 'Main Cafeteria', time: new Date().toISOString(), stored_at: 'Security Desk' })).data;
  const l = (await call('/api/lost', { name: 'Navy bottle', location: 'Main Cafeteria', time: new Date(Date.now() - 3600e3).toISOString() })).data;
  const hit = l.matches.find(m => m.item.id === f.item.id);
  assert.ok(hit && hit.score >= 80);
  pass(`"Navy bottle" matches "Blue water bottle" at ${hit.score}% (${hit.reasons.join('; ')})`);
  if (testVector) {
    const vector = await call(`/api/vector/items/${l.item.id}/matches`);
    assert.strictEqual(vector.data.matches[0].item.id, f.item.id);
    pass(`Vector search ranks "Blue water bottle" first for "Navy bottle" (${vector.data.matches[0].score}%)`);
  }

  // 5. Reunite
  const r = await call(`/api/items/${item.id}/reunite`, { matchId: matches[0].item.id });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.item.status, 'reunited');
  assert.strictEqual(r.data.matchedWith.status, 'reunited');
  const dup = await call(`/api/items/${item.id}/reunite`, { matchId: matches[0].item.id });
  assert.strictEqual(dup.status, 409);
  const after = (await call('/api/stats')).data;
  assert.strictEqual(after.totals.reunited, stats.totals.reunited + 2);
  pass('Marked as Reunited (both reports closed, double-reunite rejected, stats updated)');
  if (testVector) {
    const closed = await call(`/api/vector/items/${item.id}/matches`);
    assert.deepStrictEqual(closed.data.matches, []);
    const report = { location: 'Main Cafeteria', time: new Date().toISOString() };
    const found = await call('/api/vector/found', {
      ...report, name: 'Protractor', description: 'Clear semicircular angle measuring tool'
    });
    const lost = await call('/api/vector/lost', {
      ...report, name: 'Geometry angle measurer', description: 'A transparent half-circle for measuring degrees'
    });
    assert.strictEqual(found.status, 201);
    assert.strictEqual(lost.status, 201);
    assert.strictEqual(found.data.mode, 'vector');
    assert.strictEqual(lost.data.mode, 'vector');
    assert.strictEqual(found.data.item.category, null);
    assert.strictEqual(lost.data.item.category, null);
    assert.strictEqual(lost.data.matches[0].item.id, found.data.item.id);
    assert.ok(lost.data.alert && lost.data.alert.score >= 68, 'vector alert should fire above threshold 68');
    const original = await call(`/api/items/${lost.data.item.id}/matches`);
    assert.strictEqual(original.data.item.id, lost.data.item.id);
    assert.deepStrictEqual(original.data.matches, []);
    pass(`Vector search matched an uncategorized protractor paraphrase (${lost.data.matches[0].score}%) and fired alert`);

    // Semantic Browse Search
    const semSearch = await call('/api/vector/search?q=' + encodeURIComponent('half circle degree tool') + '&type=found&status=open');
    assert.strictEqual(semSearch.status, 200);
    assert.strictEqual(semSearch.data.mode, 'vector');
    assert.ok(semSearch.data.results.some(r => r.item.id === found.data.item.id), 'semantic search should find Protractor from paraphrase');
    pass(`Semantic browse search found "${found.data.item.name}" for query "half circle degree tool"`);

    // Cross-category exclusion
    const backpack = await call('/api/vector/lost', {
      name: 'Orange hiking backpack', colour: 'Orange', location: 'Bus Stop',
      time: new Date().toISOString(), description: 'Large camping rucksack with aluminum frame'
    });
    assert.strictEqual(backpack.status, 201);
    assert.ok(backpack.data.matches.every(m => !m.item.category || m.item.category === 'Backpack'));
    pass('Vector search respects category boundaries');
  }

  // 6. Validation
  const bad = await call('/api/lost', { name: '', location: 'Mars' });
  assert.strictEqual(bad.status, 400);
  pass('Invalid reports are rejected with a helpful message: "' + bad.data.error + '"');

  console.log(`\n  All ${ok} checks passed.\n`);
  server.close();
})().catch(e => { console.error('\n  ✘ TEST FAILED:', e.message); process.exit(1); });
