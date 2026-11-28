import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const FORBIDDEN_PATTERNS = [
  /20\.Д-72/i,
  /94-00-322/i,
  /Вх\.\s*№/i,
  /Велкова-Желева/i,
  /Росица Велкова/i,
  /Занева-Димитрова/i,
  /Поля Занева/i,
];

test('English executive brief (/en/ and /en.html) is synced with Zenodo DOI and verified 4-year metrics', () => {
  const enIndexPath = path.join(root, 'docs', 'en', 'index.html');
  const enHtmlPath = path.join(root, 'docs', 'en.html');
  assert.ok(fs.existsSync(enIndexPath), 'docs/en/index.html must exist');
  assert.ok(fs.existsSync(enHtmlPath), 'docs/en.html must exist');

  const html = fs.readFileSync(enIndexPath, 'utf8');
  assert.match(html, /<html lang="en"/);
  assert.match(html, /href="\/sigma3\/styles\.css\?v=20261127[a-z]"/);
  assert.match(html, /10\.5281\/zenodo\.24580253/);
  assert.match(html, /a30faab18bbfa551a3fc8a2389c2f8661115f9b85137e35b5eb0ad41b7a912ca/);
  assert.match(html, /2,234,509/);
  assert.match(html, /869/);
  assert.match(html, /154/);
  assert.match(html, /EPPO-Relevant EU Fund Contracts/i);

  const visibleText = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  for (const pat of FORBIDDEN_PATTERNS) {
    assert.ok(!pat.test(html), `Forbidden pattern matched in /en/: ${pat}`);
  }
  assert.ok(!/\b\d{10}\b/.test(visibleText), 'Zero 10-digit EGN numbers permitted in visible /en/ HTML');
});

test('ot-mrak-kam-svetlina has 1-click signal generator modal, Zenodo DOI badge, and updated JS/CSS bundles', () => {
  const htmlPath = path.join(root, 'docs', 'ot-mrak-kam-svetlina.html');
  const jsPath = path.join(root, 'docs', 'sigma3', 'ot_mrak_kam_svetlina.js');
  const cssPath = path.join(root, 'docs', 'sigma3', 'styles.css');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.match(html, /sigma3\/ot_mrak_kam_svetlina\.js\?v=20261127[a-z]/);
  assert.match(html, /sigma3\/styles\.css\?v=202611\d{2}[a-z]/);
  assert.match(html, /id="svetSignalModal"/);
  assert.match(html, /id="svetSignalBackdrop"/);
  assert.match(html, /id="svetSignalCancelBtn"/);
  assert.match(css, /\.svet-signal-modal\[hidden\][^}]*display:\s*none\s*!important/);
  assert.match(css, /\.svet-signal-modal\.is-open/);
  assert.match(html, /data-svet-signal-idx="/);
  assert.match(html, /data-svet-signal-coi="/);
  assert.match(html, /10\.5281\/zenodo\.24580253/);
  assert.match(html, /href="\/en\/"/);

  assert.match(js, /function initSignalGenerator/);
  assert.match(js, /initSignalGenerator\(parsePayload\(\)\)/);
  assert.match(js, /10\.5281\/zenodo\.24580253/);

  for (const pat of FORBIDDEN_PATTERNS.slice(0, 3)) {
    assert.ok(!pat.test(html), `Forbidden reference number matched in ot-mrak-kam-svetlina.html: ${pat}`);
    assert.ok(!pat.test(js), `Forbidden reference number matched in ot_mrak_kam_svetlina.js: ${pat}`);
  }
});

test('sadeben-odit.html redirects cleanly and legacy eiss_audit files are removed', () => {
  const redirPath = path.join(root, 'docs', 'sadeben-odit.html');
  assert.ok(fs.existsSync(redirPath), 'docs/sadeben-odit.html must exist');
  const redir = fs.readFileSync(redirPath, 'utf8');
  assert.match(redir, /noindex,\s*follow/i);
  assert.match(redir, /rel="canonical"\s+href="https:\/\/nasvetlo\.website\/ot-mrak-kam-svetlina\.html"/);
  assert.match(redir, /http-equiv="refresh"[^>]+ot-mrak-kam-svetlina\.html/);

  assert.ok(!fs.existsSync(path.join(root, 'docs', 'sigma3', 'eiss_audit.js')), 'eiss_audit.js must be deleted');
  assert.ok(!fs.existsSync(path.join(root, 'src', 'styles', 'components', '_eiss-audit.scss')), '_eiss-audit.scss must be deleted');
});

test('SEO feeds (sitemap.xml, feed.xml, llms.txt) list /en/ and CERN Zenodo DOI', () => {
  const sitemap = fs.readFileSync(path.join(root, 'docs', 'sitemap.xml'), 'utf8');
  const feed = fs.readFileSync(path.join(root, 'docs', 'feed.xml'), 'utf8');
  const llms = fs.readFileSync(path.join(root, 'docs', 'llms.txt'), 'utf8');

  assert.match(sitemap, /https:\/\/nasvetlo\.website\/en\//);
  assert.match(sitemap, /2026-11-27/);
  assert.match(feed, /10\.5281\/zenodo\.24580253/);
  assert.match(feed, /https:\/\/nasvetlo\.website\/en\//);
  assert.match(llms, /10\.5281\/zenodo\.24580253/);
  assert.match(llms, /https:\/\/nasvetlo\.website\/en\//);
});
