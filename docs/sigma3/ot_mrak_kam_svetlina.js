// =============================================================================
// NAsvetlo · „От мрак към светлина“ — Автоматичен таймер, SHA-256 ключ,
// Навигатор по 6 Министерства / Дейности, Компактен превключвател на графики
// и Десен панел (Slide-Over Drawer) за проследяване на зависимостите по веригата
// =============================================================================
(function () {
  'use strict';

  var EXCLUDED_RE = /велкова|занева/i;

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/["„“'’`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtEur(n) {
    var v = Number(n || 0);
    if (!isFinite(v)) return '€0';
    if (v >= 1e9) return '€' + (v / 1e9).toFixed(2).replace('.', ',') + ' млрд.';
    if (v >= 1e6) return '€' + (v / 1e6).toFixed(2).replace('.', ',') + ' млн.';
    return '€' + Math.round(v).toLocaleString('bg-BG');
  }

  function fmtInt(n) {
    return Math.round(Number(n || 0)).toLocaleString('bg-BG');
  }

  function isExcludedName(name) {
    return EXCLUDED_RE.test(String(name || ''));
  }

  function extractEiks(text) {
    var m = String(text || '').match(/\b\d{9}\b/g);
    if (!m) return [];
    var seen = {};
    var out = [];
    m.forEach(function (e) {
      if (!seen[e]) {
        seen[e] = true;
        out.push(e);
      }
    });
    return out;
  }

  function parsePayload() {
    var el = document.getElementById('svetlinaGraphPayload');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      return null;
    }
  }

  // ===========================================================================
  // THEME TOGGLE (Light / Dark mode parity with main platform)
  // ===========================================================================
  function initTheme() {
    var btn = document.getElementById('themeToggleBtn');
    var root = document.documentElement;
    var saved = '';
    try {
      saved = localStorage.getItem('nasvetlo_theme') || '';
    } catch (e) {}
    if (saved === 'dark') {
      root.setAttribute('data-theme', 'dark');
      if (btn) btn.textContent = 'Светъл режим';
    }
    if (btn) {
      btn.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        btn.textContent = next === 'dark' ? 'Светъл режим' : 'Тъмен режим';
        try {
          localStorage.setItem('nasvetlo_theme', next);
        } catch (e) {}
      });
    }
  }

  // ===========================================================================
  // COUNTDOWN GATE & SHA-256 ARCHITECT PREVIEW KEY
  // ===========================================================================
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
          'Компактна аналитична матрица върху 1 118 765 дела в ЕПЕП/ЕИСС, 206 907 договора по ЗОП (€53,22 млрд.), 3 035 декларации в КПКОНПИ, ЗМИП, АДФИ, КЗК и EPPO, с десен панел за проследяване на зависимостите по веригата.';
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

  // ===========================================================================
  // LIVE PUBLIC DATASET LOADER + UNIVERSAL DEPENDENCY CHAIN RIGHT DRAWER
  // ===========================================================================
  function initDependencyDrawer(filterApi) {
    var payload = parsePayload();
    var backdrop = document.getElementById('svetDrawerBackdrop');
    var drawer = document.getElementById('svetDrawer');
    var closeBtn = document.getElementById('svetDrawerClose');
    var backBtn = document.getElementById('svetDrawerBack');
    var navBar = document.getElementById('svetDrawerNav');
    var crumbsEl = document.getElementById('svetDrawerBreadcrumbs');
    var kickerEl = document.getElementById('svetDrawerKicker');
    var titleEl = document.getElementById('svetDrawerTitle');
    var badgesEl = document.getElementById('svetDrawerBadges');
    var bodyEl = document.getElementById('svetDrawerBody');

    if (!payload || !drawer || !backdrop || !bodyEl) return;

    // Index all local curated records across the 5 tables
    var localById = {};
    var allLocal = [];
    function registerList(list, kind) {
      (list || []).forEach(function (item) {
        var rec = Object.assign({ _kind: kind }, item);
        localById[rec.id] = rec;
        allLocal.push(rec);
      });
    }
    registerList(payload.politicians, 'politician');
    registerList(payload.corpFlags, 'corp');
    registerList(payload.securityFlags, 'security');
    registerList(payload.cartelZmipRows, 'cartel');
    registerList(payload.eppoLawSecurityRows, 'eppo');

    var live = {
      loaded: false,
      loadingPromise: null,
      officials: [],
      officialsBySlug: {},
      officialsByNormName: {},
      companiesByEik: {},
      companiesList: [],
      authoritiesByEik: {},
      authoritiesList: [],
      deepBySlug: {},
      deepLinksByEik: {},
      deepLinksByPerson: {},
      coBiddingPairs: [],
      consortiumHubsByEik: {},
      judicialCompanies: {},
    };

    function fetchJson(url) {
      return fetch(url)
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .catch(function () {
          return null;
        });
    }

    function ensureLiveDatasets() {
      if (live.loaded) return Promise.resolve(live);
      if (live.loadingPromise) return live.loadingPromise;

      live.loadingPromise = Promise.all([
        fetchJson('data/officials_all.json'),
        fetchJson('data/companies_index.json'),
        fetchJson('data/authorities_index.json'),
        fetchJson('data/deep_links.json'),
        fetchJson('data/sigma3_macro.json'),
        fetchJson('data/sigma3_judicial_6.json'),
      ]).then(function (res) {
        var offJson = res[0];
        var compJson = res[1];
        var authJson = res[2];
        var deepJson = res[3];
        var macroJson = res[4];
        var j6Json = res[5];

        if (offJson && Array.isArray(offJson.officials)) {
          offJson.officials.forEach(function (o) {
            if (isExcludedName(o.name)) return;
            live.officials.push(o);
            if (o.slug) live.officialsBySlug[o.slug] = o;
            live.officialsByNormName[norm(o.name)] = o;
          });
        }

        if (compJson && Array.isArray(compJson.rows)) {
          compJson.rows.forEach(function (r) {
            var c = {
              eik: String(r[0] || ''),
              name: String(r[1] || ''),
              isConsortium: Boolean(r[2]),
              settlement: String(r[3] || ''),
              wonEur: Number(r[4] || 0),
              contracts: Number(r[5] || 0),
              authorities: Number(r[6] || 0),
              sector: String(r[7] || ''),
              linkedOfficials: Number(r[8] || 0),
              consortiumCount: Number(r[9] || 0),
              consortiumEur: Number(r[10] || 0),
            };
            live.companiesList.push(c);
            if (c.eik) live.companiesByEik[c.eik] = c;
          });
        }

        if (authJson && Array.isArray(authJson.rows)) {
          authJson.rows.forEach(function (r) {
            var a = {
              eik: String(r[0] || ''),
              name: String(r[1] || ''),
              type: String(r[2] || ''),
              settlement: String(r[3] || ''),
              region: String(r[4] || ''),
              spentEur: Number(r[5] || 0),
              contracts: Number(r[6] || 0),
              suppliers: Number(r[7] || 0),
              avgEur: Number(r[8] || 0),
              hhi: Number(r[9] || 0),
              linkedCount: Number(r[12] || 0),
              ownHits: Number(r[13] || 0),
              riskScore: Number(r[14] || 0),
            };
            live.authoritiesList.push(a);
            if (a.eik) live.authoritiesByEik[a.eik] = a;
          });
        }

        if (deepJson) {
          (deepJson.hiddenConsortiumLeaderboard || []).forEach(function (lb) {
            if (lb.slug) live.deepBySlug[lb.slug] = lb;
          });
          (deepJson.deepLinks || []).forEach(function (dl) {
            if (isExcludedName(dl.politician)) return;
            var eik = String(dl.companyEik || '');
            if (eik) {
              if (!live.deepLinksByEik[eik]) live.deepLinksByEik[eik] = [];
              live.deepLinksByEik[eik].push(dl);
            }
            var pn = norm(dl.politician);
            if (pn) {
              if (!live.deepLinksByPerson[pn]) live.deepLinksByPerson[pn] = [];
              live.deepLinksByPerson[pn].push(dl);
            }
          });
        }

        if (macroJson && macroJson.cartelEngine) {
          live.coBiddingPairs = macroJson.cartelEngine.coBiddingPairs || [];
          (macroJson.cartelEngine.consortiumHubs || []).forEach(function (h) {
            if (h.eik) live.consortiumHubsByEik[h.eik] = h;
          });
        }

        if (j6Json && j6Json.riskAdjustments && j6Json.riskAdjustments.companies) {
          live.judicialCompanies = j6Json.riskAdjustments.companies;
        }

        live.loaded = true;
        return live;
      });

      return live.loadingPromise;
    }

    function findOfficial(nameOrSlug) {
      if (!nameOrSlug || isExcludedName(nameOrSlug)) return null;
      if (live.officialsBySlug[nameOrSlug]) return live.officialsBySlug[nameOrSlug];
      var q = norm(nameOrSlug);
      if (live.officialsByNormName[q]) return live.officialsByNormName[q];
      // Support composite labels separated by " / "
      var parts = String(nameOrSlug).split('/').map(function (x) { return norm(x); }).filter(Boolean);
      for (var i = 0; i < parts.length; i++) {
        if (live.officialsByNormName[parts[i]]) return live.officialsByNormName[parts[i]];
      }
      for (var j = 0; j < live.officials.length; j++) {
        var o = live.officials[j];
        var on = norm(o.name);
        if (q.length >= 6 && (on.indexOf(q) !== -1 || q.indexOf(on) !== -1)) return o;
      }
      return null;
    }

    function findDeepLinksForPerson(name) {
      if (!name || isExcludedName(name)) return [];
      var out = [];
      var parts = String(name).split('/').map(function (x) { return norm(x); }).filter(Boolean);
      parts.forEach(function (p) {
        if (live.deepLinksByPerson[p]) {
          out = out.concat(live.deepLinksByPerson[p]);
        } else {
          Object.keys(live.deepLinksByPerson).forEach(function (k) {
            if (p.length >= 6 && (k.indexOf(p) !== -1 || p.indexOf(k) !== -1)) {
              out = out.concat(live.deepLinksByPerson[k]);
            }
          });
        }
      });
      return out;
    }

    function findCompany(eikOrName) {
      if (!eikOrName) return null;
      var s = String(eikOrName).trim();
      if (live.companiesByEik[s]) return live.companiesByEik[s];
      var eiks = extractEiks(s);
      for (var i = 0; i < eiks.length; i++) {
        if (live.companiesByEik[eiks[i]]) return live.companiesByEik[eiks[i]];
      }
      var q = norm(s).replace(/\s*\(\d{9}.*$/, '');
      if (q.length < 4) return null;
      for (var j = 0; j < live.companiesList.length; j++) {
        if (norm(live.companiesList[j].name).indexOf(q) !== -1) return live.companiesList[j];
      }
      return null;
    }

    function findAuthority(eikOrName) {
      if (!eikOrName) return null;
      var s = String(eikOrName).trim();
      if (live.authoritiesByEik[s]) return live.authoritiesByEik[s];
      var q = norm(s);
      if (q.length < 4) return null;
      for (var i = 0; i < live.authoritiesList.length; i++) {
        var an = norm(live.authoritiesList[i].name);
        if (an === q || an.indexOf(q) !== -1 || q.indexOf(an) !== -1) return live.authoritiesList[i];
      }
      return null;
    }

    function findLocalRelated(tokens, excludeId) {
      var clean = (tokens || [])
        .map(function (t) { return norm(t); })
        .filter(function (t) { return t.length >= 4; });
      if (!clean.length) return [];
      var matches = [];
      allLocal.forEach(function (rec) {
        if (rec.id === excludeId) return;
        var blob = norm(
          [
            rec.name,
            rec.company,
            rec.party,
            rec.judge,
            rec.firm,
            rec.owner,
            rec.signal,
            rec.court,
            rec.details,
            rec.eik,
            rec.authEik,
            (rec.eiks || []).join(' '),
          ].join(' ')
        );
        var hit = clean.some(function (tok) {
          return blob.indexOf(tok) !== -1;
        });
        if (hit) matches.push(rec);
      });
      return matches;
    }

    function recordDisplayTitle(rec) {
      if (rec._kind === 'politician') return rec.name;
      if (rec._kind === 'corp' || rec._kind === 'security') return rec.party + ' → ' + rec.judge;
      if (rec._kind === 'cartel') return rec.firm;
      return rec.name;
    }

    function recordKindLabel(rec) {
      if (rec._kind === 'politician') return 'Политическо лице / Борд';
      if (rec._kind === 'corp') return 'ЕИСС Корпоративен флаг';
      if (rec._kind === 'security') return 'ЕИСС ЧНД / Орган';
      if (rec._kind === 'cartel') return 'ЗМИП / Анекси';
      return rec.cat || 'EPPO / ЗЧОД';
    }

    // Navigation history stack for infinite multi-hop tracing
    var historyStack = [];
    var currentView = null;
    var lastCopyText = '';

    function openDrawerShell() {
      backdrop.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }

    function closeDrawerShell() {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }

    function renderBreadcrumbs() {
      if (!navBar || !crumbsEl) return;
      if (historyStack.length <= 1) {
        navBar.hidden = true;
        return;
      }
      navBar.hidden = false;
      crumbsEl.innerHTML = historyStack
        .map(function (entry, idx) {
          var isLast = idx === historyStack.length - 1;
          var shortLbl = entry.label.length > 26 ? entry.label.slice(0, 25) + '…' : entry.label;
          if (isLast) {
            return '<span class="svet-crumb is-current">' + esc(shortLbl) + '</span>';
          }
          return (
            '<button type="button" class="svet-crumb" data-svet-crumb="' +
            idx +
            '">' +
            esc(shortLbl) +
            '</button><span class="svet-crumb-sep">&rarr;</span>'
          );
        })
        .join('');
    }

    function buildChainVisualHtml(steps) {
      return (
        '<div class="drawer-section">' +
        '<h4>Верига на зависимостите (клик върху възел за преход)</h4>' +
        '<div class="svet-chain-flow">' +
        steps
          .map(function (st, idx) {
            var pills = (st.nodes || [])
              .map(function (n) {
                if (n.action) {
                  return (
                    '<button type="button" class="svet-chain-pill ' +
                    esc(n.cls || '') +
                    '" ' +
                    n.action +
                    '>' +
                    esc(n.label) +
                    ' &rarr;</button>'
                  );
                }
                return '<span class="svet-chain-pill is-static ' + esc(n.cls || '') + '">' + esc(n.label) + '</span>';
              })
              .join('');
            return (
              '<div class="svet-chain-step">' +
              '<div class="svet-chain-step-num">' +
              (idx + 1) +
              '. ' +
              esc(st.stage) +
              '</div>' +
              '<div class="svet-chain-pills">' +
              (pills || '<span class="muted">Няма директно засичане</span>') +
              '</div>' +
              '</div>'
            );
          })
          .join('') +
        '</div>' +
        '</div>'
      );
    }

    function buildLocalMatchesSection(matches) {
      if (!matches || !matches.length) return '';
      return (
        '<div class="drawer-section">' +
        '<h4>Свързани записи в крос-регистърния радар (' +
        matches.length +
        ')</h4>' +
        '<ul class="cluster-people">' +
        matches
          .slice(0, 12)
          .map(function (m) {
            return (
              '<li data-svet-open-record="' +
              esc(m.id) +
              '">' +
              '<span><span class="svetlina-badge is-indigo" style="margin-right:6px;">' +
              esc(recordKindLabel(m)) +
              '</span><strong>' +
              esc(recordDisplayTitle(m)) +
              '</strong></span>' +
              '<span class="mono" style="color:var(--crimson);font-weight:700;">' +
              esc(m.mult || m.eur || m.zop || m.val || 'Досие →') +
              '</span>' +
              '</li>'
            );
          })
          .join('') +
        '</ul>' +
        '</div>'
      );
    }

    function buildActionToolbar(filterQuery) {
      return (
        '<div class="svet-drawer-actions">' +
        '<button type="button" class="btn btn-dark" id="svetCopyBriefBtn">Копирай одитна справка</button>' +
        (filterQuery
          ? '<button type="button" class="btn" data-svet-apply-filter="' +
            esc(filterQuery) +
            '">Филтрирай таблиците по този възел</button>'
          : '') +
        '<span class="svet-copy-toast" id="svetCopyToast" hidden>Копирано в клипборда</span>' +
        '</div>'
      );
    }

    // -------------------------------------------------------------------------
    // RENDERER 1: CURATED RECORD DOSSIER (ANY ROW FROM THE 5 TABLES)
    // -------------------------------------------------------------------------
    function renderRecord(recId) {
      var rec = localById[recId];
      if (!rec) return;

      var title = recordDisplayTitle(rec);
      kickerEl.textContent = recordKindLabel(rec).toUpperCase() + ' · ' + (rec.sectorLabel || '');
      titleEl.textContent = title;

      var allEiks = []
        .concat(rec.eiks || [])
        .concat(rec.eik ? [rec.eik] : [])
        .concat(extractEiks(rec.company || rec.party || rec.firm || rec.name || ''));
      var uniqEiks = [];
      allEiks.forEach(function (e) {
        if (e && uniqEiks.indexOf(e) === -1) uniqEiks.push(e);
      });

      var badgeParts = [];
      if (rec.risk) badgeParts.push('<span class="tag tag-crimson">Риск индекс: ' + esc(rec.risk) + '/100</span>');
      if (rec.level) {
        badgeParts.push(
          '<span class="tag ' +
            (rec.level === 'RED' ? 'tag-crimson' : 'tag-ochre') +
            '">ЕИСС Флаг: ' +
            esc(rec.level) +
            '</span>'
        );
      }
      if (rec.mult) badgeParts.push('<span class="tag tag-crimson">Кратност: ' + esc(rec.mult) + '</span>');
      if (uniqEiks[0]) {
        badgeParts.push(
          '<a class="tag tag-navy" href="https://sigma.midt.bg/companies/' +
            esc(uniqEiks[0]) +
            '" target="_blank" rel="noopener">СИГМА 2.0 ↗</a>'
        );
        badgeParts.push(
          '<a class="tag tag-teal" href="https://portal.registryagency.bg/CR/Reports/ActiveConditionTabResult?uic=' +
            esc(uniqEiks[0]) +
            '" target="_blank" rel="noopener">Търговски регистър ↗</a>'
        );
      }
      if (rec.judge) {
        badgeParts.push(
          '<a class="tag tag-navy" href="https://ecase.justice.bg/" target="_blank" rel="noopener noreferrer">ЕПЕП / ЕИСС ↗</a>'
        );
      }
      badgesEl.innerHTML = badgeParts.join('');

      var off = rec._kind === 'politician' ? findOfficial(rec.name) : null;
      var deepPersonHits = rec._kind === 'politician' ? findDeepLinksForPerson(rec.name) : [];
      var primaryComp = uniqEiks.length ? findCompany(uniqEiks[0]) : findCompany(rec.party || rec.firm || rec.name);
      var primaryAuth = rec.authEik ? findAuthority(rec.authEik) : findAuthority(rec.party || '');

      // Collect linked officials for the primary EIKs
      var linkedOfficials = [];
      if (live.loaded && uniqEiks.length) {
        live.officials.forEach(function (o) {
          if (
            (o.companies || []).some(function (oc) {
              return oc.eik && uniqEiks.indexOf(oc.eik) !== -1;
            })
          ) {
            linkedOfficials.push(o);
          }
        });
      }
      var deepEikHits = [];
      uniqEiks.forEach(function (e) {
        if (live.deepLinksByEik[e]) deepEikHits = deepEikHits.concat(live.deepLinksByEik[e]);
      });

      // Collect co-bidding partners & consortium hubs
      var pairs = [];
      var hub = null;
      if (live.loaded && uniqEiks.length) {
        pairs = live.coBiddingPairs.filter(function (p) {
          return uniqEiks.indexOf(p.eikA) !== -1 || uniqEiks.indexOf(p.eikB) !== -1;
        });
        for (var hi = 0; hi < uniqEiks.length; hi++) {
          if (live.consortiumHubsByEik[uniqEiks[hi]]) {
            hub = live.consortiumHubsByEik[uniqEiks[hi]];
            break;
          }
        }
      }

      // Local cross-matches across the 5 tables
      var searchTokens = uniqEiks.slice();
      if (rec.judge) searchTokens.push(rec.judge.split('(')[0].split('/')[0].trim());
      if (rec.name) searchTokens.push(rec.name.split('/')[0].trim());
      if (rec.party) searchTokens.push(rec.party.split('(')[0].trim());
      if (rec.firm) searchTokens.push(rec.firm.split('(')[0].trim());
      var localMatches = findLocalRelated(searchTokens, rec.id);

      // Build interactive 4-step dependency chain diagram
      var stage1Nodes = [];
      if (rec._kind === 'politician') {
        stage1Nodes.push({
          label: rec.name + ' (' + rec.role + ')',
          cls: 'is-crimson',
          action: off ? 'data-svet-open-official="' + esc(off.slug) + '"' : '',
        });
      } else {
        linkedOfficials.slice(0, 3).forEach(function (lo) {
          stage1Nodes.push({
            label: lo.name + ' · ' + lo.primaryInstitution,
            cls: 'is-crimson',
            action: 'data-svet-open-official="' + esc(lo.slug) + '"',
          });
        });
        deepEikHits.slice(0, 3).forEach(function (dl) {
          stage1Nodes.push({
            label: dl.politician + ' (' + dl.institution + ')',
            cls: 'is-crimson',
            action: 'data-svet-open-official="' + esc(dl.politician) + '"',
          });
        });
        if (!stage1Nodes.length && primaryAuth) {
          stage1Nodes.push({
            label: primaryAuth.name,
            cls: 'is-navy',
            action: 'data-svet-open-authority="' + esc(primaryAuth.eik) + '"',
          });
        }
        if (!stage1Nodes.length && rec.owner) {
          stage1Nodes.push({ label: rec.owner, cls: 'is-ochre' });
        }
      }

      var stage2Nodes = [];
      uniqEiks.slice(0, 4).forEach(function (e) {
        var c = live.companiesByEik[e];
        stage2Nodes.push({
          label: (c ? c.name : 'ЕИК ' + e) + ' (' + e + ')',
          cls: 'is-plum',
          action: 'data-svet-open-company="' + esc(e) + '"',
        });
      });
      if (!stage2Nodes.length && (rec.party || rec.firm || rec.company)) {
        stage2Nodes.push({ label: rec.party || rec.firm || rec.company, cls: 'is-plum' });
      }

      var stage3Nodes = [];
      if (off && off.byAuthority && off.byAuthority.length) {
        off.byAuthority.slice(0, 3).forEach(function (a) {
          stage3Nodes.push({
            label: a.name + ' (' + fmtEur(a.valueEur) + ')',
            cls: 'is-navy',
            action: 'data-svet-open-authority="' + esc(a.id) + '"',
          });
        });
      } else if (primaryAuth) {
        stage3Nodes.push({
          label: primaryAuth.name + ' (' + fmtEur(primaryAuth.spentEur) + ')',
          cls: 'is-navy',
          action: 'data-svet-open-authority="' + esc(primaryAuth.eik) + '"',
        });
      } else if (pairs.length) {
        pairs.slice(0, 2).forEach(function (p) {
          var isA = uniqEiks.indexOf(p.eikA) !== -1;
          var pEik = isA ? p.eikB : p.eikA;
          var pName = isA ? p.nameB : p.nameA;
          stage3Nodes.push({
            label: 'ДЗЗД партньор: ' + pName + ' (' + p.jointCount + '×)',
            cls: 'is-ochre',
            action: 'data-svet-open-company="' + esc(pEik) + '"',
          });
        });
      }
      if (!stage3Nodes.length) {
        stage3Nodes.push({ label: rec.sectorLabel || 'Публичен сектор', cls: 'is-navy' });
      }

      var stage4Nodes = [];
      if (rec.judge) {
        stage4Nodes.push({
          label: rec.judge + ' · ' + rec.court + ' (' + rec.mult + ')',
          cls: 'is-indigo',
          action: 'data-svet-open-judge="' + esc(rec.judge.split('(')[0].split('/')[0].trim()) + '"',
        });
      }
      localMatches.forEach(function (m) {
        if ((m._kind === 'corp' || m._kind === 'security') && stage4Nodes.length < 3) {
          stage4Nodes.push({
            label: m.judge + ' · ' + m.court + ' (' + m.mult + ')',
            cls: 'is-indigo',
            action: 'data-svet-open-judge="' + esc(m.judge.split('(')[0].split('/')[0].trim()) + '"',
          });
        }
      });
      if (!stage4Nodes.length && (rec.court || rec.details)) {
        stage4Nodes.push({ label: rec.court || rec.cat || 'Крос-регистърна проверка', cls: 'is-indigo' });
      }

      // KPI Strip
      var kpiHtml = '';
      if (rec._kind === 'politician') {
        kpiHtml =
          '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">' +
          '<div class="kpi-card"><div class="kpi-label">Риск индекс</div><div class="kpi-val" style="font-size:15px;color:var(--crimson);">' +
          esc(rec.risk) +
          '/100</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">ЗОП &amp; ДЗЗД обем</div><div class="kpi-val" style="font-size:13px;">' +
          esc(rec.eur) +
          '</div></div>' +
          '<div class="kpi-card emphasis"><div class="kpi-label">Свързани ЕИК</div><div class="kpi-val" style="font-size:15px;color:var(--plum);">' +
          uniqEiks.length +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Връзки в радара</div><div class="kpi-val" style="font-size:15px;">' +
          (localMatches.length + (off ? off.contractCount : 0)) +
          '</div></div>' +
          '</div>';
      } else if (rec._kind === 'corp' || rec._kind === 'security') {
        kpiHtml =
          '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">' +
          '<div class="kpi-card emphasis"><div class="kpi-label">Разпределени (k/n)</div><div class="kpi-val" style="font-size:14px;">' +
          esc(rec.kn) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Очаквани (случайно)</div><div class="kpi-val" style="font-size:15px;">' +
          esc(rec.exp || 'биномно') +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Кратност</div><div class="kpi-val" style="font-size:15px;color:var(--crimson);">' +
          esc(rec.mult) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">FDR q-стойност</div><div class="kpi-val" style="font-size:14px;">' +
          esc(rec.q) +
          '</div></div>' +
          '</div>';
      } else {
        kpiHtml =
          '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px;">' +
          '<div class="kpi-card emphasis"><div class="kpi-label">Финансов обем</div><div class="kpi-val" style="font-size:14px;">' +
          esc(rec.zop || rec.val) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Ресор</div><div class="kpi-val" style="font-size:13px;">' +
          esc(rec.sectorLabel) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Свързани записи</div><div class="kpi-val" style="font-size:15px;color:var(--crimson);">' +
          (localMatches.length + pairs.length) +
          '</div></div>' +
          '</div>';
      }

      // Main Forensic Summary Block
      var summaryRows = '';
      if (rec.signal || rec.details) {
        summaryRows +=
          '<div class="contract-row" style="border-left:3px solid var(--crimson);"><strong>Крос-регистърна констатация:</strong> ' +
          esc(rec.signal || rec.details) +
          '</div>';
      }
      if (rec.annex) {
        summaryRows +=
          '<div class="contract-row" style="border-left:3px solid var(--ochre);"><strong>Изменения чрез анекси (Модул F7):</strong> ' +
          esc(rec.annex) +
          '</div>';
      }
      if (rec.owner) {
        summaryRows +=
          '<div class="contract-row"><strong>Действителен собственик / ТР статус:</strong> ' + esc(rec.owner) + '</div>';
      }
      if (rec.court && rec._kind === 'cartel') {
        summaryRows += '<div class="contract-row"><strong>Съдебен / ЗМИП статус:</strong> ' + esc(rec.court) + '</div>';
      }

      // Live enrichment sections
      var liveHtml = '';
      if (!live.loaded) {
        liveHtml =
          '<div class="drawer-section"><div class="muted" style="font-size:12px;">Зареждане на пълните публични регистри на NAsvetlo (СИГМА 2.0, ДЗЗД партньори, договори и КПКОНПИ XML)...</div></div>';
      } else {
        // Official details (if politician found in officials_all.json)
        if (off) {
          liveHtml += buildOfficialLiveBlocks(off);
        }
        // Deep links (Table 9 / declarations) for politician or EIK
        var allDeep = deepPersonHits.concat(deepEikHits);
        if (allDeep.length) {
          var seenDl = {};
          var dedupDeep = allDeep.filter(function (d) {
            var k = d.politician + '|' + d.companyEik + '|' + d.declarationYear;
            if (seenDl[k]) return false;
            seenDl[k] = true;
            return true;
          });
          liveHtml +=
            '<div class="drawer-section">' +
            '<h4>Декларации в КПКОНПИ / Табл. 9 и Търговски регистър (' +
            dedupDeep.length +
            ')</h4>' +
            dedupDeep
              .slice(0, 8)
              .map(function (d) {
                return (
                  '<div class="contract-row" style="border-left:3px solid var(--plum);">' +
                  '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
                  '<strong>' +
                  esc(d.politician) +
                  '</strong>' +
                  '<span class="mono muted">' +
                  esc(d.declarationYear) +
                  ' · ' +
                  esc(d.linkType) +
                  '</span>' +
                  '</div>' +
                  '<div style="font-size:12px;margin-top:3px;">' +
                  esc(d.institution) +
                  ' (' +
                  esc(d.position) +
                  ') &rarr; <a href="#" data-svet-open-company="' +
                  esc(d.companyEik) +
                  '"><strong>' +
                  esc(d.companyName) +
                  '</strong></a> (ЕИК ' +
                  esc(d.companyEik) +
                  ') · ЗОП: <strong>' +
                  fmtEur(d.companyWonEur) +
                  '</strong></div>' +
                  (d.rawSnippet ? '<div class="muted" style="font-size:11.5px;margin-top:3px;">' + esc(d.rawSnippet) + '</div>' : '') +
                  (d.declarationUrl
                    ? '<div style="margin-top:4px;"><a class="mono" style="font-size:11.5px;" href="' +
                      esc(d.declarationUrl) +
                      '" target="_blank" rel="noopener">Оригинална XML декларация (КПКОНПИ / Сметна палата) ↗</a></div>'
                    : '') +
                  '</div>'
                );
              })
              .join('') +
            '</div>';
        }

        // Primary company profile + co-bidding DZZD partners
        if (primaryComp) {
          liveHtml += buildCompanyQuickBlock(primaryComp, pairs, hub);
        }
      }

      var copyLines = [
        'NASVETLO · ОДИТНА СПРАВКА ЗА ПРОСЛЕДЯВАНЕ НА ЗАВИСИМОСТИ',
        'Възел: ' + title,
        'Ресор: ' + (rec.sectorLabel || ''),
        rec.role ? 'Длъжност: ' + rec.role : '',
        rec.company ? 'Свързани компании: ' + rec.company : '',
        rec.court ? 'Съд: ' + rec.court : '',
        rec.judge ? 'Съдия: ' + rec.judge + ' (' + (rec.kn || '') + ', ' + (rec.mult || '') + ', FDR q=' + (rec.q || '') + ')' : '',
        rec.eur || rec.zop || rec.val ? 'Финансов обем: ' + (rec.eur || rec.zop || rec.val) : '',
        rec.signal || rec.details ? 'Констатация: ' + (rec.signal || rec.details) : '',
        'Източник: NAsvetlo (отворени данни CC-BY 4.0) · За всички лица важи презумпцията за невиновност.',
      ].filter(Boolean);
      lastCopyText = copyLines.join('\n');

      bodyEl.innerHTML =
        buildActionToolbar(
          rec._kind === 'politician'
            ? rec.name.split('/')[0].trim()
            : rec.judge
            ? rec.judge.split('(')[0].split('/')[0].trim()
            : uniqEiks[0] || ''
        ) +
        kpiHtml +
        buildChainVisualHtml([
          { stage: 'Политическо лице / Орган / Собственик', nodes: stage1Nodes },
          { stage: 'Свързани дружества & ЕИК', nodes: stage2Nodes },
          { stage: 'Възложители, Ресор & ДЗЗД партньори', nodes: stage3Nodes },
          { stage: 'Съдебен възел в ЕИСС / Контролен орган', nodes: stage4Nodes },
        ]) +
        (summaryRows ? '<div class="drawer-section"><h4>Крос-регистърни данни</h4>' + summaryRows + '</div>' : '') +
        liveHtml +
        buildLocalMatchesSection(localMatches);
    }

    function buildOfficialLiveBlocks(o) {
      var html = '';
      // Institutions
      if (o.institutions && o.institutions.length) {
        html +=
          '<div class="drawer-section"><h4>Декларирани публични длъжности (СИГМА / КПКОНПИ)</h4>' +
          o.institutions
            .map(function (inst) {
              return (
                '<div class="contract-row"><strong>' +
                esc(inst.institution) +
                '</strong><br/><span class="muted">' +
                esc((inst.positions || []).join('; ')) +
                ' · Години: ' +
                esc((inst.years || []).join(', ')) +
                '</span></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Companies
      if (o.companies && o.companies.length) {
        html +=
          '<div class="drawer-section"><h4>Свързани дружества (' +
          o.companies.length +
          ') — клик за досие на фирмата</h4>' +
          o.companies
            .map(function (c) {
              return (
                '<div class="contract-row">' +
                '<div style="display:flex;justify-content:space-between;gap:8px;">' +
                '<strong><a href="#" data-svet-open-company="' +
                esc(c.eik) +
                '">' +
                esc(c.name) +
                ' &rarr;</a></strong>' +
                '<span class="mono muted">ЕИК ' +
                esc(c.eik) +
                '</span></div>' +
                '<div class="muted" style="margin-top:3px;font-size:12px;">Роля: ' +
                esc((c.roles || []).join(', ')) +
                (c.missingYears && c.missingYears.length
                  ? ' · Липсва в декл.: <strong style="color:var(--crimson);">' + esc(c.missingYears.join(', ')) + '</strong>'
                  : '') +
                '</div></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Relatives
      if (o.relatives && o.relatives.length) {
        html +=
          '<div class="drawer-section"><h4>Свързани физически лица (Търговски регистър)</h4>' +
          o.relatives
            .map(function (r) {
              return (
                '<div class="contract-row"><strong style="color:var(--plum);">' +
                esc(r.name) +
                '</strong> <span class="muted">(' +
                esc(r.role) +
                ')</span></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Hidden DZZD
      var dc = o.slug && live.deepBySlug[o.slug];
      if (dc && dc.topConsortia && dc.topConsortia.length) {
        html +=
          '<div class="drawer-section">' +
          '<h4 style="color:var(--plum);">Скрити ДЗЗД консорциуми (+' +
          fmtEur(dc.hiddenConsortiumEur) +
          ' · ' +
          fmtInt(dc.hiddenConsortiumCount) +
          ' ДЗЗД)</h4>' +
          dc.topConsortia
            .slice(0, 6)
            .map(function (tc) {
              return (
                '<div class="contract-row" style="border-left:3px solid var(--plum);">' +
                '<div style="display:flex;justify-content:space-between;gap:8px;"><strong class="mono" style="color:var(--plum);">' +
                fmtEur(tc.wonEur) +
                '</strong><span class="mono muted">' +
                fmtInt(tc.contracts) +
                ' дог.</span></div>' +
                '<div style="font-size:12px;margin-top:2px;">' +
                esc(tc.name) +
                '</div></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Authorities
      if (o.byAuthority && o.byAuthority.length) {
        html +=
          '<div class="drawer-section"><h4>Основни възложители (Топ ' +
          Math.min(8, o.byAuthority.length) +
          ' от ' +
          fmtInt(o.byAuthorityTotal || o.byAuthority.length) +
          ')</h4>' +
          o.byAuthority
            .slice(0, 8)
            .map(function (a) {
              return (
                '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">' +
                '<a href="#" data-svet-open-authority="' +
                esc(a.id) +
                '">' +
                esc(a.name) +
                ' &rarr;</a>' +
                '<span class="mono" style="white-space:nowrap;font-weight:600;">' +
                fmtEur(a.valueEur) +
                ' (' +
                fmtInt(a.contracts) +
                ')</span></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Top Contracts
      if (o.topContracts && o.topContracts.length) {
        html +=
          '<div class="drawer-section"><h4>Най-големи договори по ЦАИС ЕОП (Топ ' +
          Math.min(6, o.topContracts.length) +
          ')</h4>' +
          o.topContracts
            .slice(0, 6)
            .map(function (ct) {
              return (
                '<div class="contract-row">' +
                '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;flex-wrap:wrap;">' +
                '<span class="mono" style="font-weight:700;">' +
                fmtEur(ct.valueEur) +
                '</span>' +
                '<span class="mono muted">' +
                esc(ct.signedAt) +
                (ct.duringOffice ? ' <span class="tag tag-ochre">в периода</span>' : '') +
                '</span></div>' +
                '<div style="font-size:12px;margin-bottom:4px;">' +
                esc(ct.subject) +
                '</div>' +
                '<div class="muted" style="font-size:11.5px;">Възложител: <a href="#" data-svet-open-authority="' +
                esc(ct.authorityId || ct.authority) +
                '"><strong>' +
                esc(ct.authority) +
                '</strong></a> · Изпълнител: <a href="#" data-svet-open-company="' +
                esc(ct.eik) +
                '">' +
                esc(ct.company) +
                '</a></div></div>'
              );
            })
            .join('') +
          '</div>';
      }
      // Declarations
      if (o.declarations && o.declarations.length) {
        html +=
          '<div class="drawer-section"><h4>Декларации в КПКОНПИ / Сметна палата (' +
          o.declarations.length +
          ')</h4>' +
          o.declarations
            .slice(0, 6)
            .map(function (d) {
              return (
                '<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);">' +
                '<span><strong>' +
                esc(d.year) +
                '</strong> (' +
                esc(d.type) +
                ') · ' +
                esc(d.institution) +
                '</span>' +
                (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener" class="mono">XML ↗</a>' : '') +
                '</div>'
              );
            })
            .join('') +
          '</div>';
      }
      return html;
    }

    function buildCompanyQuickBlock(c, pairs, hub) {
      var html = '';
      var jComp = c.eik && live.judicialCompanies[c.eik];
      html +=
        '<div class="drawer-section">' +
        '<h4>Корпоративен профил в ЦАИС ЕОП — <a href="#" data-svet-open-company="' +
        esc(c.eik) +
        '">' +
        esc(c.name) +
        ' (ЕИК ' +
        esc(c.eik) +
        ') &rarr;</a></h4>' +
        '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px;">' +
        '<div class="kpi-card"><div class="kpi-label">Директни (€)</div><div class="kpi-val" style="font-size:14px;">' +
        fmtEur(c.wonEur) +
        '</div></div>' +
        '<div class="kpi-card emphasis"><div class="kpi-label">Чрез ДЗЗД (€)</div><div class="kpi-val" style="font-size:14px;color:var(--plum);">+' +
        fmtEur(c.consortiumEur) +
        '</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">Договори</div><div class="kpi-val" style="font-size:14px;">' +
        fmtInt(c.contracts) +
        '</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">Възложители</div><div class="kpi-val" style="font-size:14px;">' +
        fmtInt(c.authorities) +
        '</div></div>' +
        '</div>';

      if (jComp && jComp.reasons && jComp.reasons.length) {
        html +=
          '<div class="contract-row" style="border-left:3px solid #4f46e5;"><strong>Криминалистичен профил (Модул J6 · Риск ' +
          esc(jComp.score) +
          '/100):</strong> ' +
          jComp.reasons
            .map(function (r) {
              return '<span class="tag tag-crimson" style="margin:2px;">' + esc(r) + '</span>';
            })
            .join(' ') +
          '</div>';
      }
      html += '</div>';

      if (pairs && pairs.length) {
        html +=
          '<div class="drawer-section">' +
          '<h4>Повтарящи се ДЗЗД партньори по веригата (' +
          pairs.length +
          ')</h4>' +
          pairs
            .slice(0, 8)
            .map(function (p) {
              var isA = p.eikA === c.eik;
              var pName = isA ? p.nameB : p.nameA;
              var pEik = isA ? p.eikB : p.eikA;
              return (
                '<div class="contract-row"><div style="display:flex;justify-content:space-between;gap:8px;">' +
                '<a href="#" data-svet-open-company="' +
                esc(pEik) +
                '"><strong>' +
                esc(pName) +
                '</strong> (ЕИК ' +
                esc(pEik) +
                ') &rarr;</a>' +
                '<span class="mono" style="color:var(--crimson);font-weight:700;">' +
                fmtInt(p.jointCount) +
                ' ДЗЗД · ' +
                fmtEur(p.jointEur) +
                '</span></div></div>'
              );
            })
            .join('') +
          '</div>';
      }

      if (hub && hub.sampleConsortia && hub.sampleConsortia.length) {
        html +=
          '<div class="drawer-section">' +
          '<h4>Участия в ДЗЗД консорциуми (' +
          fmtInt(hub.consortiumCount) +
          ' общо · Множител ' +
          esc(hub.shadowMultiplier) +
          '×)</h4>' +
          hub.sampleConsortia
            .slice(0, 6)
            .map(function (sc) {
              return (
                '<div class="contract-row"><strong class="mono" style="color:var(--plum);">' +
                fmtEur(sc.wonEur) +
                '</strong> · ' +
                esc(sc.name) +
                '</div>'
              );
            })
            .join('') +
          '</div>';
      }
      return html;
    }

    // -------------------------------------------------------------------------
    // RENDERER 2: OFFICIAL DOSSIER (DRILL-DOWN BY SLUG OR NAME)
    // -------------------------------------------------------------------------
    function renderOfficial(slugOrName) {
      if (isExcludedName(slugOrName)) return;
      var o = findOfficial(slugOrName);
      var deepHits = findDeepLinksForPerson(o ? o.name : slugOrName);
      var displayName = o ? o.name : slugOrName;

      kickerEl.textContent = o
        ? 'ДЛЪЖНОСТНО ЛИЦЕ · ' + String(o.circle || 'ПУБЛИЧЕН РЕГИСТЪР').toUpperCase()
        : 'ДЛЪЖНОСТНО ЛИЦЕ · КПКОНПИ / ТАБЛ. 9';
      titleEl.textContent = displayName;

      var badges = [];
      if (o && o.sigmaUrl) {
        badges.push('<a class="tag tag-navy" href="' + esc(o.sigmaUrl) + '" target="_blank" rel="noopener">СИГМА 2.0 ↗</a>');
      }
      if (o && o.ownInstitution) badges.push('<span class="tag tag-crimson">Самовъзлагане (собствена институция)</span>');
      if (o && o.riskScore) badges.push('<span class="tag tag-crimson">Риск индекс: ' + esc(o.riskScore) + '/100</span>');
      badgesEl.innerHTML = badges.join('');

      var eiks = o ? (o.companies || []).map(function (c) { return c.eik; }).filter(Boolean) : [];
      deepHits.forEach(function (d) {
        if (d.companyEik && eiks.indexOf(d.companyEik) === -1) eiks.push(d.companyEik);
      });
      var localMatches = findLocalRelated([displayName].concat(eiks), '');

      var dc = o && o.slug ? live.deepBySlug[o.slug] : null;
      var kpiHtml = o
        ? '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">' +
          '<div class="kpi-card"><div class="kpi-label">В периода</div><div class="kpi-val" style="font-size:14px;">' +
          fmtEur(o.periodEur) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Общо ЗОП</div><div class="kpi-val" style="font-size:14px;">' +
          fmtEur(o.totalEur) +
          '</div></div>' +
          '<div class="kpi-card emphasis"><div class="kpi-label">Скрити ДЗЗД</div><div class="kpi-val" style="font-size:14px;color:var(--plum);">+' +
          fmtEur(dc ? dc.hiddenConsortiumEur : 0) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Договори</div><div class="kpi-val" style="font-size:14px;">' +
          fmtInt(o.contractCount) +
          '</div></div></div>'
        : '';

      var deepHtml = deepHits.length
        ? '<div class="drawer-section"><h4>КПКОНПИ Табл. 9 / Търговски регистър (' +
          deepHits.length +
          ')</h4>' +
          deepHits
            .map(function (d) {
              return (
                '<div class="contract-row" style="border-left:3px solid var(--plum);">' +
                '<strong>' +
                esc(d.institution) +
                '</strong> (' +
                esc(d.position) +
                ') · ' +
                esc(d.linkType) +
                '<br/><a href="#" data-svet-open-company="' +
                esc(d.companyEik) +
                '"><strong>' +
                esc(d.companyName) +
                '</strong> (ЕИК ' +
                esc(d.companyEik) +
                ') &rarr;</a> · ЗОП: <strong>' +
                fmtEur(d.companyWonEur) +
                '</strong>' +
                (d.declarationUrl
                  ? '<div style="margin-top:4px;"><a class="mono" style="font-size:11.5px;" href="' +
                    esc(d.declarationUrl) +
                    '" target="_blank" rel="noopener">Оригинална XML декларация ↗</a></div>'
                  : '') +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        : '';

      lastCopyText =
        'NASVETLO · ПРОФИЛ НА ДЛЪЖНОСТНО ЛИЦЕ\n' +
        'Лице: ' +
        displayName +
        (o ? '\nИнституция: ' + o.primaryInstitution + '\nОбщо ЗОП: ' + fmtEur(o.totalEur) + ' (' + o.contractCount + ' дог.)' : '') +
        '\nИзточник: NAsvetlo (CC-BY 4.0) · Презумпция за невиновност.';

      bodyEl.innerHTML =
        buildActionToolbar(displayName) +
        kpiHtml +
        (o ? buildOfficialLiveBlocks(o) : '') +
        deepHtml +
        buildLocalMatchesSection(localMatches);
    }

    // -------------------------------------------------------------------------
    // RENDERER 3: COMPANY DOSSIER (DRILL-DOWN BY EIK OR NAME)
    // -------------------------------------------------------------------------
    function renderCompany(eikOrName) {
      var c = findCompany(eikOrName);
      var eik = c ? c.eik : extractEiks(eikOrName)[0] || String(eikOrName);
      var name = c ? c.name : String(eikOrName);

      kickerEl.textContent =
        c && c.isConsortium ? 'КОНСОРЦИУМ / ДЗЗД ОБЕДИНЕНИЕ' : 'КОМПАНИЯ ИЗПЪЛНИТЕЛ · ЕИК ' + eik;
      titleEl.textContent = name;

      var badges = [];
      if (/^\d{9}$/.test(eik)) {
        badges.push(
          '<a class="tag tag-navy" href="https://sigma.midt.bg/companies/' +
            esc(eik) +
            '" target="_blank" rel="noopener">СИГМА 2.0 ↗</a>'
        );
        badges.push(
          '<a class="tag tag-teal" href="https://portal.registryagency.bg/CR/Reports/ActiveConditionTabResult?uic=' +
            esc(eik) +
            '" target="_blank" rel="noopener">Търговски регистър ↗</a>'
        );
      }
      if (c && c.settlement) badges.push('<span class="tag">' + esc(c.settlement) + '</span>');
      badgesEl.innerHTML = badges.join('');

      var linkedOffs = live.officials.filter(function (o) {
        return (o.companies || []).some(function (oc) {
          return oc.eik && oc.eik === eik;
        });
      });
      var deepEik = live.deepLinksByEik[eik] || [];
      var pairs = live.coBiddingPairs.filter(function (p) {
        return p.eikA === eik || p.eikB === eik;
      });
      var hub = live.consortiumHubsByEik[eik] || null;
      var localMatches = findLocalRelated([eik, name], '');

      var stage1 = linkedOffs
        .map(function (o) {
          return {
            label: o.name + ' (' + o.primaryInstitution + ')',
            cls: 'is-crimson',
            action: 'data-svet-open-official="' + esc(o.slug) + '"',
          };
        })
        .concat(
          deepEik.slice(0, 4).map(function (d) {
            return {
              label: d.politician + ' (' + d.institution + ')',
              cls: 'is-crimson',
              action: 'data-svet-open-official="' + esc(d.politician) + '"',
            };
          })
        );

      var stage3 = pairs.slice(0, 3).map(function (p) {
        var isA = p.eikA === eik;
        return {
          label: (isA ? p.nameB : p.nameA) + ' (' + p.jointCount + ' ДЗЗД)',
          cls: 'is-ochre',
          action: 'data-svet-open-company="' + esc(isA ? p.eikB : p.eikA) + '"',
        };
      });

      var stage4 = localMatches
        .filter(function (m) { return m.judge; })
        .slice(0, 3)
        .map(function (m) {
          return {
            label: m.judge + ' · ' + m.court + ' (' + m.mult + ')',
            cls: 'is-indigo',
            action: 'data-svet-open-judge="' + esc(m.judge.split('(')[0].split('/')[0].trim()) + '"',
          };
        });

      var offListHtml = '';
      if (linkedOffs.length || deepEik.length) {
        offListHtml =
          '<div class="drawer-section"><h4>Свързани длъжностни лица и политици (СИГМА &times; КПКОНПИ Табл. 9)</h4><ul class="cluster-people">' +
          linkedOffs
            .map(function (o) {
              return (
                '<li data-svet-open-official="' +
                esc(o.slug) +
                '"><span><strong>' +
                esc(o.name) +
                '</strong> <span class="muted">· ' +
                esc(o.primaryInstitution) +
                '</span></span><span class="mono">' +
                fmtEur(o.periodEur) +
                '</span></li>'
              );
            })
            .join('') +
          deepEik
            .slice(0, 8)
            .map(function (d) {
              return (
                '<li data-svet-open-official="' +
                esc(d.politician) +
                '"><span><strong>' +
                esc(d.politician) +
                '</strong> <span class="muted">· ' +
                esc(d.institution) +
                ' (' +
                esc(d.linkType) +
                ')</span></span><span class="mono">' +
                esc(d.declarationYear) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul></div>';
      }

      lastCopyText =
        'NASVETLO · КОРПОРАТИВНА СПРАВКА\n' +
        'Дружество: ' +
        name +
        ' (ЕИК ' +
        eik +
        ')' +
        (c ? '\nДиректни ЗОП: ' + fmtEur(c.wonEur) + ' | Чрез ДЗЗД: ' + fmtEur(c.consortiumEur) + ' | Договори: ' + c.contracts : '') +
        '\nИзточник: NAsvetlo (CC-BY 4.0) · Презумпция за невиновност.';

      bodyEl.innerHTML =
        buildActionToolbar(eik) +
        buildChainVisualHtml([
          { stage: 'Свързани политически и длъжностни лица', nodes: stage1 },
          { stage: 'Изследвано дружество', nodes: [{ label: name + ' (' + eik + ')', cls: 'is-plum' }] },
          { stage: 'Повтарящи се ДЗЗД партньори', nodes: stage3 },
          { stage: 'Съдебни концентрации в ЕИСС', nodes: stage4 },
        ]) +
        (c ? buildCompanyQuickBlock(c, pairs, hub) : '') +
        offListHtml +
        buildLocalMatchesSection(localMatches);
    }

    // -------------------------------------------------------------------------
    // RENDERER 4: AUTHORITY / MINISTRY DOSSIER
    // -------------------------------------------------------------------------
    function renderAuthority(eikOrName) {
      var a = findAuthority(eikOrName);
      var title = a ? a.name : String(eikOrName);
      var eik = a ? a.eik : extractEiks(eikOrName)[0] || '';

      kickerEl.textContent = 'ПУБЛИЧЕН ВЪЗЛОЖИТЕЛ · ' + String((a && a.type) || 'ИНСТИТУЦИЯ').toUpperCase();
      titleEl.textContent = title;
      badgesEl.innerHTML = eik
        ? '<a class="tag tag-navy" href="https://sigma.midt.bg/authorities/' +
          esc(eik) +
          '" target="_blank" rel="noopener">СИГМА 2.0 ↗</a>' +
          (a && a.region ? '<span class="tag">' + esc(a.region) + '</span>' : '')
        : '';

      var linkedOffs = live.officials.filter(function (o) {
        return (o.byAuthority || []).some(function (ba) {
          return (eik && ba.id === eik) || norm(ba.name) === norm(title);
        });
      });
      var localMatches = findLocalRelated([eik, title], '');

      var kpiHtml = a
        ? '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">' +
          '<div class="kpi-card emphasis"><div class="kpi-label">Разпределени ЗОП</div><div class="kpi-val" style="font-size:14px;">' +
          fmtEur(a.spentEur) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Договори</div><div class="kpi-val" style="font-size:14px;">' +
          fmtInt(a.contracts) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Изпълнители</div><div class="kpi-val" style="font-size:14px;">' +
          fmtInt(a.suppliers) +
          '</div></div>' +
          '<div class="kpi-card"><div class="kpi-label">Свързани лица</div><div class="kpi-val" style="font-size:14px;color:var(--crimson);">' +
          fmtInt(a.linkedCount) +
          '</div></div></div>'
        : '';

      var offHtml = linkedOffs.length
        ? '<div class="drawer-section"><h4>Длъжностни лица с договори при този възложител (' +
          linkedOffs.length +
          ')</h4><ul class="cluster-people">' +
          linkedOffs
            .slice(0, 12)
            .map(function (o) {
              var hit = (o.byAuthority || []).find(function (ba) {
                return (eik && ba.id === eik) || norm(ba.name) === norm(title);
              });
              return (
                '<li data-svet-open-official="' +
                esc(o.slug) +
                '"><span><strong>' +
                esc(o.name) +
                '</strong> <span class="muted">· ' +
                esc(o.primaryInstitution) +
                '</span></span><span class="mono">' +
                (hit ? fmtEur(hit.valueEur) : fmtEur(o.periodEur)) +
                '</span></li>'
              );
            })
            .join('') +
          '</ul></div>'
        : '';

      lastCopyText =
        'NASVETLO · СПРАВКА ЗА ВЪЗЛОЖИТЕЛ\n' +
        'Възложител: ' +
        title +
        (eik ? ' (ЕИК ' + eik + ')' : '') +
        (a ? '\nОбем ЗОП: ' + fmtEur(a.spentEur) + ' (' + a.contracts + ' дог.)' : '') +
        '\nИзточник: NAsvetlo (CC-BY 4.0).';

      bodyEl.innerHTML = buildActionToolbar(title.slice(0, 20)) + kpiHtml + offHtml + buildLocalMatchesSection(localMatches);
    }

    // -------------------------------------------------------------------------
    // RENDERER 5: EISS JUDGE / COURT CLUSTER DOSSIER
    // -------------------------------------------------------------------------
    function renderJudge(judgeName) {
      var cleanJ = String(judgeName || '').trim();
      var jNorm = norm(cleanJ);
      var judgeCases = allLocal.filter(function (rec) {
        return rec.judge && norm(rec.judge).indexOf(jNorm) !== -1;
      });

      kickerEl.textContent = 'СЪДЕБЕН ВЪЗЕЛ В ЕПЕП / ЕИСС · СТАТИСТИЧЕСКИ ОДИТ';
      titleEl.textContent = cleanJ;
      badgesEl.innerHTML =
        '<span class="tag tag-crimson">' +
        judgeCases.length +
        ' статистически флага в радара</span>' +
        '<a class="tag tag-navy" href="https://ecase.justice.bg/" target="_blank" rel="noopener noreferrer">ЕПЕП / ЕИСС ↗</a>';

      var partyEiks = [];
      judgeCases.forEach(function (jc) {
        if (jc.eik && partyEiks.indexOf(jc.eik) === -1) partyEiks.push(jc.eik);
      });
      var linkedRecs = findLocalRelated(partyEiks, '');

      var stageParties = judgeCases.map(function (jc) {
        return {
          label: jc.party + ' (' + jc.mult + ')',
          cls: 'is-plum',
          action: jc.eik ? 'data-svet-open-company="' + esc(jc.eik) + '"' : 'data-svet-open-record="' + esc(jc.id) + '"',
        };
      });

      var casesHtml =
        '<div class="drawer-section"><h4>Засечени концентрации при съдия ' +
        esc(cleanJ) +
        ' (' +
        judgeCases.length +
        ')</h4>' +
        judgeCases
          .map(function (jc) {
            return (
              '<div class="contract-row" style="border-left:3px solid var(--crimson);">' +
              '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
              '<strong>' +
              esc(jc.party) +
              '</strong>' +
              '<span class="mono" style="color:var(--crimson);font-weight:700;">' +
              esc(jc.mult) +
              ' · FDR q=' +
              esc(jc.q) +
              '</span></div>' +
              '<div class="muted" style="font-size:12px;margin-top:3px;">' +
              esc(jc.court) +
              ' · Разпределени дела: <strong>' +
              esc(jc.kn) +
              '</strong>' +
              (jc.exp ? ' (очаквани при случайност: ' + esc(jc.exp) + ')' : '') +
              '</div>' +
              (jc.eik
                ? '<div style="margin-top:5px;"><button type="button" class="svet-chain-pill is-plum" data-svet-open-company="' +
                  esc(jc.eik) +
                  '">Отвори корпоративната верига (ЕИК ' +
                  esc(jc.eik) +
                  ') &rarr;</button></div>'
                : '') +
              '</div>'
            );
          })
          .join('') +
        '</div>';

      lastCopyText =
        'NASVETLO · СЪДЕБНА СТАТИСТИЧЕСКА СПРАВКА (ЕИСС)\n' +
        'Съдия-докладчик: ' +
        cleanJ +
        '\nБрой флагове в радара: ' +
        judgeCases.length +
        '\n' +
        judgeCases
          .map(function (jc) {
            return '- ' + jc.court + ' | ' + jc.party + ' | ' + jc.kn + ' | ' + jc.mult + ' | FDR q=' + jc.q;
          })
          .join('\n') +
        '\nЗабележка: Статистически сигнал върху публични данни от ЕПЕП/ЕИСС. Презумпция за невиновност.';

      bodyEl.innerHTML =
        buildActionToolbar(cleanJ) +
        buildChainVisualHtml([
          { stage: 'Съдия-докладчик в ЕИСС', nodes: [{ label: cleanJ, cls: 'is-indigo' }] },
          { stage: 'Концентрирани страни / институции', nodes: stageParties },
          {
            stage: 'Свързани политици / бордове по ЕИК',
            nodes: linkedRecs
              .filter(function (m) { return m._kind === 'politician'; })
              .slice(0, 4)
              .map(function (m) {
                return {
                  label: m.name + ' (' + m.role + ')',
                  cls: 'is-crimson',
                  action: 'data-svet-open-record="' + esc(m.id) + '"',
                };
              }),
          },
        ]) +
        casesHtml +
        buildLocalMatchesSection(linkedRecs.filter(function (m) { return m._kind !== 'corp' && m._kind !== 'security'; }));
    }

    // Dispatcher with history stack + progressive live enrichment
    function navigateTo(view, pushHistory) {
      currentView = view;
      if (pushHistory !== false) {
        historyStack.push(view);
        if (historyStack.length > 14) historyStack.shift();
      }
      renderBreadcrumbs();
      openDrawerShell();
      bodyEl.scrollTop = 0;

      function runRender() {
        if (view.type === 'record') renderRecord(view.key);
        else if (view.type === 'official') renderOfficial(view.key);
        else if (view.type === 'company') renderCompany(view.key);
        else if (view.type === 'authority') renderAuthority(view.key);
        else if (view.type === 'judge') renderJudge(view.key);
      }

      runRender();
      if (!live.loaded) {
        ensureLiveDatasets().then(function () {
          if (currentView === view) runRender();
        });
      }
    }

    // Delegated click handler across the entire page + inside the drawer
    document.addEventListener('click', function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      var recEl = target.closest('[data-svet-open-record]');
      if (recEl) {
        ev.preventDefault();
        var rid = recEl.getAttribute('data-svet-open-record');
        var rec = localById[rid];
        navigateTo({ type: 'record', key: rid, label: rec ? recordDisplayTitle(rec) : rid }, true);
        return;
      }

      var offEl = target.closest('[data-svet-open-official]');
      if (offEl) {
        ev.preventDefault();
        var okey = offEl.getAttribute('data-svet-open-official');
        var oObj = live.officialsBySlug[okey];
        navigateTo({ type: 'official', key: okey, label: oObj ? oObj.name : okey }, true);
        return;
      }

      var compEl = target.closest('[data-svet-open-company]');
      if (compEl) {
        ev.preventDefault();
        var ckey = compEl.getAttribute('data-svet-open-company');
        var cObj = live.companiesByEik[ckey];
        navigateTo({ type: 'company', key: ckey, label: cObj ? cObj.name : 'ЕИК ' + ckey }, true);
        return;
      }

      var authEl = target.closest('[data-svet-open-authority]');
      if (authEl) {
        ev.preventDefault();
        var akey = authEl.getAttribute('data-svet-open-authority');
        var aObj = live.authoritiesByEik[akey];
        navigateTo({ type: 'authority', key: akey, label: aObj ? aObj.name : akey }, true);
        return;
      }

      var judgeEl = target.closest('[data-svet-open-judge]');
      if (judgeEl) {
        ev.preventDefault();
        var jkey = judgeEl.getAttribute('data-svet-open-judge');
        navigateTo({ type: 'judge', key: jkey, label: 'Съдия ' + jkey }, true);
        return;
      }

      var crumbEl = target.closest('[data-svet-crumb]');
      if (crumbEl) {
        var idx = Number(crumbEl.getAttribute('data-svet-crumb'));
        if (idx >= 0 && idx < historyStack.length) {
          var targetView = historyStack[idx];
          historyStack = historyStack.slice(0, idx + 1);
          navigateTo(targetView, false);
        }
        return;
      }

      var applyFilterEl = target.closest('[data-svet-apply-filter]');
      if (applyFilterEl) {
        var q = applyFilterEl.getAttribute('data-svet-apply-filter') || '';
        if (filterApi && filterApi.searchAll) {
          filterApi.searchAll(q);
        }
        closeDrawerShell();
        return;
      }

      if (target.id === 'svetCopyBriefBtn') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(lastCopyText).then(function () {
            var toast = document.getElementById('svetCopyToast');
            if (toast) {
              toast.hidden = false;
              window.setTimeout(function () {
                toast.hidden = true;
              }, 2200);
            }
          });
        }
      }
    });

    // Keyboard Enter/Space accessibility on clickable table rows & SVG nodes
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && drawer.classList.contains('open')) {
        closeDrawerShell();
        return;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && document.activeElement) {
        var el = document.activeElement;
        if (
          el.hasAttribute('data-svet-open-record') ||
          el.hasAttribute('data-svet-open-company') ||
          el.hasAttribute('data-svet-open-judge')
        ) {
          ev.preventDefault();
          el.click();
        }
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        historyStack = [];
        closeDrawerShell();
      });
    }
    backdrop.addEventListener('click', function () {
      historyStack = [];
      closeDrawerShell();
    });
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        if (historyStack.length > 1) {
          historyStack.pop();
          var prev = historyStack[historyStack.length - 1];
          navigateTo(prev, false);
        }
      });
    }
  }

  // ===========================================================================
  // MINISTRY SECTORS, VISUAL CHART DECK, REGISTER TABS & SEARCH CONTROLS
  // ===========================================================================
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
    if (!input) return null;

    var activeSector = 'mrrb';
    var activeTab = 'all';

    var sectorNames = {
      all: 'Всички 6 ресора (Пълен национален регистър)',
      mrrb: 'Ресор 01 · МРРБ, АПИ и пътна инфраструктура (€3,84 млрд.)',
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

    sectorButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeSector = btn.getAttribute('data-svet-sector') || 'all';
        syncSectorUI();
        applyFilter();
      });
    });

    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-svet-tab') || 'all';
        tabButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        applyFilter();
      });
    });

    function searchAll(val) {
      input.value = val || '';
      activeSector = 'all';
      activeTab = 'all';
      syncSectorUI();
      tabButtons.forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-svet-tab') === 'all');
      });
      applyFilter();
      var tabsEl = document.getElementById('svetlinaTabBar');
      if (tabsEl && tabsEl.scrollIntoView) {
        tabsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    quickChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        searchAll(chip.getAttribute('data-svet-quick') || '');
      });
    });

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

    return { searchAll: searchAll };
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initGate();
    var filterApi = initControls();
    initDependencyDrawer(filterApi);
  });
})();
