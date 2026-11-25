// =============================================================================
// NAsvetlo · „От мрак към светлина“ — Автоматичен таймер, SHA-256 ключ,
// Навигатор по 6 Министерства / Дейности, Компактен превключвател на графики
// и жива търсачка без излишно скролване
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
      if (kickerEl) {
        kickerEl.textContent = 'НАЦИОНАЛЕН КРОС-РЕГИСТЪРЕН ОДИТ · ПУБЛИКУВАНО НА СВЕТЛО · 26.11.2026 г.';
      }
      if (titleEl) {
        titleEl.textContent = 'От мрак към светлина — крос-регистърен радар по министерства и дейности';
      }
      if (subEl) {
        subEl.textContent =
          'Компактна аналитична матрица върху 1 118 765 дела в ЕПЕП/ЕИСС, 206 907 договора по ЗОП (€53,22 млрд.), 3 035 декларации в КПКОНПИ, ЗМИП, АДФИ, КЗК и EPPO, групирана в 6 ресора за преглед на един екран.';
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
          .map(function (b) {
            return b.toString(16).padStart(2, '0');
          })
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

  function initControls() {
    var input = document.getElementById('svetlinaSearchInput');
    var resetBtn = document.getElementById('svetlinaResetBtn');
    var statusEl = document.getElementById('svetlinaSearchStatus');
    var activeSectorNameEl = document.getElementById('svetlinaActiveSectorName');
    var tabButtons = document.querySelectorAll('[data-svet-tab]');
    var sections = document.querySelectorAll('[data-svet-section]');
    var quickChips = document.querySelectorAll('[data-svet-quick]');
    var funnelSteps = document.querySelectorAll('[data-svet-jump]');
    var sectorButtons = document.querySelectorAll('[data-svet-sector]');
    var vizButtons = document.querySelectorAll('[data-svet-viz]');
    var chartCards = document.querySelectorAll('[data-svet-chart]');
    if (!input) return;

    // Default to Sector 1 (MRRB & API) so the page is ultra-compact with zero excessive scrolling
    var activeSector = 'mrrb';
    var activeTab = 'all';

    var sectorNames = {
      all: 'Всички 6 ресора (Пълен национален регистър)',
      mrrb: 'Ресор 01 · МРРБ, АПИ и Пътно-строителен картел (€3,84 млрд.)',
      mvr: 'Ресор 02 · МВР, ДАНС, Гранична полиция и ЗЧОД охрана (917 ЧНД флага)',
      mf: 'Ресор 03 · МФ, НАП, АДФИ, КЗК, Банки и Застрахователи (×60,02 ЕИСС)',
      me: 'Ресор 04 · МЕ, МТС и МИИ — Енергетика, Транспорт (БДЖ) и ИТ (€1,49 млрд.)',
      mz: 'Ресор 05 · МЗ, МТСП, НОИ, НЕЛК и Фармация (€1,79 млрд.)',
      mun: 'Ресор 06 · Общини (София, Хасково, Варна, Плевен) и Министерски съвет (€1,85 млрд.)',
    };

    function syncSectorUI() {
      sectorButtons.forEach(function (btn) {
        var s = btn.getAttribute('data-svet-sector');
        btn.classList.toggle('active', s === activeSector);
      });
      if (activeSectorNameEl) {
        activeSectorNameEl.textContent = sectorNames[activeSector] || sectorNames.all;
      }
    }

    function applyFilter() {
      var q = norm(input.value);
      var totalRows = 0;
      var shownRows = 0;

      sections.forEach(function (sec) {
        var secKey = sec.getAttribute('data-svet-section');
        var tabMatch = activeTab === 'all' || activeTab === secKey;
        if (!tabMatch) {
          sec.hidden = true;
          return;
        }
        var rows = sec.querySelectorAll('tbody tr');
        var secShown = 0;
        rows.forEach(function (tr) {
          totalRows += 1;
          var rowSector = tr.getAttribute('data-sector') || '';
          var sectorOk = activeSector === 'all' || rowSector === activeSector;
          var text = norm(tr.textContent);
          var searchOk = !q || text.indexOf(q) !== -1;
          var ok = sectorOk && searchOk;
          tr.hidden = !ok;
          if (ok) {
            secShown += 1;
            shownRows += 1;
          }
        });
        sec.hidden = secShown === 0;
      });

      if (statusEl) {
        statusEl.textContent = 'Показани записи на екрана: ' + shownRows + ' от ' + totalRows;
      }
    }

    // Visual Charts Switcher (Pair 1 vs Pair 2 vs All 4)
    vizButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-svet-viz') || 'pair1';
        vizButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        chartCards.forEach(function (card) {
          var pair = card.getAttribute('data-svet-chart');
          card.hidden = !(mode === 'all' || mode === pair);
        });
      });
    });

    // Ministry / Sector Cards Switcher
    sectorButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeSector = btn.getAttribute('data-svet-sector') || 'all';
        syncSectorUI();
        applyFilter();
      });
    });

    // Register Tabs Switcher
    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-svet-tab') || 'all';
        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        applyFilter();
      });
    });

    // Quick Slice Chips (search across all sectors so result is always visible)
    quickChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var val = chip.getAttribute('data-svet-quick') || '';
        input.value = val;
        activeSector = 'all';
        activeTab = 'all';
        syncSectorUI();
        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-svet-tab') === 'all');
        });
        applyFilter();
      });
    });

    // Top Funnel Jump
    funnelSteps.forEach(function (step) {
      step.addEventListener('click', function () {
        var targetTab = step.getAttribute('data-svet-jump') || 'all';
        activeSector = 'all';
        activeTab = targetTab;
        syncSectorUI();
        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-svet-tab') === targetTab);
        });
        applyFilter();
        var tabsEl = document.getElementById('svetlinaTabBar');
        if (tabsEl && tabsEl.scrollIntoView) {
          tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    input.addEventListener('input', function () {
      // When typing in search, automatically broaden to all 6 sectors so the user doesn't miss matches
      if (norm(input.value).length > 0 && activeSector !== 'all') {
        activeSector = 'all';
        syncSectorUI();
      }
      applyFilter();
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        input.value = '';
        activeSector = 'mrrb';
        activeTab = 'all';
        syncSectorUI();
        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-svet-tab') === 'all');
        });
        applyFilter();
      });
    }

    syncSectorUI();
    applyFilter();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initGate();
    initControls();
  });
})();
