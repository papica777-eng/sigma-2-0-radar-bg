import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const EXPECTED_FILE_SHA256 = 'b6a49ec4644042f43657c10d413e5d055cb3f1e04b57fa3595565999fdec2bc3';

const FORBIDDEN_REFS = [/20\.Д-72/i, /94-00-322/i, /Вх\.\s*№/i];
const EXCLUDED_NAMES = [/Велкова-Желева/i, /Росица Велкова/i, /Занева-Димитрова/i, /Поля Занева/i];

test('Track 1: ot-mrak-kam-svetlina.html is optimized under 1.2 MB and external runtime payload is complete & GDPR-clean', () => {
  const htmlPath = path.join(root, 'docs', 'ot-mrak-kam-svetlina.html');
  const payloadPath = path.join(root, 'docs', 'data', 'svetlina_runtime_payload.json');
  const htmlBytes = fs.statSync(htmlPath).size;
  assert.ok(htmlBytes < 1200000, `Expected slimmed HTML < 1,200,000 bytes, got ${htmlBytes}`);

  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="svetWasmVerifierCard"/);
  assert.match(html, /nasvetlo_verifier\.js\?v=20261127c/);
  assert.match(html, /og-svetlina-bg\.png/);
  assert.match(html, /id="svetLoadAllRedBtn"/);

  assert.ok(fs.existsSync(payloadPath), 'docs/data/svetlina_runtime_payload.json must exist');
  const rawPayload = fs.readFileSync(payloadPath, 'utf8');
  const payload = JSON.parse(rawPayload);
  assert.equal(payload.signalFlags.length, 869, 'Expected all 869 signalFlags in runtime payload');
  assert.equal(payload.extraRedRows.length, 489, 'Expected 489 extraRedRows (869 - 380 SSR)');
  assert.equal(payload.judicialMap.oblasts.length, 28, 'Expected all 28 NUTS-3 oblasts in judicialMap');

  const payloadNoMoney = rawPayload.replace(/"procEur":\d+/g, '"procEur":0');
  assert.equal(/\b\d{10}\b/.test(payloadNoMoney), false, 'Zero 10-digit EGN sequences in runtime payload');
  for (const pat of [...FORBIDDEN_REFS, ...EXCLUDED_NAMES]) {
    assert.ok(!pat.test(rawPayload), `Forbidden string found in runtime payload: ${pat}`);
  }
});

test('Track 2: Rust/Wasm verifier computes exact SHA-256, 0 EGN hits on 3.74 MB JSON, and exact binomial upper tail', async () => {
  const wasmPath = path.join(root, 'docs', 'sigma3', 'nasvetlo_verifier.wasm');
  const auditPath = path.join(root, 'docs', 'data', 'nasvetlo_eiss_audit.json');
  assert.ok(fs.existsSync(wasmPath), 'docs/sigma3/nasvetlo_verifier.wasm must exist');

  const wasmBytes = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const w = instance.exports;

  const auditBytes = fs.readFileSync(auditPath);
  const ptr = w.alloc(auditBytes.length);
  const outPtr = w.alloc(32);
  new Uint8Array(w.memory.buffer).set(auditBytes, ptr);

  const hashLen = w.sha256_hash(ptr, auditBytes.length, outPtr);
  assert.equal(hashLen, 32);
  const digestHex = Buffer.from(new Uint8Array(w.memory.buffer, outPtr, 32)).toString('hex');
  assert.equal(digestHex, EXPECTED_FILE_SHA256, 'Wasm FIPS 180-4 SHA-256 must match exact raw JSON hash');

  const egnCount = w.scan_egn_count(ptr, auditBytes.length);
  assert.equal(egnCount, 0, 'Wasm byte-level scanner must report 0 standalone 10-digit EGNs');

  w.dealloc(ptr, auditBytes.length);
  w.dealloc(outPtr, 32);

  const fairP = w.binomial_upper_tail(10, 20, 0.5);
  assert.ok(Math.abs(fairP - 0.5880985260009766) < 1e-9, `Unexpected fair binomial p: ${fairP}`);

  const extremeP = w.binomial_upper_tail(345, 789, 60.69 / 789.0);
  assert.ok(extremeP > 0 && extremeP < 1e-150, `Expected extreme p < 1e-150, got ${extremeP}`);
});

test('Track 3: Custom 1200x630 OpenGraph PNG cards & GitHub Actions CI workflow exist and are valid', () => {
  for (const pngName of ['og-svetlina-bg.png', 'og-en-eppo.png']) {
    const p = path.join(root, 'docs', 'sigma3', pngName);
    assert.ok(fs.existsSync(p), `${pngName} must exist`);
    const buf = fs.readFileSync(p);
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${pngName} must have PNG header`);
    assert.equal(buf.readUInt32BE(16), 1200, `${pngName} width must be 1200`);
    assert.equal(buf.readUInt32BE(20), 630, `${pngName} height must be 630`);
  }

  const ciPath = path.join(root, '.github', 'workflows', 'ci.yml');
  assert.ok(fs.existsSync(ciPath), '.github/workflows/ci.yml must exist');
  const ci = fs.readFileSync(ciPath, 'utf8');
  assert.match(ci, /cargo test/);
  assert.match(ci, /npm run build/);
  assert.match(ci, /node --test/);
});

test('Track 4: Print-ready A4 PDFs, updated Action Pack, and Press/EPPO Dispatch Kit are complete & GDPR-clean', () => {
  const pdfFiles = [
    'DOKLAD_MS_MINISTAR_PREDSEDATEL_EISS_ZOP_2026.pdf',
    'DOKLAD_09_POLITICI_OLIGARSI_EISS_ZOP_EPPO_2026.pdf',
    'NASVETLO_EPPO_DG_JUST_EXECUTIVE_BRIEF_2026_EN.pdf',
  ];
  for (const name of pdfFiles) {
    const p = path.join(root, 'docs', 'reports', name);
    assert.ok(fs.existsSync(p), `Missing PDF: ${name}`);
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 20000, `PDF too small (${buf.length} bytes): ${name}`);
    assert.equal(buf.subarray(0, 5).toString('ascii'), '%PDF-', `Invalid PDF magic header: ${name}`);
  }

  const kitPath = path.join(root, 'docs', 'reports', 'PRESS_AND_EPPO_DISPATCH_KIT_2026.md');
  assert.ok(fs.existsSync(kitPath), 'PRESS_AND_EPPO_DISPATCH_KIT_2026.md must exist');
  const kit = fs.readFileSync(kitPath, 'utf8');
  assert.match(kit, /10\.5281\/zenodo\.24580253/);
  assert.match(kit, /b6a49ec4644042f43657c10d413e5d055cb3f1e04b57fa3595565999fdec2bc3/);
  assert.equal(/\b\d{10}\b/.test(kit), false, 'Zero 10-digit EGN sequences allowed in Press/EPPO Dispatch Kit');
});
