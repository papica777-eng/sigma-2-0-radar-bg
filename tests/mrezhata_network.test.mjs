import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dataPath = path.join(root, 'docs', 'data', 'nasvetlo_network_graph.json');
const htmlPath = path.join(root, 'docs', 'mrezhata.html');
const sitemapPath = path.join(root, 'docs', 'sitemap.xml');
const weeklyPath = path.join(root, 'scripts', 'weekly_radar_diff.mjs');

describe('State Capture Network Graph (Мрежата)', () => {
  it('nasvetlo_network_graph.json exists and is valid JSON', () => {
    assert.ok(fs.existsSync(dataPath), 'nasvetlo_network_graph.json must exist');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);
    assert.ok(data.summary, 'summary object must exist');
    assert.ok(Array.isArray(data.nodes), 'nodes array must exist');
    assert.ok(Array.isArray(data.edges), 'edges array must exist');
    assert.ok(Array.isArray(data.clusters), 'clusters array must exist');
  });

  it('nodes and edges meet statistical, case count, and integrity thresholds', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.ok(data.nodes.length >= 200, `Expected >= 200 nodes, got ${data.nodes.length}`);
    assert.ok(data.edges.length >= 200, `Expected >= 200 edges, got ${data.edges.length}`);
    assert.ok(data.summary.totalCases >= 25, `Expected >= 25 cases, got ${data.summary.totalCases}`);
    assert.ok(data.summary.totalInvestigatedResourceEur >= 1e9, 'Total resource should exceed €1 billion');

    const nodeIds = new Set(data.nodes.map((n) => n.id));
    assert.equal(nodeIds.size, data.nodes.length, 'All node IDs must be strictly unique');

    const validTypes = new Set(['company', 'authority', 'judge', 'prosecutor', 'lawyer', 'official', 'case']);
    for (const n of data.nodes) {
      assert.ok(n.id, 'Node must have an id');
      assert.ok(n.label, `Node ${n.id} must have a label`);
      assert.ok(validTypes.has(n.type), `Node ${n.id} has invalid type: ${n.type}`);
      assert.ok(n.riskScore >= 0 && n.riskScore <= 100, `Node ${n.id} riskScore out of range: ${n.riskScore}`);

      // Verify 4-layer schema exists on all nodes
      assert.ok(n.financialLayer, `Node ${n.id} missing financialLayer`);
      assert.ok(n.corporateLayer, `Node ${n.id} missing corporateLayer`);
      assert.ok(n.intermediaryLayer, `Node ${n.id} missing intermediaryLayer`);
      assert.ok(n.judicialLayer, `Node ${n.id} missing judicialLayer`);
    }

    for (const e of data.edges) {
      assert.ok(nodeIds.has(e.source), `Edge source not found in nodes: ${e.source}`);
      assert.ok(nodeIds.has(e.target), `Edge target not found in nodes: ${e.target}`);
      assert.ok(e.kind, `Edge missing kind: ${JSON.stringify(e)}`);
      assert.ok(e.primaryId, `Edge missing primaryId: ${JSON.stringify(e)}`);
    }
  });

  it('Classification Guard: Authorities vs Private Companies vs Lawyers vs Cases', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    // Check specific known entities
    const ivss = data.nodes.find(n => n.label.includes('ИНСПЕКТОРАТ'));
    if (ivss) {
      assert.equal(ivss.type, 'authority', `ИВСС must be categorized as authority, got ${ivss.type}`);
    }

    const toplo = data.nodes.find(n => n.label.includes('ТОПЛОФИКАЦИЯ СОФИЯ'));
    if (toplo) {
      assert.equal(toplo.type, 'authority', `Топлофикация София must be categorized as authority, got ${toplo.type}`);
    }

    const vpisvaniya = data.nodes.find(n => n.label.includes('АГЕНЦИЯ ПО ВПИСВАНИЯТА'));
    if (vpisvaniya) {
      assert.equal(vpisvaniya.type, 'authority', `Агенция по вписванията must be authority, got ${vpisvaniya.type}`);
    }

    const kevr = data.nodes.find(n => n.label.includes('КЕВР'));
    if (kevr) {
      assert.equal(kevr.type, 'authority', `КЕВР must be authority, got ${kevr.type}`);
    }

    const debtCollector = data.nodes.find(n => n.label.includes('АГЕНЦИЯ ЗА СЪБИРАНЕ НА ВЗЕМАНИЯ'));
    if (debtCollector) {
      assert.equal(debtCollector.type, 'company', `Агенция за събиране на вземания must be company, got ${debtCollector.type}`);
    }

    // Translation agencies must NOT be classified as lawyer
    const translators = data.nodes.filter(n => /интерланг|митра|нова транслейт|транслейт/i.test(n.label));
    for (const tr of translators) {
      assert.notEqual(tr.type, 'lawyer', `Translation agency ${tr.label} must NOT be classified as lawyer`);
      assert.equal(tr.type, 'company', `Translation agency ${tr.label} must be company`);
    }

    // Check all lawyers are genuine law firms or attorneys
    const lawyers = data.nodes.filter(n => n.type === 'lawyer');
    for (const lw of lawyers) {
      assert.ok(
        /адвокат|адвокатско|адв\.|кантора/i.test(lw.label),
        `Lawyer node ${lw.label} does not look like a genuine law firm`
      );
    }
  });

  it('GDPR and Formatting Guard: No civilian 10-digit EGNs, no domestic addresses, no empty parens', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const DOMESTIC_ADDRESS_RE = /(?:ж\.?\s*к\.?|кв\.?|ул\.?|бул\.?|бл\.?|вх\.?|ет\.?|ап\.?)\s+\d+/i;

    for (const n of data.nodes) {
      // Exclude EIKs or legal references
      const egnMatches = n.label.match(/\b\d{10}\b/g) || [];
      assert.equal(egnMatches.length, 0, `GDPR violation: Node label contains 10-digit string: ${n.label}`);

      const emptyParens = n.label.match(/\(\s*\)/g) || [];
      assert.equal(emptyParens.length, 0, `Formatting error: Node label contains empty parentheses: ${n.label}`);

      assert.ok(!DOMESTIC_ADDRESS_RE.test(n.label), `GDPR domestic address found in label: ${n.label}`);
    }
  });

  it('Cryptographic Guard: SHA-256 match', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const canonicalContent = JSON.stringify({
      nodes: data.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, eik: n.eik, amountEur: n.amountEur, riskScore: n.riskScore })),
      edges: data.edges.map(e => ({ source: e.source, target: e.target, kind: e.kind, primaryId: e.primaryId, amountEur: e.amountEur })),
    });
    const calculatedSha = crypto.createHash('sha256').update(canonicalContent).digest('hex');
    assert.equal(calculatedSha, data.summary.datasetSha256, 'SHA-256 dataset hash must match canonical content');
  });

  it('docs/mrezhata.html compiles properly with required interactive elements and methodology', () => {
    assert.ok(fs.existsSync(htmlPath), 'docs/mrezhata.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.length > 25000, `HTML size should exceed 25 KB, got ${html.length}`);

    assert.ok(html.includes('<canvas id="mrezhaCanvas"'), 'HTML must include canvas element');
    assert.ok(html.includes('id="mrezhaInspector"'), 'HTML must include inspector drawer');
    assert.ok(html.includes('id="signalModal"'), 'HTML must include institutional signal modal');
    assert.ok(html.includes('id="mrezhaSearchInput"'), 'HTML must include search input');
    assert.ok(html.includes('https://nasvetlo.website/mrezhata.html'), 'HTML must have correct canonical path');

    // Terminology assertions
    assert.ok(!html.includes('КПКОНПИ'), 'HTML must NOT contain old КПКОНПИ, use КПК');
    assert.ok(!html.includes('ЗПКОНПИ'), 'HTML must NOT contain old ЗПКОНПИ, use ЗПК');
    assert.ok(!html.includes('(ЕKey'), 'HTML must NOT contain typo ЕKey, use ЕСО ЕАД');

    // Methodology & disclaimer assertions
    assert.ok(html.includes('mrezha-methodology-section'), 'HTML must include methodology section');
    assert.ok(html.includes('чл. 31, ал. 3'), 'HTML must cite Art. 31 Constitution');
    assert.ok(html.includes('чл. 6, ал. 2'), 'HTML must cite Art. 6 ECHR');
    assert.ok(html.includes('SHA-256:'), 'HTML must display SHA-256 badge');
  });

  it('Sitemap and Weekly radar diff include mrezhata.html', () => {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    assert.ok(sitemap.includes('https://nasvetlo.website/mrezhata.html'), 'sitemap.xml must include mrezhata.html');

    const weekly = fs.readFileSync(weeklyPath, 'utf8');
    assert.ok(weekly.includes('https://nasvetlo.website/mrezhata.html'), 'weekly_radar_diff.mjs must include mrezhata.html');
  });
});
