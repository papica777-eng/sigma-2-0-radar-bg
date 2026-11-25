import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('ot-mrak-kam-svetlina.html is built and contains countdown gate for 2026-11-26T12:00:00+02:00 + 6 ministry sectors', () => {
  const htmlPath = path.join(root, 'docs', 'ot-mrak-kam-svetlina.html');
  assert.ok(fs.existsSync(htmlPath), 'docs/ot-mrak-kam-svetlina.html must exist');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /data-unlock-at="2026-11-26T12:00:00\+02:00"/);
  assert.match(html, /От мрак към светлина/);
  assert.match(html, /id="svetlinaVaultContent"\s+hidden/);
  assert.match(html, /ot_mrak_kam_svetlina\.js/);
  assert.match(html, /svetlina-radar-svg/);
  assert.match(html, /Шестосев криминалистичен радар/);
  assert.match(html, /Мрежов граф/);
  assert.match(html, /data-svet-sector="mrrb"/);
  assert.match(html, /data-svet-sector="mvr"/);
  assert.match(html, /data-svet-sector="mf"/);
  assert.match(html, /data-svet-sector="me"/);
  assert.match(html, /data-svet-sector="mz"/);
  assert.match(html, /data-svet-sector="mun"/);
  assert.match(html, /data-svet-tab="cartel"/);
  assert.match(html, /data-svet-tab="eppo"/);
  assert.doesNotMatch(html, /Велкова/);
  assert.doesNotMatch(html, /Занева/);
  assert.doesNotMatch(html, /20\.Д-72/);
  assert.doesNotMatch(html, /94-00-322/);
  assert.doesNotMatch(html, /Вх\. №/);
  assert.match(html, /презумпцията за невиновност/);
});

test('ot_mrak_kam_svetlina.js exists and handles unlock + ministry sector filtering', () => {
  const jsPath = path.join(root, 'docs', 'sigma3', 'ot_mrak_kam_svetlina.js');
  assert.ok(fs.existsSync(jsPath), 'docs/sigma3/ot_mrak_kam_svetlina.js must exist');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.match(js, /unlockNow/);
  assert.match(js, /svetlinaSearchInput/);
  assert.match(js, /data-svet-sector/);
  assert.match(js, /subtle\.digest/);
  assert.doesNotMatch(js, /aeterna1200/);
});
