// =============================================================================
// NAsvetlo · „От мрак към светлина“ — Автоматичен таймер и филтър
// =============================================================================
(function () {
  'use strict';

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initGate() {
    var vault = document.getElementById('svetlinaVault');
    var content = document.getElementById('svetlinaVaultContent');
    if (!vault || !content) return;

    var unlockStr = vault.getAttribute('data-unlock-at') || '2026-11-26T12:00:00+02:00';
    var startStr = vault.getAttribute('data-start-at') || '2026-11-26T00:45:00+02:00';
    var unlockMs = Date.parse(unlockStr);
    var startMs = Date.parse(startStr);

    var dEl = document.getElementById('svetlinaDays');
    var hEl = document.getElementById('svetlinaHours');
    var mEl = document.getElementById('svetlinaMins');
    var sEl = document.getElementById('svetlinaSecs');
    var fillEl = document.getElementById('svetlinaProgressFill');
    var timerGrid = document.getElementById('svetlinaTimerGrid');
    var progressWrap = document.getElementById('svetlinaProgressWrap');
    var titleEl = document.getElementById('svetlinaVaultTitle');
    var subEl = document.getElementById('svetlinaVaultSub');
    var kickerEl = document.getElementById('svetlinaVaultKicker');

    function unlockNow() {
      vault.classList.add('is-unlocked');
      if (timerGrid) timerGrid.hidden = true;
      if (progressWrap) progressWrap.hidden = true;
      if (kickerEl) kickerEl.textContent = 'ПУБЛИКУВАНО НА СВЕТЛО · 26.11.2026 г. · 12:00 ч.';
      if (titleEl) titleEl.textContent = 'От мрак към светлина — пълният крос-регистърен акт е активен';
      if (subEl) {
        subEl.textContent =
          'Всички поименни връзки между политически лица, корпоративни групи, съдии-докладчици в ЕИСС, ЗОП, ЗМИП и европроектите под наблюдение на EPPO вече са достъпни за свободна проверка.';
      }
      content.hidden = false;
      content.removeAttribute('hidden');
    }

    var params = new URLSearchParams(window.location.search || '');
    var rawKey = params.get('key');
    if (rawKey && window.crypto && window.crypto.subtle) {
      var enc = new TextEncoder().encode(rawKey);
      window.crypto.subtle.digest('SHA-256', enc).then(function (buf) {
        var hex = Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
        if (hex === '4abaffd563b1d5e58ffb14fa19a5543f5bc1495c20463c9786ccf04758612b3c') {
          unlockNow();
        }
      });
    }

    function tick() {
      var now = Date.now();
      var diff = unlockMs - now;

      if (diff <= 0) {
        unlockNow();
        return true;
      }

      var totalSecs = Math.floor(diff / 1000);
      var days = Math.floor(totalSecs / 86400);
      var hours = Math.floor((totalSecs % 86400) / 3600);
      var mins = Math.floor((totalSecs % 3600) / 60);
      var secs = totalSecs % 60;

      if (dEl) dEl.textContent = pad(days);
      if (hEl) hEl.textContent = pad(hours);
      if (mEl) mEl.textContent = pad(mins);
      if (sEl) sEl.textContent = pad(secs);

      if (fillEl && unlockMs > startMs) {
        var pct = Math.max(0, Math.min(100, ((now - startMs) / (unlockMs - startMs)) * 100));
        fillEl.style.width = pct.toFixed(1) + '%';
      }
      return false;
    }

    if (!tick()) {
      var iv = window.setInterval(function () {
        if (tick()) window.clearInterval(iv);
      }, 1000);
    }
  }

  function initFilter() {
    var input = document.getElementById('svetlinaSearchInput');
    var resetBtn = document.getElementById('svetlinaResetBtn');
    var statusEl = document.getElementById('svetlinaSearchStatus');
    if (!input) return;

    function runFilter() {
      var q = norm(input.value);
      var rows = document.querySelectorAll('#svetlinaVaultContent tbody tr');
      var shown = 0;
      rows.forEach(function (tr) {
        var text = norm(tr.textContent);
        var ok = !q || text.indexOf(q) !== -1;
        tr.hidden = !ok;
        if (ok) shown += 1;
      });
      if (statusEl) {
        statusEl.textContent = 'Показани редове: ' + shown + ' от ' + rows.length;
      }
    }

    input.addEventListener('input', runFilter);
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        input.value = '';
        runFilter();
      });
    }
    runFilter();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGate();
    initFilter();
  });
})();
