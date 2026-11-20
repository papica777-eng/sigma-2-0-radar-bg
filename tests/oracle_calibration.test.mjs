import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(rootDir, 'docs', 'data');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

const officialsRaw = loadJson('officials_all.json');
const authoritiesRaw = loadJson('authorities_index.json');
const companiesRaw = loadJson('companies_index.json');
const macroRaw = loadJson('sigma3_macro.json');
const deepRaw = loadJson('deep_links.json');
const f7Raw = loadJson('sigma3_forensics_7.json');
const j6Raw = loadJson('sigma3_judicial_6.json');

// Normalize rows identically to app.js
const officials = (officialsRaw.officials || officialsRaw).map((o) => ({
  ...o,
  companies: o.companies || [],
  byAuthority: o.byAuthority || [],
  combinedEur: Number(o.combinedEur || o.totalEur || 0),
  periodEur: Number(o.periodEur || 0),
  totalEur: Number(o.totalEur || 0),
  dzzdEur: Number(o.dzzdEur || 0),
  sigma3Score: Number(o.sigma3Score || 0),
}));

const auths = (authoritiesRaw.rows || authoritiesRaw).map((r) =>
  Array.isArray(r)
    ? { eik: r[0], name: r[1], type: r[2], settlement: r[3], region: r[4], spentEur: Number(r[5] || 0), contracts: Number(r[6] || 0), suppliers: Number(r[7] || 0), avgEur: Number(r[8] || 0), riskScore: Number(r[12] || 0) }
    : r
);

const comps = (companiesRaw.rows || companiesRaw).map((r) =>
  Array.isArray(r)
    ? { eik: r[0], name: r[1], settlement: r[3], wonEur: Number(r[5] || 0), contracts: Number(r[6] || 0), authorities: Number(r[7] || 0), consortiumEur: Number(r[11] || 0), consortiumCount: Number(r[12] || 0) }
    : r
);

// Build lightweight DOM harness to execute real production scripts end-to-end
const messages = [];
const mockBox = {
  innerHTML: '',
  scrollHeight: 0,
  scrollTop: 0,
  appendChild(el) {
    messages.push({ className: el.className, html: el.innerHTML });
  },
};

