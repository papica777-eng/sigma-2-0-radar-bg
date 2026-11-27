import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dataPath = path.join(root, 'docs', 'data', 'nasvetlo_network_graph.json');
const htmlPath = path.join(root, 'docs', 'mrezhata.html');
const astroPath = path.join(root, 'src', 'pages', 'mrezhata.astro');
const scssPath = path.join(root, 'src', 'styles', 'components', '_mrezhata.scss');
const enginePath = path.join(root, 'docs', 'sigma3', 'mrezhata_engine.js');
const sitemapPath = path.join(root, 'docs', 'sitemap.xml');
const weeklyPath = path.join(root, 'scripts', 'weekly_radar_diff.mjs');

// Strict Emoji Guard: blocks ALL color/pictographic emojis and BMP symbol emojis (🏢⚖🏛💼👔📁🚨💰📊🛡📬🔍⚡✅🔥)
// while permitting typographic arrows (↔ ↗) and legal symbols (©)
const EMOJI_RE = /[\p{Emoji_Presentation}\u2600-\u27BF]/gu;

describe('Forensic Network Graph v2.0 (Мрежата)', () => {
  it('nasvetlo_network_graph.json exists, is valid JSON, and has canonical EIK deduplication', () => {
    assert.ok(fs.existsSync(dataPath), 'nasvetlo_network_graph.json must exist');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.ok(data.summary, 'summary object must exist');
    assert.ok(Array.isArray(data.nodes), 'nodes array must exist');
    assert.ok(Array.isArray(data.edges), 'edges array must exist');
    assert.ok(Array.isArray(data.clusters), 'clusters array must exist');

    // Canonical EIK deduplication: no two entity nodes share the same EIK
    const seenEiks = new Map();
    for (const n of data.nodes) {
      if (n.eik && (n.type === 'company' || n.type === 'authority' || n.type === 'lawyer')) {
        assert.ok(
          !seenEiks.has(n.eik),
          `Duplicate EIK ${n.eik} found across nodes: ${seenEiks.get(n.eik)} and ${n.id}`
        );
        seenEiks.set(n.eik, n.id);
      }
    }
  });

  it('nodes, edges, Brandes centrality, PageRank, and featured paths meet strict thresholds', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.ok(data.nodes.length >= 250, `Expected >= 250 nodes, got ${data.nodes.length}`);
    assert.ok(data.edges.length >= 250, `Expected >= 250 edges, got ${data.edges.length}`);
    assert.ok(data.summary.totalCases >= 40, `Expected >= 40 cases, got ${data.summary.totalCases}`);
    assert.ok(data.summary.bridgeNodesCount >= 10, `Expected >= 10 multi-cluster bridges, got ${data.summary.bridgeNodesCount}`);
    assert.ok(data.summary.totalInvestigatedResourceEur >= 5e9, 'Total resource should exceed €5 billion');
    assert.ok(Array.isArray(data.summary.featuredPaths) && data.summary.featuredPaths.length >= 3, 'Must include >= 3 verified multi-hop featured paths');

    const nodeIds = new Set(data.nodes.map((n) => n.id));
    assert.equal(nodeIds.size, data.nodes.length, 'All node IDs must be strictly unique');

    // Type sum parity
    const typeSum =
      data.summary.totalCompanies +
      data.summary.totalAuthorities +
      data.summary.totalJudges +
      data.summary.totalLawyers +
      data.summary.totalOfficials +
      data.summary.totalCases +
      (data.summary.totalUbos || 0);
    assert.equal(typeSum, data.summary.totalNodes, 'Sum of category counts must exactly match totalNodes');
    assert.ok((data.summary.totalUbos || 0) >= 20, `Expected >= 20 verified ZMIП UBO nodes, got ${data.summary.totalUbos}`);
    assert.ok(data.edges.some((e) => e.kind === 'beneficial_owner'), 'Must include beneficial_owner edges');
    assert.ok(data.edges.some((e) => e.kind === 'holding_control'), 'Must include holding_control edges');
    assert.ok(data.edges.some((e) => e.kind === 'consortium_member'), 'Must include consortium_member edges');

    // Core verified UBO natural persons must be present and linked
    for (const uboName of ['ГРИГОР ЦВЕТКОВ ИВАНОВ', 'КАМЕН СИМЕОНОВ ПЕШОВ', 'ВЕЛИКО ДИМИТРОВ ЖЕЛЕВ', 'ДИМИТЪР ВЕЛИКОВ ЖЕЛЕВ', 'ДИМО ХРИСТОВ ДИМОВ', 'ХРИСТО АСЕНОВ САВЕВ']) {
      const hit = data.nodes.find((n) => n.type === 'ubo' && n.label.toUpperCase() === uboName);
      assert.ok(hit, `Expected verified ZMIП UBO node: ${uboName}`);
      assert.ok(hit.degree >= 1, `UBO node ${uboName} must have >= 1 verified edge`);
    }

    const validTypes = new Set(['ubo', 'company', 'authority', 'judge', 'prosecutor', 'lawyer', 'official', 'case']);
    for (const n of data.nodes) {
      assert.ok(n.id && n.label, `Node must have id and label`);
      assert.ok(validTypes.has(n.type), `Node ${n.id} has invalid type: ${n.type}`);
      assert.ok(n.riskScore >= 0 && n.riskScore <= 100, `Node ${n.id} riskScore out of range`);
      assert.ok(Number.isFinite(n.centralityScore) && n.centralityScore >= 0 && n.centralityScore <= 100, `Invalid centralityScore on ${n.id}`);
      assert.ok(Number.isFinite(n.betweenness) && n.betweenness >= 0 && n.betweenness <= 100, `Invalid betweenness on ${n.id}`);
      assert.ok(Number.isFinite(n.pageRank) && n.pageRank >= 0 && n.pageRank <= 100, `Invalid pageRank on ${n.id}`);
      assert.ok(Number.isFinite(n.degree) && n.degree >= 0, `Invalid degree on ${n.id}`);
      assert.ok(n.financialLayer && n.corporateLayer && n.intermediaryLayer && n.judicialLayer, `Node ${n.id} missing 4-layer schema`);
    }

    for (const e of data.edges) {
      assert.ok(nodeIds.has(e.source), `Edge source not found: ${e.source}`);
      assert.ok(nodeIds.has(e.target), `Edge target not found: ${e.target}`);
      assert.ok(e.kind && e.primaryId, `Edge missing kind or primaryId`);
    }
  });

  it('Zero-Emoji Guard: Zero elementary pictographic emojis across Astro, HTML, Engine JS, and JSON', () => {
    const files = [
      { name: 'src/pages/mrezhata.astro', p: astroPath },
      { name: 'docs/mrezhata.html', p: htmlPath },
      { name: 'docs/sigma3/mrezhata_engine.js', p: enginePath },
      { name: 'docs/data/nasvetlo_network_graph.json', p: dataPath },
    ];
    for (const f of files) {
      const content = fs.readFileSync(f.p, 'utf8');
      const hits = content.match(EMOJI_RE) || [];
      assert.equal(hits.length, 0, `Zero-emoji violation in ${f.name}: found ${hits.slice(0, 10).join(', ')}`);
    }
  });

  it('Classification Guard: Authorities vs Private Companies vs Lawyers vs Translation Agencies', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    for (const authName of ['ИНСПЕКТОРАТ', 'ТОПЛОФИКАЦИЯ СОФИЯ', 'АГЕНЦИЯ ПО ВПИСВАНИЯТА', 'КЕВР', 'АЕЦ КОЗЛОДУЙ', 'БУЛГАРТРАНСГАЗ']) {
      const match = data.nodes.find((n) => n.label.toUpperCase().includes(authName));
      if (match) {
        assert.equal(match.type, 'authority', `${authName} must be authority, got ${match.type}`);
      }
    }

    const debtCollector = data.nodes.find((n) => n.label.toUpperCase().includes('АГЕНЦИЯ ЗА СЪБИРАНЕ НА ВЗЕМАНИЯ'));
    if (debtCollector) {
      assert.equal(debtCollector.type, 'company', `Агенция за събиране на вземания must be company, got ${debtCollector.type}`);
    }

    const translators = data.nodes.filter((n) => /интерланг|митра|нова транслейт|транслейт/i.test(n.label));
    for (const tr of translators) {
      assert.equal(tr.type, 'company', `Translation agency ${tr.label} must be company, got ${tr.type}`);
    }

    const lawyers = data.nodes.filter((n) => n.type === 'lawyer');
    assert.ok(lawyers.length >= 10, `Expected >= 10 genuine law firms/attorneys, got ${lawyers.length}`);
    for (const lw of lawyers) {
      assert.ok(
        /адвокат|адвокатско|адв\.|кантора|llp|юрисконсулт|пълномощник/i.test(lw.label),
        `Lawyer node ${lw.label} does not match genuine legal entity regex`
      );
    }
  });

  it('GDPR and Formatting Guard: 0 EGNs, 0 domestic addresses, 0 empty parens', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const DOMESTIC_ADDRESS_RE = /(?:ж\.?\s*к\.?|кв\.?|ул\.?|бул\.?|бл\.?|вх\.?|ет\.?|ап\.?)\s+\d+/i;

    for (const n of data.nodes) {
      assert.equal((n.label.match(/\b\d{10}\b/g) || []).length, 0, `GDPR 10-digit EGN in label: ${n.label}`);
      assert.equal((n.label.match(/\(\s*\)/g) || []).length, 0, `Empty parens in label: ${n.label}`);
      assert.ok(!DOMESTIC_ADDRESS_RE.test(n.label), `Domestic address in label: ${n.label}`);
    }
  });

  it('Cryptographic Guard: Canonical SHA-256 digest matches payload exactly', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const canonicalContent = JSON.stringify({
      nodes: data.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type, eik: n.eik, amountEur: n.amountEur, riskScore: n.riskScore })),
      edges: data.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, primaryId: e.primaryId, amountEur: e.amountEur })),
    });
    const calculatedSha = crypto.createHash('sha256').update(canonicalContent).digest('hex');
    assert.equal(calculatedSha, data.summary.datasetSha256, 'SHA-256 dataset hash must match canonical content');
  });

  it('Enterprise Graph UI, 4 Layouts, Minimap, Path Finder, Wasm Verifier, and Real Design Tokens', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const engine = fs.readFileSync(enginePath, 'utf8');
    const scss = fs.readFileSync(scssPath, 'utf8');

    // Required enterprise interactive controls
    for (const token of [
      'id="mrezhaCanvas"',
      'id="mrezhaMinimap"',
      'id="mrezhaHoverTooltip"',
      'id="mrezhaInspector"',
      'id="mrezhaPathPanel"',
      'id="btnRunPathFinder"',
      'id="exportPngBtn"',
      'id="exportJsonBtn"',
      'id="toggleFullscreenBtn"',
      'id="toggleCanvasThemeBtn"',
      'id="mrezhaWasmVerifyBtn"',
      'data-layout="force"',
      'data-layout="radial"',
      'data-layout="stratified"',
      'data-layout="matrix"',
      'sigma3/mrezhata_engine.js',
      'https://nasvetlo.website/mrezhata.html',
      'чл. 31, ал. 3',
      'чл. 6, ал. 2',
      'SHA-256:',
    ]) {
      assert.ok(html.includes(token), `docs/mrezhata.html missing required element: ${token}`);
    }

    // Engine capabilities check
    assert.ok(engine.includes('computeRadialTargets') && engine.includes('computeStratifiedTargets') && engine.includes('computeMatrixTargets'));
    assert.ok(engine.includes('runShortestPath') && engine.includes('nasvetlo_verifier.wasm'));

    // Zero deprecated terminology or broken CSS vars
    assert.ok(!html.includes('КПКОНПИ'), 'HTML must NOT contain old КПКОНПИ');
    assert.ok(!html.includes('ЗПКОНПИ'), 'HTML must NOT contain old ЗПКОНПИ');
    assert.ok(!html.includes('(ЕKey'), 'HTML must NOT contain typo ЕKey');
    assert.ok(!html.includes('милиони лева') && !html.includes('милиони левове'), 'HTML must use евро consistently');
    assert.ok(!scss.includes('--text-primary') && !scss.includes('--text-secondary') && !scss.includes('--text-muted'), 'SCSS must use real NAsvetlo tokens (--ink, --ink-secondary, --ink-muted)');
  });

  it('Sitemap and Weekly radar diff include mrezhata.html', () => {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    assert.ok(sitemap.includes('https://nasvetlo.website/mrezhata.html'), 'sitemap.xml must include mrezhata.html');

    const weekly = fs.readFileSync(weeklyPath, 'utf8');
    assert.ok(weekly.includes('https://nasvetlo.website/mrezhata.html'), 'weekly_radar_diff.mjs must include mrezhata.html');
  });
});
