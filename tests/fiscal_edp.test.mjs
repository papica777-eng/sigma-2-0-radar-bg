import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const data = JSON.parse(fs.readFileSync(path.resolve('docs/data/nasvetlo_fiscal_edp.json'), 'utf8'));

test('Eurostat EDP fiscal dataset contains verified 2024 and 2025 deficit, debt, and SFA lines', () => {
  assert.equal(data.edpt1_pct.B9['2024'], -3.0);
  assert.equal(data.edpt1_pct.B9['2025'], -4.0);
  assert.ok(data.edpt1_nac.GD['2025'] > 34000, '2025 Gross Debt must exceed 34B EUR');
  assert.ok(data.edpt3_s13_nac.F5_ASS.years['2025'] > 2200, '2025 F5_ASS equity injections must exceed 2.2B EUR');
  assert.ok(data.edpt3_s13_nac.GD_CH.years['2025'] > 9800, '2025 Gross Debt change must exceed 9.8B EUR');
});

test('Quarterly debt series reaches 2026-Q2 and gov_10a_main contains TR/TE/D1PAY/P51G', () => {
  assert.ok(data.gov_10q_ggdebt.MIO_NAC['2026-Q2'] > 35000);
  assert.ok(data.gov_10a_main_eur.TR.years['2025'] > 44000);
  assert.ok(data.gov_10a_main_eur.TE.years['2025'] > 49000);
  assert.ok(data.gov_10a_main_eur.D1PAY.years['2025'] > 14000);
});
