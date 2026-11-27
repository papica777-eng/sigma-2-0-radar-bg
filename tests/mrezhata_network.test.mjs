import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

  it('nodes and edges meet statistical and integrity thresholds', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.ok(data.nodes.length >= 150, `Expected >= 150 nodes, got ${data.nodes.length}`);
    assert.ok(data.edges.length >= 150, `Expected >= 150 edges, got ${data.edges.length}`);
    assert.ok(data.summary.totalInvestigatedResourceEur >= 1e9, 'Total resource should exceed €1 billion');

    const nodeIds = new Set(data.nodes.map((n) => n.id));
    assert.equal(nodeIds.size, data.nodes.length, 'All node IDs must be strictly unique');

    const validTypes = new Set(['company', 'authority', 'judge', 'prosecutor', 'lawyer', 'official', 'case']);
    for (const n of data.nodes) {
      assert.ok(n.id, 'Node must have an id');
      assert.ok(n.label, `Node ${n.id} must have a label`);
      assert.ok(validTypes.has(n.type), `Node ${n.id} has invalid type: ${n.type}`);
      assert.ok(n.riskScore >= 0 && n.riskScore <= 100, `Node ${n.id} riskScore out of range: ${n.riskScore}`);
    }

    for (const e of data.edges) {
      assert.ok(nodeIds.has(e.source), `Edge source not found in nodes: ${e.source}`);
      assert.ok(nodeIds.has(e.target), `Edge target not found in nodes: ${e.target}`);
      assert.ok(e.kind, `Edge missing kind: ${JSON.stringify(e)}`);
    }
  });

  it('GDPR Guard: No civilian 10-digit EGN strings in nodes or labels', () => {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    for (const n of data.nodes) {
      // Exclude EIKs which can be 9 or 13 digits, or financial amounts
      const matches = n.label.match(/\b\d{10}\b/g) || [];
      assert.equal(matches.length, 0, `GDPR violation: Node label contains 10-digit string: ${n.label}`);
    }
  });

  it('docs/mrezhata.html compiles properly with required interactive elements', () => {
    assert.ok(fs.existsSync(htmlPath), 'docs/mrezhata.html must exist');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.length > 25000, `HTML size should exceed 25 KB, got ${html.length}`);

    assert.ok(html.includes('<canvas id="mrezhaCanvas"'), 'HTML must include canvas element');
    assert.ok(html.includes('id="mrezhaInspector"'), 'HTML must include inspector drawer');
    assert.ok(html.includes('id="signalModal"'), 'HTML must include institutional signal modal');
    assert.ok(html.includes('id="mrezhaSearchInput"'), 'HTML must include search input');
    assert.ok(html.includes('https://nasvetlo.website/mrezhata.html'), 'HTML must have correct canonical path');
  });

  it('Sitemap and Weekly radar diff include mrezhata.html', () => {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    assert.ok(sitemap.includes('https://nasvetlo.website/mrezhata.html'), 'sitemap.xml must include mrezhata.html');

    const weekly = fs.readFileSync(weeklyPath, 'utf8');
    assert.ok(weekly.includes('https://nasvetlo.website/mrezhata.html'), 'weekly_radar_diff.mjs must include mrezhata.html');
  });
});
