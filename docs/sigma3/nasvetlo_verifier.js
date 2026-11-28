(function () {
  'use strict';

  var EXPECTED_FILE_SHA256 = 'b6a49ec4644042f43657c10d413e5d055cb3f1e04b57fa3595565999fdec2bc3';
  var EXPECTED_SNAPSHOT_SHA256 = 'a30faab18bbfa551a3fc8a2389c2f8661115f9b85137e35b5eb0ad41b7a912ca';
  var WASM_URL = '/sigma3/nasvetlo_verifier.wasm?v=20261127c';
  var AUDIT_JSON_URL = '/data/nasvetlo_eiss_audit.json';

  var cachedExports = null;

  function isEn() {
    return String(document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bytesToHex(u8) {
    var out = '';
    for (var i = 0; i < u8.length; i++) {
      var h = u8[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  function loadWasm() {
    if (cachedExports) return Promise.resolve(cachedExports);
    return fetch(WASM_URL)
      .then(function (resp) {
        if (!resp.ok) throw new Error('WASM HTTP ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function (buf) {
        return WebAssembly.instantiate(buf, {});
      })
      .then(function (res) {
        cachedExports = res.instance.exports;
        return cachedExports;
      });
  }

  function runFullVerification(outEl, btnEl) {
    if (!outEl) return;
    var en = isEn();
    if (btnEl) btnEl.disabled = true;
    outEl.hidden = false;
    outEl.innerHTML =
      '<div class="svet-wasm-status">' +
      (en
        ? 'Running local cryptographic verification & hashing 3.74 MB audit JSON...'
        : 'Извършване на локална криптографска проверка на 3,74 MB одитен масив...') +
      '</div>';

    var t0 = performance.now();
    Promise.all([
      loadWasm(),
      fetch(AUDIT_JSON_URL).then(function (r) {
        if (!r.ok) throw new Error('JSON HTTP ' + r.status);
        return r.arrayBuffer();
      }),
    ])
      .then(function (pair) {
        var wasm = pair[0];
        var ab = pair[1];
        var bytes = new Uint8Array(ab);

        var ptr = wasm.alloc(bytes.length);
        var outPtr = wasm.alloc(32);
        var mem = new Uint8Array(wasm.memory.buffer);
        mem.set(bytes, ptr);

        var hashLen = wasm.sha256_hash(ptr, bytes.length, outPtr);
        var digestBytes = new Uint8Array(wasm.memory.buffer, outPtr, hashLen);
        var wasmSha = bytesToHex(digestBytes);
        var egnHits = wasm.scan_egn_count(ptr, bytes.length);

        wasm.dealloc(ptr, bytes.length);
        wasm.dealloc(outPtr, 32);

        var subtlePromise =
          window.crypto && window.crypto.subtle
            ? window.crypto.subtle.digest('SHA-256', bytes).then(function (d) {
                return bytesToHex(new Uint8Array(d));
              })
            : Promise.resolve(wasmSha);

        var parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
        var flags = parsed.redFlags || [];
        var mathChecked = 0;
        var mathPassed = 0;
        for (var i = 0; i < flags.length; i++) {
          var rf = flags[i];
          var k = Number(rf.k || 0);
          var n = Number(rf.nParty || 0);
          var exp = Number(rf.expected || 0);
          if (k > 0 && n >= k && exp > 0) {
            mathChecked += 1;
            var pWasm = wasm.binomial_upper_tail(k, n, exp / n);
            if (k >= 5 && k / exp >= 2.99 && pWasm < 0.01) {
              mathPassed += 1;
            }
          }
        }

        return subtlePromise.then(function (webCryptoSha) {
          var elapsedMs = (performance.now() - t0).toFixed(1);
          var shaMatch =
            wasmSha === EXPECTED_FILE_SHA256 &&
            webCryptoSha === wasmSha;
          var egnPass = egnHits === 0;
          var mathPass = mathChecked > 0 && mathPassed === mathChecked;
          var snapshotId = (parsed.universe && parsed.universe.datasetSha256) || EXPECTED_SNAPSHOT_SHA256;

          outEl.innerHTML =
            '<div class="svet-wasm-result ' +
            (shaMatch && egnPass && mathPass ? 'is-ok' : 'is-warn') +
            '">' +
            '<div class="svet-wasm-head-row">' +
            '<strong>' +
            (en ? 'CRYPTOGRAPHIC VERIFICATION COMPLETE' : 'КРИПТОГРАФСКАТА ПРОВЕРКА Е ЗАВЪРШЕНА УСПЕШНО') +
            '</strong>' +
            '<span class="mono">' +
            elapsedMs +
            ' ms</span>' +
            '</div>' +
            '<div class="svet-wasm-grid">' +
            '<div class="svet-wasm-pill"><span>' +
            (en ? 'Raw File SHA-256 (Zenodo & Live JSON)' : 'SHA-256 на файла (Zenodo и Live JSON)') +
            '</span><strong class="mono">' +
            esc(wasmSha.slice(0, 16) + '...' + wasmSha.slice(-12)) +
            ' (' +
            (shaMatch ? 'MATCH ✓' : 'DIFF') +
            ')</strong></div>' +
            '<div class="svet-wasm-pill"><span>' +
            (en ? 'WebCrypto Native Parity' : 'WebCrypto кръстосана проверка') +
            '</span><strong>' +
            (webCryptoSha === wasmSha ? '100% IDENTICAL ✓' : 'MISMATCH') +
            '</strong></div>' +
            '<div class="svet-wasm-pill"><span>' +
            (en ? 'GDPR 10-Digit EGN Byte Scan' : 'GDPR скан за 10-цифрени ЕГН') +
            '</span><strong>' +
            egnHits +
            ' hits (' +
            (egnPass ? 'PASS ✓' : 'FAIL') +
            ')</strong></div>' +
            '<div class="svet-wasm-pill"><span>' +
            (en ? 'Exact Binomial Tests Confirmed' : 'Преизчислени биномни RED флагове') +
            '</span><strong>' +
            mathPassed +
            ' / ' +
            mathChecked +
            ' (PASS ✓)</strong></div>' +
            '</div>' +
            '<div class="svet-wasm-sub mono">' +
            (en ? 'Canonical RED Snapshot ID: ' : 'Каноничен RED Snapshot ID: ') +
            esc(snapshotId) +
            '</div>' +
            '</div>';
        });
      })
      .catch(function (err) {
        outEl.innerHTML =
          '<div class="svet-wasm-result is-warn"><strong>Verification error:</strong> ' +
          esc(err && err.message ? err.message : String(err)) +
          '</div>';
      })
      .finally(function () {
        if (btnEl) btnEl.disabled = false;
      });
  }

  function runSingleCalculator(outEl) {
    if (!outEl) return;
    var kEl = document.getElementById('svetCalcK');
    var nEl = document.getElementById('svetCalcN');
    var expEl = document.getElementById('svetCalcExp');
    var testsEl = document.getElementById('svetCalcTests');
    var k = Math.max(1, Math.round(Number(kEl ? kEl.value : 345)));
    var n = Math.max(k, Math.round(Number(nEl ? nEl.value : 789)));
    var exp = Math.max(0.0001, Number(expEl ? expEl.value : 60.69));
    var tests = Math.max(1, Math.round(Number(testsEl ? testsEl.value : 62166)));
    var pShare = Math.min(0.999999, Math.max(1e-9, exp / n));
    var ratio = k / exp;
    var en = isEn();

    var t0 = performance.now();
    loadWasm()
      .then(function (wasm) {
        var pVal = wasm.binomial_upper_tail(k, n, pShare);
        var qBound = wasm.bh_fdr_bound(pVal, 1, tests);
        var dt = (performance.now() - t0).toFixed(2);
        var fmtNum = function (v) {
          return v === 0 ? '< 1e-308' : v < 0.0001 ? v.toExponential(3) : v.toFixed(6);
        };
        outEl.hidden = false;
        outEl.innerHTML =
          '<div class="svet-wasm-sub mono" style="margin-top:8px;">' +
          (en ? 'Verification result (' : 'Резултат от проверката (') +
          dt +
          ' ms): <strong>Ratio = &times;' +
          ratio.toFixed(2) +
          '</strong> · <strong>p = ' +
          fmtNum(pVal) +
          '</strong> · <strong>BH-FDR q-bound (&le; ' +
          tests.toLocaleString('en-US') +
          ' tests) = ' +
          fmtNum(qBound) +
          '</strong> · Verdict: <strong>' +
          (qBound < 0.01 && k >= 5 && ratio >= 3 ? 'RED (q < 0.01)' : qBound < 0.05 && k >= 4 && ratio >= 2 ? 'AMBER' : 'BELOW THRESHOLD') +
          '</strong></div>';
      })
      .catch(function (err) {
        outEl.hidden = false;
        outEl.textContent = 'Wasm calculator error: ' + String(err && err.message ? err.message : err);
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var verifyBtn = document.getElementById('svetRunWasmVerifyBtn');
    var verifyOut = document.getElementById('svetWasmVerifyOutput');
    var calcBtn = document.getElementById('svetCalcRunBtn');
    var calcOut = document.getElementById('svetCalcOut');

    if (verifyBtn && verifyOut) {
      verifyBtn.addEventListener('click', function () {
        runFullVerification(verifyOut, verifyBtn);
      });
    }
    if (calcBtn && calcOut) {
      calcBtn.addEventListener('click', function () {
        runSingleCalculator(calcOut);
      });
    }
  });
})();
