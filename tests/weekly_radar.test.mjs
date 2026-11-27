import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { computeWeeklyDiff, flagKey } from '../scripts/weekly_radar_diff.mjs';

const root = path.resolve(import.meta.dirname, '..');
const EXPECTED_RAW_SHA256 = 'b6a49ec4644042f43657c10d413e5d055cb3f1e04b57fa3595565999fdec2bc3';
const EXCLUDED_RE = /росица.*велкова|велкова-желева|поля.*занева|занева-димитрова/i;

test('computeWeeklyDiff detects added, escalated, resolved RED flags and KPI deltas accurately', () => {
  const prev = {
    universe: { casesUnique: 2234000, redFlagsTotal: 2, unexplainedRedTotal: 1 },
    flags: [
      {
        courtName: 'Софийски районен съд',
        caseKind: 'Гражданско дело',
        year: 2026,
        party: 'ФИРМА АЛФА ООД',
        judge: 'Съдия Първи',
        k: 10,
        nParty: 20,
        ratio: 4.0,
        q: 0.001,
      },
      {
        courtName: 'РС Пловдив',
        caseKind: 'Търговско дело',
        year: 2026,
        party: 'ФИРМА БЕТА АД',
        judge: 'Съдия Втори',
        k: 8,
        nParty: 12,
        ratio: 5.5,
        q: 0.002,
      },
    ],
  };

  const curr = {
    universe: { casesUnique: 2234509, redFlagsTotal: 2, unexplainedRedTotal: 2 },
    redFlags: [
      {
        courtName: 'Софийски районен съд',
        caseKind: 'Гражданско дело',
        year: 2026,
        party: 'ФИРМА АЛФА ООД',
        partyEik: '123456789',
        judge: 'Съдия Първи',
        k: 14,
        nParty: 22,
        ratio: 4.8,
        q: 0.0001,
        explanationTier: 'UNEXPLAINED_PRIORITY',
      },
      {
        courtName: 'СГС',
        caseKind: 'Търговско дело',
        year: 2026,
        party: 'НОВА КОМПАНИЯ ЕООД',
        partyEik: '987654321',
        judge: 'Съдия Трети',
        k: 9,
        nParty: 10,
        ratio: 6.2,
        q: 0.0005,
        explanationTier: 'UNEXPLAINED_PRIORITY',
      },
    ],
  };

  const diff = computeWeeklyDiff(prev, curr);
  assert.equal(diff.addedRedFlags.length, 1);
  assert.equal(diff.addedRedFlags[0].party, 'НОВА КОМПАНИЯ ЕООД');
  assert.equal(diff.escalatedRedFlags.length, 1);
  assert.equal(diff.escalatedRedFlags[0].prevK, 10);
  assert.equal(diff.escalatedRedFlags[0].k, 14);
  assert.equal(diff.resolvedRedFlags.length, 1);
  assert.equal(diff.resolvedRedFlags[0].party, 'ФИРМА БЕТА АД');
  assert.equal(diff.deltas.casesUnique, 509);
  assert.equal(diff.deltas.unexplainedRedTotal, 1);
  assert.ok(flagKey(diff.addedRedFlags[0]).includes('НОВА КОМПАНИЯ ЕООД'));
});

test('Weekly baseline & bulletin files exist, cite Zenodo DOI & raw SHA-256, and contain 0 EGNs', () => {
  const baselinePath = path.join(root, 'docs', 'data', 'eiss_weekly_baseline.json');
  const bulletinPath = path.join(root, 'docs', 'data', 'nasvetlo_weekly_bulletin.json');
  assert.ok(fs.existsSync(baselinePath), 'docs/data/eiss_weekly_baseline.json must exist');
  assert.ok(fs.existsSync(bulletinPath), 'docs/data/nasvetlo_weekly_bulletin.json must exist');

  const rawBase = fs.readFileSync(baselinePath, 'utf8');
  const rawBull = fs.readFileSync(bulletinPath, 'utf8');
  const base = JSON.parse(rawBase);
  const bull = JSON.parse(rawBull);

  assert.equal(base.flags.length, 869);
  assert.equal(bull.rawFileSha256, EXPECTED_RAW_SHA256);
  assert.equal(bull.zenodoDoi, '10.5281/zenodo.24580253');
  assert.equal(bull.totals.casesUnique, 2234509);
  assert.equal(/\b\d{10}\b/.test(rawBase), false, 'Zero 10-digit EGN sequences in baseline');
  assert.equal(/\b\d{10}\b/.test(rawBull), false, 'Zero 10-digit EGN sequences in bulletin');
  for (const f of base.flags) {
    assert.equal(EXCLUDED_RE.test(f.judge || ''), false, `Excluded judge matched: ${f.judge}`);
    assert.equal(EXCLUDED_RE.test(f.party || ''), false, `Excluded party matched: ${f.party}`);
  }
});

test('Weekly GitHub Actions workflow exists with Monday cron schedule and full build/test pipeline', () => {
  const wfPath = path.join(root, '.github', 'workflows', 'weekly_radar_sync.yml');
  assert.ok(fs.existsSync(wfPath), '.github/workflows/weekly_radar_sync.yml must exist');
  const wf = fs.readFileSync(wfPath, 'utf8');
  assert.match(wf, /cron:\s*'0 6 \* \* 1'/);
  assert.match(wf, /workflow_dispatch/);
  assert.match(wf, /weekly_radar_diff\.mjs/);
  assert.match(wf, /npm run build/);
  assert.match(wf, /node --test/);
});