const sandbox = {
  console,
  Math,
  Date,
  Set,
  Map,
  Array,
  Object,
  Number,
  String,
  Boolean,
  RegExp,
  Float32Array,
  Promise,
  JSON,
  URL: { createObjectURL: () => '' },
  Blob: class {},
  document: {
    getElementById: (id) => (id === 'oracleMessages' ? mockBox : null),
    createElement: () => ({ className: '', innerHTML: '' }),
    querySelectorAll: () => [],
    documentElement: { getAttribute: () => 'light' },
  },
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: () => 0,
  window: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const state = {
  meta: null, // prevent auto initModules
  officials,
  deepBySlug: new Map(),
  macro: macroRaw,
  deep: deepRaw,
  forensics7: f7Raw,
  judicial6: j6Raw,
  comp: {},
};

sandbox.SIGMA3 = {
  state,
  fmtEur: (n) => `€${Number(n || 0).toFixed(0)}`,
  fmtInt: (n) => String(Math.round(Number(n || 0))),
  esc: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  riskBadgeHtml: (sc) => `[${sc}/100]`,
  ensureAuthoritiesLoaded: async () => auths,
  ensureCompaniesLoaded: async () => comps,
  generateSignalBrief: () => {},
  openDossier: () => {},
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(rootDir, 'docs', 'sigma3', 'semantic_dialog_engine.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(rootDir, 'docs', 'sigma3', 'sigma3_modules.js'), 'utf8'), sandbox);

const { askOracle, _testOracle } = sandbox.SIGMA3_MOD;

async function queryOracle(q) {
  messages.length = 0;
  await askOracle(q);
  const aiMsgs = messages.filter((m) => m.className.includes('msg-ai'));
  return aiMsgs[aiMsgs.length - 1]?.html || '';
}

test('1. Exact screenshot bug: "kakvo mojesh da pravish]" answers capabilities cleanly with ZERO false matches or dev jargon', async () => {
  const html = await queryOracle('kakvo mojesh da pravish]');
  assert.match(html, /Какво може NAsvetlo ORACLE/);
  assert.doesNotMatch(html, /Авкова|Право и ИТ|COMPARE|NB TF-IDF|256-D|Cosine|IntentAnchor|Fuzzy Stem Match/);
});

test('2. English & Bulgarian help/greeting prompts route cleanly without false entities', async () => {
  const h1 = await queryOracle('what can you do?');
  assert.match(h1, /Какво може NAsvetlo ORACLE/);
  const h2 = await queryOracle('здравей');
  assert.match(h2, /Готов съм за одитна проверка/);
  const h3 = await queryOracle('zdravei');
  assert.match(h3, /Готов съм за одитна проверка/);
  const h4 = await queryOracle('благодаря');
  assert.match(h4, /Заповядайте/);
  const h5 = await queryOracle('откъде са данните?');
  assert.match(h5, /Обхват и официални първични източници/);
});

test('3. Greeting + real audit entity does NOT swallow the audit request', async () => {
  const html = await queryOracle('здравей, кажи ми всичко за Бургас');
  assert.match(html, /360° Кръстосан одиторски синтез/);
  assert.match(html, /Бургас/i);
});

test('4. Acronym "ВСС" and Latin "vss" resolve directly to ВИСШ СЪДЕБЕН СЪВЕТ (ЕИК 121513231)', async () => {
  const h1 = await queryOracle('Провери ВСС');
  assert.match(h1, /ВИСШ СЪДЕБЕН СЪВЕТ/i);
  assert.match(h1, /121513231/);
  const h2 = await queryOracle('proveri vss');
  assert.match(h2, /ВИСШ СЪДЕБЕН СЪВЕТ/i);
});

test('5. False-trigger guards: "защита при вас" does NOT fire NLP ("шит") or VAS ("вас")', () => {
  const nlu = _testOracle.analyzeNaturalQuery('защита на данните при вас');
  assert.equal(nlu.intents.some((i) => i.id === 'FORENSIC_NLP'), false);
  assert.equal(nlu.intents.some((i) => i.id === 'JUDICIAL_KZK_VAS'), false);
  assert.equal(_testOracle.tokenFuzzyMatchScore('правиш', 'Алианс за равни права'), 0);
  assert.equal(_testOracle.tokenFuzzyMatchScore('апи', 'Капитал ЕООД'), 0);
});

test('6. Smart shlyokavitsa y->ъ vs y->й transliteration', () => {
  assert.equal(_testOracle.latinToCyrillicBg('syd'), 'съд');
  assert.equal(_testOracle.latinToCyrillicBg('tyrg'), 'търг');
  assert.equal(_testOracle.latinToCyrillicBg('zdravey'), 'здравей');
  assert.equal(_testOracle.latinToCyrillicBg('kaji mi za glavbolgarstroi'), 'кажи ми за главболгарстрои');
});

test('7. Real audit queries: АПИ, Главболгарстрой (Latin), Самовъзлагане, АДФИ, ВАС, Сравнение Варна/Пловдив', async () => {
  const hApi = await queryOracle('Какви дела в съда, анекси и жалби в КЗК има за АПИ?');
  assert.match(hApi, /АГЕНЦИЯ|ПЪТНА ИНФРАСТРУКТУРА/i);

  const hGbs = await queryOracle('kaji mi za glavbolgarstroi i patinjenering');
  assert.match(hGbs, /ГЛАВБОЛГАРСТРОЙ/i);

  const hSelf = await queryOracle('Кои кметове си дават поръчки сами на себе си?');
  assert.match(hSelf, /самовъзлагане/i);

  const hAdfi = await queryOracle('Покажи отменените глоби на АДФИ в съда');
  assert.match(hAdfi, /АДФИ Индекс на безнаказаността/);

  const hVas = await queryOracle('Какви са окончателните решения на ВАС по жалби срещу КЗК?');
  assert.match(hVas, /Върховен административен съд/);

  const hComp = await queryOracle('Сравни област Варна и област Пловдив');
  assert.match(hComp, /Сравнителен криминалистичен профил/);
  assert.match(hComp, /Варна/);
  assert.match(hComp, /Пловдив/);
});

test('8. Gibberish / unknown queries abstain honestly with ZERO hallucinated COMPARE or random companies', async () => {
  const h = await queryOracle('blabla qwerty xyz123');
  assert.match(h, /Не открих точен субект/);
  assert.doesNotMatch(h, /COMPARE|IntentAnchor|NB TF-IDF|256-D|Авкова/);
});
