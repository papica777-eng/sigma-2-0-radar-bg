import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('docs/data/nasvetlo_telk_radar.json');
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

test('TELK radar dataset contains all 28 Bulgarian NUTS-3 oblasts with valid scores', () => {
  assert.equal(data.oblasts.length, 28);
  const nutsSet = new Set(data.oblasts.map((o) => o.nuts3));
  assert.equal(nutsSet.size, 28);
  for (const o of data.oblasts) {
    assert.ok(o.population2025 > 50000, `Invalid population for ${o.name}`);
    assert.ok(o.invPensioners2025 > 1000, `Invalid pensioners for ${o.name}`);
    assert.ok(Number.isFinite(o.per1000Pop2025) && o.per1000Pop2025 > 20 && o.per1000Pop2025 < 250);
    assert.ok(o.telkRiskScore >= 5 && o.telkRiskScore <= 99);
    assert.ok(['CRITICAL', 'HIGH', 'ELEVATED', 'BASELINE'].includes(o.riskTier));
    assert.ok(o.invSpendEur2025 > 10_000_000, `Unexpectedly low total est. spend for ${o.name}`);
  }
});

test('NSI 2025 population across 28 oblasts sums exactly to national total', () => {
  const sumPop = data.oblasts.reduce((acc, o) => acc + o.population2025, 0);
  assert.equal(sumPop, data.national.population2025);
});

test('Top anomaly regions (Kardzhali, Silistra, Vratsa) reflect NOI 2023-2025 ground truth', () => {
  const byName = new Map(data.oblasts.map((o) => [o.name, o]));
  const kardzhali = byName.get('Кърджали');
  const silistra = byName.get('Силистра');
  const vratsa = byName.get('Враца');
  assert.ok(kardzhali.growth2yPct > 30, 'Kardzhali 2Y growth should exceed 30%');
  assert.ok(silistra.per1000Pop2025 > 140, 'Silistra prevalence should exceed 140/1000');
  assert.ok(vratsa.tnrOver90Pct > 24, 'Vratsa >90% TNR share should exceed 24%');
});

test('Root-cause protocol has 5 chain steps and strictly zero PII/EGN strings', () => {
  assert.equal(data.rootCauseProtocol.chainSteps.length, 5);
  assert.ok(data.rootCauseProtocol.institutionalDataRequests.length >= 3);
  assert.equal(/"\d{10}"/.test(raw), false, 'Dataset must contain zero 10-digit quoted EGN strings');
  assert.equal(/"(egn|patientName|personName|medicalRecord)"/i.test(raw), false, 'Dataset must contain zero PII fields');
});
