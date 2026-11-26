import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dataPath = path.resolve('docs/data/nasvetlo_eiss_audit.json');
const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);

// Identical legal entity / public institution check as scripts/sync_nasvetlo_eiss_audit.py
const LEGAL_ENTITY_RE =
  /(?:ООД|ЕООД|ЕАД|ДЗЗД|АДСИЦ|ОБЩИНА|АГЕНЦИЯ|МИНИСТЕРСТВО|ДИРЕКЦИЯ|ПРОКУРАТУРА|ОБЛАСТН|БАНКА|ЗАСТРАХОВА|УНИВЕРСИТЕТ|БОЛНИЦА|УМБАЛ|МБАЛ|КОМИСИЯ|СЪВЕТ|ФОНД|СДРУЖЕНИЕ|ФОНДАЦИЯ|КООПЕРАЦИЯ)|(?<![А-ЯЁA-Z0-9])(?:АД|ЕТ|ДП|КД|СД|НАП|НОИ|НЗОК|ДФЗ|ОДМВР|МВР|СДВР)(?![А-ЯЁA-Z0-9])/i;

test('EISS audit universe covers >= 98% of reported totals across >= 100 courts and >= 1000 judges', () => {
  const sumReported = Object.values(data.universe.reportedTotals || {}).reduce(
    (acc, v) => acc + Number(v || 0),
    0,
  );
  assert.ok(sumReported > 0, 'reportedTotals sum must be positive');
  assert.ok(
    data.universe.casesUnique >= 0.98 * sumReported,
    `casesUnique (${data.universe.casesUnique}) < 0.98 * reportedTotals (${sumReported})`,
  );
  assert.ok(data.universe.courts >= 100, `Expected >= 100 courts, got ${data.universe.courts}`);
  assert.ok(data.universe.judges >= 1000, `Expected >= 1000 judges, got ${data.universe.judges}`);
});

test('All RED flags meet statistical thresholds (q < 0.01, k >= 5, ratio >= 3) and are sorted by q ascending', () => {
  assert.ok(Array.isArray(data.redFlags));
  let prevQ = -1;
  for (const rf of data.redFlags) {
    assert.ok(rf.q < 0.01, `RED flag q >= 0.01: ${rf.q}`);
    assert.ok(rf.k >= 5, `RED flag k < 5: ${rf.k}`);
    assert.ok(rf.ratio >= 3, `RED flag ratio < 3: ${rf.ratio}`);
    assert.ok(Array.isArray(rf.sampleCases) && rf.sampleCases.length >= 1, 'RED flag must include >= 1 sampleCase');
    assert.ok(rf.q >= prevQ, `redFlags not sorted by q ascending: ${rf.q} < ${prevQ}`);
    prevQ = rf.q;
  }
});

test('All party names in flags pass the legal-entity/institution regex (no natural persons)', () => {
  for (const flag of [...data.redFlags, ...data.amberFlags]) {
    assert.ok(
      LEGAL_ENTITY_RE.test(flag.party),
      `Party failed legal-entity filter: ${flag.party}`,
    );
  }
});

test('Zero 10-digit EGN strings anywhere in raw JSON output (GDPR)', () => {
  assert.equal(/\b\d{10}\b/.test(raw), false, 'Found 10-digit EGN-like sequence in JSON output');
});
