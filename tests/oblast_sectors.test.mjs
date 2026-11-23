import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raw = fs.readFileSync(path.resolve('docs/data/nasvetlo_oblast_sectors.json'), 'utf8');
const data = JSON.parse(raw);

const EXPECTED_SECTORS = [
  'health',
  'infrastructure',
  'agriculture',
  'energy',
  'transport',
  'municipalities',
  'security_it',
];

test('28-oblast x 7-sphere dataset covers all 28 NUTS-3 regions and all 7 spheres (196 cells)', () => {
  assert.equal(data.oblasts.length, 28);
  assert.equal(data.sectorsMeta.length, 7);
  assert.ok(data.matchedContracts > 190000, `Expected >190k matched ZOP contracts, got ${data.matchedContracts}`);

  const nutsSet = new Set();
  for (const ob of data.oblasts) {
    nutsSet.add(ob.nuts3);
    assert.ok(ob.overallCorruptionIndex >= 5 && ob.overallCorruptionIndex <= 99);
    for (const sid of EXPECTED_SECTORS) {
      const s = ob.sectors[sid];
      assert.ok(s, `Missing sector ${sid} in ${ob.name}`);
      assert.ok(s.riskScore >= 5 && s.riskScore <= 99, `Out-of-range score in ${ob.name}/${sid}`);
      assert.ok(Number.isFinite(s.valueEur) && s.valueEur >= 0);
      assert.ok(Array.isArray(s.extraMetrics) && s.extraMetrics.length >= 3);
    }
  }
  assert.equal(nutsSet.size, 28);
});

test('National sector volumes reflect verified ZOP totals and zero quoted EGN PII', () => {
  const byId = new Map(data.sectorsMeta.map((s) => [s.id, s]));
  assert.ok(byId.get('infrastructure').nationalValueEur > 15_000_000_000);
  assert.ok(byId.get('health').nationalValueEur > 6_000_000_000);
  assert.ok(byId.get('agriculture').nationalValueEur > 1_000_000_000);
  assert.equal(/"\d{10}"/.test(raw), false, 'Must contain zero quoted 10-digit EGN strings');
});
