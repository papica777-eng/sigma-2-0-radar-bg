// =============================================================================
// NAsvetlo · „От мрак към светлина“ — Автоматичен таймер, SHA-256 ключ,
// Навигатор по 6 Министерства / Дейности, Компактен превключвател на графики
// и Десен панел (Slide-Over Drawer) за проследяване на зависимостите по веригата
// =============================================================================
(function () {
  'use strict';

  var EXCLUDED_RE = /росица.*велкова|велкова-желева|поля.*занева|занева-димитрова/i;

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

  var mergedPayloadCache = null;
  var runtimePayloadPromise = null;

  function parsePayload() {
    if (mergedPayloadCache) return mergedPayloadCache;
    var el = document.getElementById('svetlinaGraphPayload');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || '{}');
    } catch (e) {
      return null;
    }
  }

  function ensureRuntimePayload() {
    if (runtimePayloadPromise) return runtimePayloadPromise;
    var base = parsePayload() || {};
    if (base.judicialMap && base.networkData) {
      mergedPayloadCache = base;
      runtimePayloadPromise = Promise.resolve(base);
      return runtimePayloadPromise;
    }
    var url = base.runtimePayloadUrl || 'data/svetlina_runtime_payload.json?v=20261127c';
    runtimePayloadPromise = fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (extra) {
        mergedPayloadCache = Object.assign({}, base, extra || {});
        return mergedPayloadCache;
      })
      .catch(function () {
        mergedPayloadCache = base;
        return base;
      });
    return runtimePayloadPromise;
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
  // PUBLISHED AUDIT GATE (INSTANT UNLOCK & SHA-256 PREVIEW KEY SUPPORT)
  // ===========================================================================
  function initGate() {
    var vault = document.getElementById('svetlinaVault');
    var content = document.getElementById('svetlinaVaultContent');
    if (!vault || !content) return;

    var timerGrid = document.getElementById('svetlinaTimerGrid');
    var progressWrap = document.getElementById('svetlinaProgressWrap');

    function unlockNow() {
      vault.classList.add('is-unlocked');
      if (timerGrid) {
        timerGrid.hidden = true;
        timerGrid.style.display = 'none';
      }
      if (progressWrap) {
        progressWrap.hidden = true;
        progressWrap.style.display = 'none';
      }
      content.hidden = false;
      content.removeAttribute('hidden');
    }

    // Always immediately unlock for published access
    unlockNow();

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
    var oblastByNuts3 = {};
    var allJudicialFlags = [];
    if (payload.judicialMap && Array.isArray(payload.judicialMap.oblasts)) {
      payload.judicialMap.oblasts.forEach(function (ob) {
        oblastByNuts3[ob.nuts3] = ob;
        (ob.topFlags || []).forEach(function (tf) {
          allJudicialFlags.push(Object.assign({ nuts3: ob.nuts3, oblastName: ob.name }, tf));
        });
      });
    }
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
        '<button type="button" class="btn svet-signal-btn" id="svetDrawerSignalBtn">⚖ Генерирай сигнал</button>' +
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
          '<div class="drawer-section"><div class="muted" style="font-size:12px;">Зареждане на пълните публични регистри на NAsvetlo (СИГМА 2.0, ДЗЗД партньори, договори и КПК XML)...</div></div>';
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
            '<h4>Декларации в КПК / Табл. 9 и Търговски регистър (' +
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
                      '" target="_blank" rel="noopener">Оригинална XML декларация (КПК / Сметна палата) ↗</a></div>'
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
          '<div class="drawer-section"><h4>Декларирани публични длъжности (СИГМА / КПК)</h4>' +
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
          '<div class="drawer-section"><h4>Декларации в КПК / Сметна палата (' +
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
        : 'ДЛЪЖНОСТНО ЛИЦЕ · КПК / ТАБЛ. 9';
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
        ? '<div class="drawer-section"><h4>КПК Табл. 9 / Търговски регистър (' +
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
          '<div class="drawer-section"><h4>Свързани длъжностни лица и политици (СИГМА &times; КПК Табл. 9)</h4><ul class="cluster-people">' +
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
      var mapFlagsForJudge = allJudicialFlags.filter(function (tf) {
        return tf.judge && norm(tf.judge).indexOf(jNorm) !== -1;
      });

      var totalCount = Math.max(judgeCases.length, mapFlagsForJudge.length);
      kickerEl.textContent = 'СЪДЕБЕН ВЪЗЕЛ В ЕПЕП / ЕИСС · СТАТИСТИЧЕСКИ ОДИТ';
      titleEl.textContent = cleanJ;
      badgesEl.innerHTML =
        '<span class="tag tag-crimson">' +
        totalCount +
        ' статистически флага в радара</span>' +
        '<a class="tag tag-navy" href="https://ecase.justice.bg/" target="_blank" rel="noopener noreferrer">ЕПЕП / ЕИСС ↗</a>';

      var partyEiks = [];
      judgeCases.forEach(function (jc) {
        if (jc.eik && partyEiks.indexOf(jc.eik) === -1) partyEiks.push(jc.eik);
      });
      mapFlagsForJudge.forEach(function (mf) {
        if (mf.eik && partyEiks.indexOf(mf.eik) === -1) partyEiks.push(mf.eik);
      });
      var linkedRecs = findLocalRelated(partyEiks, '');

      var unifiedCases = mapFlagsForJudge.length
        ? mapFlagsForJudge.map(function (mf) {
            return {
              court: mf.court + ' · ' + mf.kind + ' (' + mf.year + ')',
              party: mf.party + (mf.eik ? ' (' + mf.eik + ')' : ''),
              eik: mf.eik,
              kn: mf.k + ' / ' + mf.n,
              exp: String(mf.exp),
              mult: '×' + Number(mf.ratio).toFixed(2).replace('.', ','),
              q: Number(mf.q) < 0.001 ? Number(mf.q).toExponential(2) : Number(mf.q).toFixed(4),
              caseUrl: mf.caseUrl,
              caseRef: mf.caseRef,
              nuts3: mf.nuts3,
              oblastName: mf.oblastName,
            };
          })
        : judgeCases.map(function (jc) {
            return {
              court: jc.court,
              party: jc.party,
              eik: jc.eik,
              kn: jc.kn,
              exp: jc.exp,
              mult: jc.mult,
              q: jc.q,
              caseUrl: '',
              caseRef: '',
              nuts3: '',
              oblastName: '',
            };
          });

      var stageParties = unifiedCases.slice(0, 5).map(function (jc) {
        return {
          label: jc.party + ' (' + jc.mult + ')',
          cls: 'is-plum',
          action: jc.eik ? 'data-svet-open-company="' + esc(jc.eik) + '"' : '',
        };
      });

      var casesHtml =
        '<div class="drawer-section"><h4>Засечени концентрации при съдия ' +
        esc(cleanJ) +
        ' (' +
        unifiedCases.length +
        ')</h4>' +
        unifiedCases
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
              '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">' +
              (jc.eik
                ? '<button type="button" class="svet-chain-pill is-plum" data-svet-open-company="' +
                  esc(jc.eik) +
                  '">Корпоративна верига (ЕИК ' +
                  esc(jc.eik) +
                  ') &rarr;</button>'
                : '') +
              (jc.nuts3
                ? '<button type="button" class="svet-chain-pill is-navy" data-svet-open-oblast="' +
                  esc(jc.nuts3) +
                  '">Област ' +
                  esc(jc.oblastName) +
                  ' &rarr;</button>'
                : '') +
              (jc.caseUrl
                ? '<a class="svet-chain-pill is-indigo" href="' +
                  esc(jc.caseUrl) +
                  '" target="_blank" rel="noopener noreferrer">Примерно дело ' +
                  esc(jc.caseRef) +
                  ' в ЕПЕП ↗</a>'
                : '') +
              '</div></div>'
            );
          })
          .join('') +
        '</div>';

      lastCopyText =
        'NASVETLO · СЪДЕБНА СТАТИСТИЧЕСКА СПРАВКА (ЕИСС)\n' +
        'Съдия-докладчик: ' +
        cleanJ +
        '\nБрой флагове в радара: ' +
        unifiedCases.length +
        '\n' +
        unifiedCases
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

    // -------------------------------------------------------------------------
    // RENDERER 6: 28-OBLAST JUDICIAL RADAR DOSSIER (ALL COURTS & RED FLAGS)
    // -------------------------------------------------------------------------
    function renderOblast(nuts3) {
      var ob = oblastByNuts3[nuts3];
      if (!ob) return;

      kickerEl.textContent = 'СЪДЕБЕН ПРОФИЛ НА ОБЛАСТ · ' + ob.nuts3 + ' · ' + String(ob.nuts2Name || '').toUpperCase();
      titleEl.textContent = 'Област ' + ob.name + ' — ' + ob.courtsCount + ' съдилища в ЕИСС';
      badgesEl.innerHTML =
        '<span class="tag ' +
        (ob.redFlags >= 10 ? 'tag-crimson' : ob.redFlags > 0 ? 'tag-ochre' : 'tag-teal') +
        '">' +
        ob.redFlags +
        ' RED флага (q &lt; 0,01)</span>' +
        '<span class="tag tag-navy">' +
        ob.amberFlags +
        ' AMBER флага</span>' +
        '<span class="tag">Макс. кратност: ×' +
        Number(ob.maxRatio || 0).toFixed(2).replace('.', ',') +
        '</span>';

      var oblastNameShort = ob.name.replace(/\s*\(столица\)/i, '').trim();
      var localMatches = findLocalRelated([oblastNameShort], '');

      var kpiHtml =
        '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px;">' +
        '<div class="kpi-card"><div class="kpi-label">Съдилища</div><div class="kpi-val" style="font-size:15px;">' +
        fmtInt(ob.courtsCount) +
        '</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">Дела (' +
        esc((payload.universeMeta && payload.universeMeta.yearRange) || '2023–2026') +
        ')</div><div class="kpi-val" style="font-size:14px;">' +
        fmtInt(ob.cases) +
        '</div></div>' +
        '<div class="kpi-card emphasis"><div class="kpi-label">RED (Необяснени)</div><div class="kpi-val" style="font-size:15px;color:var(--crimson);">' +
        fmtInt(ob.redFlags) +
        ' <span style="font-size:11px;color:var(--ink-secondary);">(' +
        fmtInt(ob.unexplainedRed || 0) +
        ')</span></div></div>' +
        '<div class="kpi-card"><div class="kpi-label">RED / 10 000 дела</div><div class="kpi-val" style="font-size:14px;">' +
        String(ob.ratePer10k).replace('.', ',') +
        '</div></div></div>';

      var courtsHtml =
        '<div class="drawer-section"><h4>Всички съдилища в област ' +
        esc(ob.name) +
        ' (' +
        ob.courts.length +
        ')</h4>' +
        '<div class="table-wrap" style="max-height:240px;overflow-y:auto;"><table><thead><tr>' +
        '<th>Съд</th><th class="num">Дела</th><th class="num">Съдии</th><th class="num">RED</th><th class="num">AMBER</th>' +
        '</tr></thead><tbody>' +
        ob.courts
          .map(function (c) {
            return (
              '<tr><td><strong>' +
              esc(c.name) +
              '</strong></td><td class="mono num">' +
              fmtInt(c.cases) +
              '</td><td class="mono num">' +
              fmtInt(c.judges) +
              '</td><td class="mono num" style="color:' +
              (c.red > 0 ? 'var(--crimson);font-weight:700;' : 'var(--ink-muted);') +
              '">' +
              fmtInt(c.red) +
              '</td><td class="mono num">' +
              fmtInt(c.amber) +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div></div>';

      var flagsHtml = ob.topFlags.length
        ? '<div class="drawer-section"><h4>Всички статистически RED концентрации Страна &rarr; Съдия в областта (' +
          ob.topFlags.length +
          ' от ' +
          ob.redFlags +
          ')</h4>' +
          (ob.topFlags.length > 8
            ? '<input type="search" id="svetOblastFlagSearch" placeholder="Филтрирай по съд, съдия, страна или ЕИК в област ' +
              esc(ob.name) +
              '..." style="width:100%;padding:7px 10px;margin-bottom:10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--ink);font-size:12.5px;" />'
            : '') +
          '<div id="svetOblastFlagsWrap">' +
          ob.topFlags
            .map(function (tf) {
              var qStr = Number(tf.q) < 0.001 ? Number(tf.q).toExponential(2) : Number(tf.q).toFixed(4);
              var isUnexp = tf.tier === 'UNEXPLAINED_PRIORITY';
              var borderCol = isUnexp ? 'var(--crimson)' : tf.tier === 'STATUTORY_ZSRS_DUTY' ? 'var(--teal)' : 'var(--ochre)';
              var maxDayPct = Math.round(Number(tf.maxDayShare || 0) * 100);
              return (
                '<div class="contract-row svet-ob-flag-row" style="border-left:3px solid ' +
                borderCol +
                ';">' +
                '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">' +
                '<strong>' +
                esc(tf.party) +
                (tf.eik ? ' (' + esc(tf.eik) + ')' : '') +
                '</strong>' +
                '<span class="mono" style="color:var(--crimson);font-weight:700;">×' +
                Number(tf.ratio).toFixed(2).replace('.', ',') +
                ' (' +
                tf.k +
                '/' +
                tf.n +
                ')</span></div>' +
                '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                '<span class="svetlina-badge ' +
                esc(tf.tierCls || 'is-indigo') +
                '">' +
                esc(tf.tierShort || tf.tierLabel || '') +
                '</span>' +
                (tf.distinctDays
                  ? '<span class="mono muted" style="font-size:11px;">' +
                    tf.distinctDays +
                    ' д. / ' +
                    tf.distinctMonths +
                    ' мес. (макс. ' +
                    maxDayPct +
                    '%/ден)</span>'
                  : '') +
                (tf.procEur > 0
                  ? '<span class="mono" style="font-size:11px;color:var(--ochre);font-weight:700;">ЗОП: ' +
                    fmtEur(tf.procEur) +
                    '</span>'
                  : '') +
                '</div>' +
                '<div class="muted" style="font-size:12px;margin-top:3px;">' +
                esc(tf.court) +
                ' · ' +
                esc(tf.kind) +
                ' (' +
                esc(tf.year) +
                ') · Съдия: <strong>' +
                esc(tf.judge) +
                '</strong> · FDR q=' +
                esc(qStr) +
                '</div>' +
                (tf.basis
                  ? '<div class="muted" style="font-size:11px;margin-top:3px;font-style:italic;">' +
                    esc(tf.basis) +
                    '</div>'
                  : '') +
                '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button type="button" class="svet-chain-pill is-indigo" data-svet-open-judge="' +
                esc(tf.judge) +
                '">Профил на съдията &rarr;</button>' +
                (tf.eik
                  ? '<button type="button" class="svet-chain-pill is-plum" data-svet-open-company="' +
                    esc(tf.eik) +
                    '">Верига ЕИК ' +
                    esc(tf.eik) +
                    ' &rarr;</button>'
                  : '') +
                (tf.caseUrl
                  ? '<a class="svet-chain-pill is-navy" href="' +
                    esc(tf.caseUrl) +
                    '" target="_blank" rel="noopener noreferrer">Дело ' +
                    esc(tf.caseRef) +
                    ' в ЕПЕП ↗</a>'
                  : '') +
                '</div></div>'
              );
            })
            .join('') +
          '</div></div>'
        : '<div class="drawer-section"><div class="contract-row" style="border-left:3px solid #0d7a5f;">В област ' +
          esc(ob.name) +
          ' няма засечени RED флагове при праг q &lt; 0,01, k ≥ 5 и кратност ≥ 3.</div></div>';

      lastCopyText =
        'NASVETLO · ОБЛАСТНА СЪДЕБНА СПРАВКА (ЕИСС)\n' +
        'Област: ' +
        ob.name +
        ' (' +
        ob.nuts3 +
        ')\nСъдилища: ' +
        ob.courtsCount +
        ' | Дела: ' +
        ob.cases +
        ' | Съдии: ' +
        ob.judges +
        '\nRED флагове: ' +
        ob.redFlags +
        ' | AMBER флагове: ' +
        ob.amberFlags +
        ' | Макс. кратност: ×' +
        ob.maxRatio +
        '\nИзточник: ЕПЕП / ЕИСС (' +
        ((payload.universeMeta && payload.universeMeta.yearRange) || '2023–2026') +
        ') · Статистически сигнали при презумпция за невиновност.';

      bodyEl.innerHTML =
        buildActionToolbar(oblastNameShort) +
        kpiHtml +
        courtsHtml +
        flagsHtml +
        buildLocalMatchesSection(localMatches);

      var obSearch = document.getElementById('svetOblastFlagSearch');
      if (obSearch) {
        obSearch.addEventListener('input', function () {
          var q = norm(obSearch.value);
          var items = bodyEl.querySelectorAll('.svet-ob-flag-row');
          items.forEach(function (it) {
            it.hidden = Boolean(q) && norm(it.textContent).indexOf(q) === -1;
          });
        });
      }
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
        else if (view.type === 'oblast') renderOblast(view.key);
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

      var obDrawerEl = target.closest('[data-svet-open-oblast]');
      if (obDrawerEl) {
        ev.preventDefault();
        var n3 = obDrawerEl.getAttribute('data-svet-open-oblast');
        var obObj = oblastByNuts3[n3];
        navigateTo({ type: 'oblast', key: n3, label: obObj ? 'Обл. ' + obObj.name : n3 }, true);
        return;
      }

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
        return;
      }

      if (target.id === 'svetDrawerSignalBtn') {
        document.dispatchEvent(
          new CustomEvent('svet:open-signal', {
            detail: {
              kind: 'drawer',
              title: titleEl ? titleEl.textContent : 'Досие от ЕИСС',
              summary: lastCopyText || '',
            },
          })
        );
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

    return {
      openJudge: function (name) {
        if (name && !isExcludedName(name)) {
          navigateTo({ type: 'judge', key: name, label: 'Съдия ' + name }, true);
        }
      },
      openCompany: function (eikOrName) {
        if (!eikOrName) return;
        var cObj = live.companiesByEik[eikOrName];
        navigateTo({ type: 'company', key: eikOrName, label: cObj ? cObj.name : 'ЕИК ' + eikOrName }, true);
      },
      openOfficial: function (nameOrSlug) {
        if (!nameOrSlug || isExcludedName(nameOrSlug)) return;
        var oObj = live.officialsBySlug[nameOrSlug] || live.officialsByNormName[norm(nameOrSlug)];
        navigateTo({ type: 'official', key: oObj ? oObj.slug : nameOrSlug, label: oObj ? oObj.name : nameOrSlug }, true);
      },
      openRecord: function (rid) {
        if (!rid) return;
        var rec = localById[rid];
        navigateTo({ type: 'record', key: rid, label: rec ? recordDisplayTitle(rec) : rid }, true);
      },
      openOblast: function (n3) {
        if (!n3) return;
        var obObj = oblastByNuts3[n3];
        navigateTo({ type: 'oblast', key: n3, label: obObj ? 'Обл. ' + obObj.name : n3 }, true);
      },
    };
  }

  // ===========================================================================
  // MINISTRY SECTORS, VISUAL CHART DECK, REGISTER TABS & SEARCH CONTROLS
  // ===========================================================================
  function initControls(networkGraphApi) {
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
    var allRedTierSel = document.getElementById('svetAllRedTierFilter');
    var allRedTierPills = document.querySelectorAll('[data-svet-tier-pick]');
    var allRedOblastSel = document.getElementById('svetAllRedOblastFilter');
    var allRedKindSel = document.getElementById('svetAllRedKindFilter');
    var allRedCountEl = document.getElementById('svetAllRedCount');
    var allRedTbody = document.getElementById('svetAllRedTbody');
    var loadAllRedBtn = document.getElementById('svetLoadAllRedBtn');
    var allRedMoreBar = document.getElementById('svetAllRedMoreBar');
    if (!input) return null;

    var extraRowsHydrated = false;
    function ensureExtraRowsHydrated() {
      if (extraRowsHydrated) return;
      extraRowsHydrated = true;
      var payload = parsePayload() || {};
      var extraRows = payload.extraRedRows || [];
      if (allRedTbody && extraRows.length) {
        var frag = document.createDocumentFragment();
        extraRows.forEach(function (rf) {
          var tr = document.createElement('tr');
          tr.className = 'svet-row-clickable';
          tr.setAttribute('data-sector', 'jud');
          tr.setAttribute('data-nuts3', rf.nuts3 || '');
          tr.setAttribute('data-kind', rf.kind || '');
          tr.setAttribute('data-tier', rf.tier || '');
          tr.setAttribute('data-svet-open-judge', rf.judge || '');
          tr.setAttribute('tabindex', '0');

          var qNum = Number(rf.q || 0);
          var qStr = qNum < 0.001 ? qNum.toExponential(2) : qNum.toFixed(4);
          var ratioStr = Number(rf.ratio || 0).toFixed(2).replace('.', ',');
          var obShort = String(rf.oblastName || '').replace(' (столица)', ' (гр.)');
          var zopHtml = Number(rf.procEur || 0) > 0 ? '<div class="sv-zop">ЗОП: ' + esc(fmtEur(rf.procEur)) + '</div>' : '';
          var restrHtml = Number(rf.restrPct || 0) >= 50 ? '<div class="muted">Огр. достъп: ' + esc(rf.restrPct) + '%</div>' : '';
          var eikHtml = rf.eik ? '<div class="mono muted sv-eik">ЕИК ' + esc(rf.eik) + '</div>' : '';
          var caseHtml = rf.caseUrl
            ? '<a class="svet-inspect-pill" href="' + esc(rf.caseUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(rf.caseRef || 'ЕПЕП') + ' ↗</a>'
            : '<span class="svet-inspect-pill">Досие &rarr;</span>';

          tr.innerHTML =
            '<td class="mono muted">' + esc(rf.idx) + '</td>' +
            '<td><span class="svetlina-badge ' + esc(rf.tierCls) + '">' + esc(rf.tierShort) + '</span></td>' +
            '<td><span class="svetlina-badge is-indigo">' + esc(obShort) + '</span></td>' +
            '<td><strong>' + esc(rf.court) + '</strong><div class="muted sv-sub">' + esc(rf.kind) + ' (' + esc(rf.year) + ')</div></td>' +
            '<td><strong>' + esc(rf.party) + '</strong>' + eikHtml + '</td>' +
            '<td><strong>' + esc(rf.judge) + '</strong></td>' +
            '<td class="mono num"><strong>' + esc(rf.k) + ' / ' + esc(rf.n) + '</strong></td>' +
            '<td class="mono num sv-rat">&times;' + esc(ratioStr) + '</td>' +
            '<td class="mono sv-tm"><div><strong>' + esc(rf.distinctDays) + ' д. / ' + esc(rf.distinctMonths) + ' мес.</strong> <span class="muted">(макс. ' + esc(rf.maxDayPct) + '%/д)</span></div>' + zopHtml + restrHtml + '</td>' +
            '<td class="mono num">' + esc(qStr) + '</td>' +
            '<td><div class="svet-cell-actions">' + caseHtml + '<button type="button" class="svet-signal-btn" data-svet-signal-idx="' + esc(rf.idx) + '" title="Създай готов сигнал по Глава VIII АПК">⚖ Сигнал</button></div></td>';
          frag.appendChild(tr);
        });
        allRedTbody.appendChild(frag);
      }
      if (allRedMoreBar) allRedMoreBar.hidden = true;
    }

    if (loadAllRedBtn) {
      loadAllRedBtn.addEventListener('click', function () {
        ensureExtraRowsHydrated();
        applyFilter();
      });
    }

    var activeSector = 'jud';
    var activeTab = 'all';

    var um = (parsePayload() || {}).universeMeta || {};
    var sectorNames = {
      all: 'Всички 6 стълба (Пълен национален регистър)',
      jud: 'Стълб 01 · Съдийски и прокурорски концентрации в ЕИСС (' + (um.casesFmt || '2 234 509') + ' дела · ' + (um.redTotal || 869) + ' RED)',
      corp_fin: 'Стълб 02 · Съдебни дела на банки, застрахователи, телекоми и КЗК (×60,02 ЕИСС)',
      law: 'Стълб 03 · Адвокатски кантори (J3), ЕПЕП юристи, EPPO и ЗЧОД',
      mrrb: 'Стълб 04 · Свързани политици и институции — МРРБ, АПИ и пътно строителство (€3,84 млрд.)',
      me_mz: 'Стълб 05 · Свързани политици — Енергетика (МЕ), БДЖ, Здравеопазване (МЗ) и НОИ (€3,28 млрд.)',
      mun: 'Стълб 06 · Местна власт, Общини (София, Хасково, Варна, Плевен) и МС (€1,85 млрд.)',
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
      var tierFilter = allRedTierSel ? allRedTierSel.value : '';
      var obFilter = allRedOblastSel ? allRedOblastSel.value : '';
      var kindFilter = allRedKindSel ? allRedKindSel.value : '';
      if (q || tierFilter || obFilter || kindFilter || activeTab === 'allred') {
        ensureExtraRowsHydrated();
      }
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
        var secTotal = rows.length;
        rows.forEach(function (tr) {
          totalRows += 1;
          var rowSector = tr.getAttribute('data-sector') || '';
          var sectorOk = activeSector === 'all' || rowSector === activeSector;
          if (secKey === 'allred') {
            if (tierFilter && tr.getAttribute('data-tier') !== tierFilter) sectorOk = false;
            if (obFilter && tr.getAttribute('data-nuts3') !== obFilter) sectorOk = false;
            if (kindFilter && tr.getAttribute('data-kind') !== kindFilter) sectorOk = false;
          }
          var text = norm(tr.textContent);
          var searchOk = !q || text.indexOf(q) !== -1;
          var ok = sectorOk && searchOk;
          tr.hidden = !ok;
          if (ok) {
            secShown += 1;
            shownRows += 1;
          }
        });
        if (secKey === 'allred' && allRedCountEl) {
          allRedCountEl.textContent = 'Показани: ' + secShown + ' от ' + secTotal + ' RED флага';
        }
        sec.hidden = secShown === 0 && !(secKey === 'allred' && activeTab === 'allred');
      });

      if (statusEl) {
        statusEl.textContent = 'Показани записи на екрана: ' + shownRows + ' от ' + totalRows;
      }
    }

    function syncTierPills(val) {
      allRedTierPills.forEach(function (b) {
        b.classList.toggle('active', (b.getAttribute('data-svet-tier-pick') || '') === val);
      });
    }

    if (allRedTierSel) {
      allRedTierSel.addEventListener('change', function () {
        syncTierPills(allRedTierSel.value);
        applyFilter();
      });
    }
    allRedTierPills.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = btn.getAttribute('data-svet-tier-pick') || '';
        if (allRedTierSel) allRedTierSel.value = val;
        syncTierPills(val);
        applyFilter();
      });
    });
    if (allRedOblastSel) {
      allRedOblastSel.addEventListener('change', applyFilter);
    }
    if (allRedKindSel) {
      allRedKindSel.addEventListener('change', applyFilter);
    }

    vizButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-svet-viz') || 'map';
        vizButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        chartCards.forEach(function (card) {
          var pair = card.getAttribute('data-svet-chart');
          card.hidden = !(mode === 'all' || mode === pair);
        });
        if (networkGraphApi) {
          if (mode === 'graph' || mode === 'all') {
            networkGraphApi.activate();
          } else {
            networkGraphApi.pause();
          }
        }
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
        if (allRedOblastSel) allRedOblastSel.value = '';
        if (allRedKindSel) allRedKindSel.value = '';
        activeSector = 'jud';
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

  // ===========================================================================
  // 28-OBLAST JUDICIAL RADAR MAP OF BULGARIA (GISCO NUTS 2021 x 180 COURTS)
  // ===========================================================================
  function initJudicialMap() {
    var payload = parsePayload();
    var host = document.getElementById('svetJudicialMapHost');
    var legendEl = document.getElementById('svetJudicialMapLegend');
    var detailEl = document.getElementById('svetOblastPanel');
    var titleEl = document.getElementById('svetJudMapTitle');
    var metricBtns = document.querySelectorAll('[data-svet-map-metric]');
    if (!payload || !payload.judicialMap || !host || !detailEl) return;

    var jm = payload.judicialMap;
    var oblasts = jm.oblasts || [];
    var activeMetric = 'redFlags';
    var selectedNuts3 = 'BG411'; // Sofia-grad by default

    var titles = {
      redFlags: 'Радар карта на съдилищата в България — Всички RED флагове по 28 области (180 съдилища)',
      unexplainedRed: 'Радар карта — Необяснени RED флагове (Приоритет ИВСС след Ниво 1 филтър за ЗСРС и пакетно подаване)',
      maxRatio: 'Радар карта на съдилищата — Максимална кратност (× над очакваното при случайност)',
      ratePer10k: 'Радар карта на съдилищата — Нормализиран индекс (RED флагове на 10 000 дела)',
      cases: 'Радар карта на съдилищата — Общ брой разпределени дела в ЕИСС (' + ((payload.universeMeta && payload.universeMeta.yearRange) || '2023–2026') + ')',
    };

    function getVal(ob) {
      return Number(ob[activeMetric] || 0);
    }

    function renderMap() {
      if (titleEl) titleEl.textContent = titles[activeMetric] || titles.redFlags;
      var vals = oblasts.map(getVal);
      var maxV = Math.max.apply(null, vals.concat([1]));
      var useLog = activeMetric === 'redFlags' || activeMetric === 'unexplainedRed' || activeMetric === 'cases';

      var palette =
        activeMetric === 'cases'
          ? ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a']
          : activeMetric === 'maxRatio'
          ? ['#fffbeb', '#fde68a', '#f59e0b', '#dc2626', '#991b1b']
          : ['#fef2f2', '#fecaca', '#f87171', '#dc2626', '#991b1b'];

      function colorFor(v) {
        if (v <= 0) return palette[0];
        var n = useLog ? Math.log1p(v) / Math.log1p(maxV) : v / maxV;
        var idx = Math.min(palette.length - 1, Math.max(1, Math.ceil(n * (palette.length - 1))));
        return palette[idx];
      }

      var polys = oblasts
        .map(function (ob) {
          var v = getVal(ob);
          var sel = ob.nuts3 === selectedNuts3 ? 'selected' : '';
          var shortN = String(ob.name || '').replace(' (столица)', ' (гр.)');
          var badgeNum =
            activeMetric === 'redFlags'
              ? ob.redFlags > 0
                ? ob.redFlags + ' RED'
                : '0'
              : activeMetric === 'unexplainedRed'
              ? ob.unexplainedRed > 0
                ? ob.unexplainedRed + ' необ.'
                : '0'
              : activeMetric === 'maxRatio'
              ? ob.maxRatio > 0
                ? '×' + ob.maxRatio
                : '—'
              : activeMetric === 'ratePer10k'
              ? String(ob.ratePer10k).replace('.', ',')
              : fmtInt(ob.cases);
          return (
            '<g data-svet-select-oblast="' +
            esc(ob.nuts3) +
            '">' +
            '<path class="oblast-poly ' +
            sel +
            '" d="' +
            esc(ob.d) +
            '" fill="' +
            colorFor(v) +
            '">' +
            '<title>' +
            esc(ob.name) +
            ' (' +
            esc(ob.nuts3) +
            '): ' +
            ob.courtsCount +
            ' съдилища · ' +
            fmtInt(ob.cases) +
            ' дела · ' +
            ob.redFlags +
            ' RED флага · Макс. ×' +
            ob.maxRatio +
            '</title></path>' +
            '<text class="oblast-lbl" x="' +
            ob.cx +
            '" y="' +
            (Number(ob.cy) - 2) +
            '">' +
            esc(shortN) +
            '</text>' +
            '<text class="oblast-sub-lbl" x="' +
            ob.cx +
            '" y="' +
            (Number(ob.cy) + 11) +
            '">' +
            esc(badgeNum) +
            '</text>' +
            '</g>'
          );
        })
        .join('');

      host.innerHTML =
        '<svg class="bg-map-svg" viewBox="' +
        esc(jm.viewBox) +
        '" role="img" aria-label="Интерактивна радар карта на съдилищата по 28 области в България">' +
        polys +
        '</svg>';

      if (legendEl) {
        var maxStr =
          activeMetric === 'maxRatio'
            ? '×' + maxV
            : activeMetric === 'cases'
            ? fmtInt(maxV) + ' дела'
            : activeMetric === 'ratePer10k'
            ? String(maxV).replace('.', ',') + ' / 10к'
            : maxV + ' RED';
        legendEl.innerHTML =
          '<span>0</span>' +
          palette
            .map(function (c) {
              return '<i class="atlas-swatch" style="background:' + c + ';"></i>';
            })
            .join('') +
          '<span>Макс: ' +
          esc(maxStr) +
          '</span>';
      }

      renderSelectedOblastCard();
    }

    function renderSelectedOblastCard() {
      var ob =
        oblasts.find(function (x) {
          return x.nuts3 === selectedNuts3;
        }) || oblasts[0];
      if (!ob) return;

      var topCourts = (ob.courts || []).slice(0, 6);
      var topFlags = (ob.topFlags || []).slice(0, 4);

      detailEl.innerHTML =
        '<div class="svet-ob-head">' +
        '<div><div class="kpi-label">' +
        esc(ob.nuts3) +
        ' · ' +
        esc(ob.nuts2Name) +
        '</div><h3>Област ' +
        esc(ob.name) +
        '</h3></div>' +
        '<button type="button" class="btn btn-dark" style="padding:5px 10px;font-size:11.5px;" data-svet-open-oblast="' +
        esc(ob.nuts3) +
        '">Пълно досие &rarr;</button>' +
        '</div>' +
        '<div class="svet-ob-kpis">' +
        '<div><span>Съдилища</span><strong>' +
        fmtInt(ob.courtsCount) +
        '</strong></div>' +
        '<div><span>Дела (ЕИСС)</span><strong>' +
        fmtInt(ob.cases) +
        '</strong></div>' +
        '<div><span>RED (Необясн.)</span><strong style="color:var(--crimson);">' +
        fmtInt(ob.redFlags) +
        ' (' +
        fmtInt(ob.unexplainedRed || 0) +
        ')</strong></div>' +
        '<div><span>Макс. кратност</span><strong style="color:var(--crimson);">' +
        (ob.maxRatio > 0 ? '×' + String(ob.maxRatio).replace('.', ',') : '—') +
        '</strong></div>' +
        '</div>' +
        '<div class="svet-ob-subhead">Водещи съдилища в областта (' +
        ob.courts.length +
        ' общо):</div>' +
        '<div class="svet-ob-courts">' +
        topCourts
          .map(function (c) {
            return (
              '<div class="svet-ob-court-row">' +
              '<span class="c-name">' +
              esc(c.name) +
              '</span>' +
              '<span class="mono c-stat">' +
              fmtInt(c.cases) +
              ' дела · <b style="color:' +
              (c.red > 0 ? 'var(--crimson)' : 'var(--ink-muted)') +
              ';">' +
              c.red +
              ' RED</b></span></div>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="svet-ob-subhead">Топ концентрации Страна &rarr; Съдия (клик за верига):</div>' +
        (topFlags.length
          ? '<div class="svet-ob-flags">' +
            topFlags
              .map(function (tf) {
                return (
                  '<button type="button" class="svet-ob-flag-btn" data-svet-open-judge="' +
                  esc(tf.judge) +
                  '">' +
                  '<div class="f-top"><strong>' +
                  esc(tf.party) +
                  '</strong><span class="mono f-mult">×' +
                  Number(tf.ratio).toFixed(2).replace('.', ',') +
                  ' (' +
                  tf.k +
                  '/' +
                  tf.n +
                  ')</span></div>' +
                  '<div class="f-meta">' +
                  esc(tf.tierShort || '') +
                  ' · ' +
                  esc(tf.court) +
                  ' · Съдия: ' +
                  esc(tf.judge) +
                  (tf.distinctDays ? ' · ' + tf.distinctDays + ' д./' + tf.distinctMonths + ' м.' : '') +
                  '</div></button>'
                );
              })
              .join('') +
            '</div>'
          : '<div class="muted" style="font-size:12px;padding:6px 0;">Няма RED флагове при праг q &lt; 0,01 в тази област.</div>');
    }

    host.addEventListener('click', function (ev) {
      var g = ev.target && ev.target.closest ? ev.target.closest('[data-svet-select-oblast]') : null;
      if (!g) return;
      selectedNuts3 = g.getAttribute('data-svet-select-oblast') || selectedNuts3;
      renderMap();
    });

    metricBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeMetric = btn.getAttribute('data-svet-map-metric') || 'redFlags';
        metricBtns.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderMap();
      });
    });

    renderMap();
  }

  // ===========================================================================
  // INTERACTIVE FORCE-DIRECTED JUDICIAL NETWORK GRAPH & SHORTEST-PATH BFS
  // ===========================================================================
  function initJudicialNetworkGraph(drawerApi) {
    var payload = parsePayload() || {};
    var nd = payload.networkData || {};
    var panel = document.getElementById('svetGraphPanel');
    var canvas = document.getElementById('svetNetworkCanvas');
    var tip = document.getElementById('svetGraphTooltip');
    var statsBox = document.getElementById('svetGraphStatsBox');
    var nodeListEl = document.getElementById('svetGraphNodeList');
    var presetSel = document.getElementById('svetGraphPresetSelect');
    var oblastSel = document.getElementById('svetGraphOblastSelect');
    var btnRelayout = document.getElementById('svetBtnRelayout');
    var btnResetZoom = document.getElementById('svetBtnResetZoom');
    var btnExportPng = document.getElementById('svetBtnExportPng');
    var pathFromInp = document.getElementById('svetPathFromInput');
    var pathToInp = document.getElementById('svetPathToInput');
    var btnFindPath = document.getElementById('svetBtnFindPath');
    var btnPathDemo = document.getElementById('svetBtnPathDemo');
    var pathBox = document.getElementById('svetPathResultBox');

    if (!panel || !canvas || !presetSel || !canvas.getContext) return null;

    var ctx = canvas.getContext('2d');
    var PROSECUTOR_RE = /ДАНС|МВР|ПРОКУРАТУРА|СДВР|ГДГП|ГРАНИЧНА ПОЛИЦИЯ|ОДМВР|ТДНС|НАП\b|КПК\b|КПКОНПИ/i;

    var courtToNuts3 = {};
    var oblastByNuts3 = {};
    ((payload.judicialMap && payload.judicialMap.oblasts) || []).forEach(function (ob) {
      oblastByNuts3[ob.nuts3] = ob;
      (ob.courts || []).forEach(function (c) {
        if (c && c.name) courtToNuts3[norm(c.name)] = ob.nuts3;
      });
    });

    var hubJudgesSet = {};
    (nd.multiFlagHubs || []).forEach(function (h) {
      if (h && h.judge && !isExcludedName(h.judge)) hubJudgesSet[norm(h.judge)] = h;
    });

    var state = {
      active: false,
      initialized: false,
      nodes: [],
      edges: [],
      nodeById: {},
      panX: 0,
      panY: 0,
      scale: 0.92,
      simSteps: 0,
      hovered: null,
      dragging: null,
      panning: false,
      dragMoved: false,
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      raf: 0,
    };

    var TYPE_META = {
      court: { col: '#1e3a8a', label: 'Съд', radius: 13 },
      judge: { col: '#4f46e5', label: 'Съдия', radius: 10.5 },
      party: { col: '#b45309', label: 'Корпорация', radius: 9 },
      lawyer: { col: '#0284c7', label: 'Адвокат / Кантора', radius: 9.5 },
      official: { col: '#b91c1c', label: 'Политик / КПК', radius: 10 },
      prosecutor: { col: '#6b21a8', label: 'Прокуратура / Силов', radius: 9.5 },
      case_cluster: { col: '#0d9488', label: 'Рецидив / EPPO / ДЗЗД', radius: 9.5 },
    };

    function classifyPartyType(name) {
      return PROSECUTOR_RE.test(String(name || '')) ? 'prosecutor' : 'party';
    }

    function openNodeDossier(n) {
      if (!n || !drawerApi) return;
      var m = n.meta || {};
      if (n.type === 'judge' && m.judge && !isExcludedName(m.judge)) {
        drawerApi.openJudge(m.judge);
      } else if (n.type === 'official' && (m.slug || m.name) && !isExcludedName(m.name || '')) {
        drawerApi.openOfficial(m.slug || m.name);
      } else if (m.recordId) {
        drawerApi.openRecord(m.recordId);
      } else if (m.eik) {
        drawerApi.openCompany(m.eik);
      } else if (n.type === 'court' && m.nuts3) {
        drawerApi.openOblast(m.nuts3);
      } else if (m.party) {
        drawerApi.openCompany(m.party);
      }
    }

    function nodeOpenAttrs(n) {
      var m = n.meta || {};
      if (n.type === 'judge' && m.judge && !isExcludedName(m.judge)) {
        return 'data-svet-open-judge="' + esc(m.judge) + '"';
      }
      if (n.type === 'official' && (m.slug || m.name) && !isExcludedName(m.name || '')) {
        return 'data-svet-open-official="' + esc(m.slug || m.name) + '"';
      }
      if (m.recordId) {
        return 'data-svet-open-record="' + esc(m.recordId) + '"';
      }
      if (m.eik) {
        return 'data-svet-open-company="' + esc(m.eik) + '"';
      }
      if (n.type === 'court' && m.nuts3) {
        return 'data-svet-open-oblast="' + esc(m.nuts3) + '"';
      }
      return '';
    }

    function updateTooltip(n) {
      if (!tip) return;
      if (!n) {
        tip.innerHTML =
          '<strong>Съдебно-институционален граф (7 типа възли)</strong><br/>' +
          '<span class="muted">Посочете възел за осветяване. Влачете възли, скрол за мащаб. Кликнете върху съд, съдия, фирма, адвокат или политик за досие.</span>';
        return;
      }
      var m = n.meta || {};
      var cfg = TYPE_META[n.type] || TYPE_META.party;
      var attrs = nodeOpenAttrs(n);
      var btnHtml = attrs
        ? '<br/><button type="button" class="btn" style="margin-top:6px;padding:3px 9px;font-size:11px;" ' + attrs + '>Досие &rarr;</button>'
        : '';

      if (n.type === 'judge') {
        tip.innerHTML =
          '<strong style="color:' + (n.isHub ? '#b91c1c' : '#4f46e5') + ';">' +
          (n.isHub ? '★ Съдийски хъб: ' : 'Съдия: ') +
          esc(n.label) +
          '</strong><br/><span class="muted">' +
          esc(m.courtName || 'Съд в ЕИСС') +
          ' · ' +
          n.degree +
          ' връзки</span>' +
          (m.ratio ? '<br/><span class="mono">Макс. кратност: <strong>×' + Number(m.ratio).toFixed(2).replace('.', ',') + '</strong></span>' : '') +
          btnHtml;
      } else if (n.type === 'official') {
        tip.innerHTML =
          '<strong style="color:#b91c1c;">' +
          esc(n.label) +
          '</strong><br/><span class="muted">' +
          esc(m.institution || 'Публична длъжност · КПК / СИГМА') +
          '</span>' +
          (m.totalEurM ? '<br/><span class="mono">ЗОП обем: <strong>' + fmtEur(m.totalEurM * 1e6) + '</strong></span>' : '') +
          btnHtml;
      } else if (n.type === 'court') {
        tip.innerHTML =
          '<strong style="color:#1e3a8a;">' +
          esc(n.label) +
          '</strong><br/><span class="muted">' +
          n.degree +
          ' връзки в текущия срез</span>' +
          btnHtml;
      } else if (n.type === 'lawyer') {
        tip.innerHTML =
          '<strong style="color:#0284c7;">Адвокат / Кантора: ' +
          esc(n.label) +
          '</strong><br/><span class="muted">' +
          (m.eik ? 'ЕИК ' + esc(m.eik) + ' · ' : '') +
          n.degree +
          ' връзки</span>' +
          (m.k ? '<br/><span class="mono">' + m.k + '/' + m.nRep + ' дела (×' + Number(m.ratio || 0).toFixed(2).replace('.', ',') + ')</span>' : '') +
          btnHtml;
      } else if (n.type === 'case_cluster') {
        tip.innerHTML =
          '<strong style="color:#0d9488;">' +
          esc(n.label) +
          '</strong><br/><span class="muted">' +
          esc(m.detail || (cfg.label + ' · ' + n.degree + ' връзки')) +
          '</span>' +
          btnHtml;
      } else {
        tip.innerHTML =
          '<strong style="color:' + cfg.col + ';">' +
          esc(n.label) +
          '</strong><br/><span class="mono muted">' +
          (m.eik ? 'ЕИК ' + esc(m.eik) + ' · ' : '') +
          n.degree +
          ' връзки</span>' +
          (m.procEurM ? '<br/><span class="mono">ЗОП: <strong>' + fmtEur(m.procEurM * 1e6) + '</strong></span>' : '') +
          btnHtml;
      }
    }

    function buildGraph(preset, oblastNuts3, customNodes, customEdges) {
      var nodesMap = {};
      var nodes = [];
      var edges = [];
      var edgeSeen = {};

      function addNode(id, label, type, meta) {
        if (!id || !label) return null;
        if (isExcludedName(label)) return null;
        if (!nodesMap[id]) {
          var cfg = TYPE_META[type] || TYPE_META.party;
          var isHub = type === 'judge' && Boolean(hubJudgesSet[norm(label)] || (meta && meta.isHub));
          var n = {
            id: id,
            label: label,
            type: type,
            meta: meta || {},
            isHub: isHub,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            degree: 0,
            radius: isHub ? 12.5 : cfg.radius,
          };
          nodesMap[id] = n;
          nodes.push(n);
        } else if (meta) {
          var ex = nodesMap[id];
          if (!ex.meta.eik && meta.eik) ex.meta.eik = meta.eik;
          if (!ex.meta.nuts3 && meta.nuts3) ex.meta.nuts3 = meta.nuts3;
          if (!ex.meta.courtName && meta.courtName) ex.meta.courtName = meta.courtName;
          if (!ex.meta.recordId && meta.recordId) ex.meta.recordId = meta.recordId;
          if (!ex.meta.ratio && meta.ratio) ex.meta.ratio = meta.ratio;
          if (!ex.meta.procEurM && meta.procEurM) ex.meta.procEurM = meta.procEurM;
        }
        return nodesMap[id];
      }

      function addEdge(a, b, kind, label) {
        if (!a || !b || a === b || !nodesMap[a] || !nodesMap[b]) return;
        var key = (a < b ? a + '|' + b : b + '|' + a) + '|' + kind;
        if (edgeSeen[key]) return;
        edgeSeen[key] = true;
        edges.push({ source: a, target: b, kind: kind || 'court_judge', label: label || '' });
        nodesMap[a].degree++;
        nodesMap[b].degree++;
      }

      if (customNodes && customEdges) {
        customNodes.forEach(function (cn) {
          addNode(cn.id, cn.label, cn.type, cn.meta);
        });
        customEdges.forEach(function (ce) {
          addEdge(ce.source, ce.target, ce.kind || 'path_highlight', ce.label || '');
        });
      } else if (oblastNuts3) {
        var ob = oblastByNuts3[oblastNuts3];
        var obCourtSet = {};
        if (ob) {
          (ob.courts || []).forEach(function (c) {
            if (c && c.name) obCourtSet[norm(c.name)] = true;
          });
        }
        var unexpOb = (nd.unexplainedFlags || []).filter(function (f) {
          return f.nuts3 === oblastNuts3 || obCourtSet[norm(f.court)];
        });
        var zsrsOb = (nd.zsrsTop || []).filter(function (f) {
          return f.nuts3 === oblastNuts3 || obCourtSet[norm(f.court)];
        });
        var flagsOb = unexpOb.slice(0, 28).concat(zsrsOb.slice(0, 12));
        if (!flagsOb.length && ob && ob.topFlags) {
          flagsOb = ob.topFlags.slice(0, 24);
        }

        var partyEiksInOb = {};
        var partyNamesInOb = {};
        flagsOb.forEach(function (f) {
          if (isExcludedName(f.judge) || isExcludedName(f.party)) return;
          var cId = 'court:' + norm(f.court);
          var jId = 'judge:' + norm(f.judge);
          var pType = classifyPartyType(f.party);
          var pId = (f.eik ? 'party:' + f.eik : pType + ':' + norm(f.party));
          addNode(cId, f.court, 'court', { nuts3: oblastNuts3 });
          addNode(jId, f.judge, 'judge', { judge: f.judge, courtName: f.court, ratio: f.ratio });
          addNode(pId, f.party, pType, { eik: f.eik || '', party: f.party, procEurM: f.procEurM || 0 });
          if (f.eik) partyEiksInOb[f.eik] = pId;
          partyNamesInOb[norm(f.party)] = pId;
          addEdge(cId, jId, 'court_judge', '');
          addEdge(
            jId,
            pId,
            pType === 'prosecutor' ? 'zsrs_duty' : 'unexplained_red',
            '×' + Number(f.ratio || 0).toFixed(1).replace('.', ',') + ' (' + f.k + '/' + f.n + ')'
          );
        });

        // Overlay matching lawyers & conflictBridge officials in this oblast
        (nd.lawyerFlags || []).forEach(function (lf) {
          if (!obCourtSet[norm(lf.courtName)] && courtToNuts3[norm(lf.courtName)] !== oblastNuts3) return;
          if (isExcludedName(lf.judge) || isExcludedName(lf.representative)) return;
          var cId = 'court:' + norm(lf.courtName);
          var jId = 'judge:' + norm(lf.judge);
          var lId = 'lawyer:' + norm(lf.representative);
          addNode(cId, lf.courtName, 'court', { nuts3: oblastNuts3 });
          addNode(jId, lf.judge, 'judge', { judge: lf.judge, courtName: lf.courtName });
          addNode(lId, lf.representative, 'lawyer', { k: lf.k, nRep: lf.nRep, ratio: lf.ratio });
          addEdge(cId, jId, 'court_judge', '');
          addEdge(lId, jId, 'lawyer_judge', '×' + Number(lf.ratio || 0).toFixed(1).replace('.', ',') + ' (' + lf.k + '/' + lf.nRep + ')');
        });

        (nd.conflictBridge || []).forEach(function (cb) {
          var matchCourt = (cb.courts || []).some(function (cn) {
            return obCourtSet[norm(cn)] || courtToNuts3[norm(cn)] === oblastNuts3;
          });
          var pId = (cb.eik && partyEiksInOb[cb.eik]) || partyNamesInOb[norm(cb.party)];
          if (!matchCourt && !pId) return;
          if (!pId) {
            pId = cb.eik ? 'party:' + cb.eik : 'party:' + norm(cb.party);
            addNode(pId, cb.party, classifyPartyType(cb.party), { eik: cb.eik, party: cb.party, procEurM: cb.procurementEurM });
          }
          (cb.officials || []).slice(0, 4).forEach(function (o) {
            if (isExcludedName(o.name)) return;
            var oId = 'official:' + norm(o.name);
            addNode(oId, o.name, 'official', { name: o.name, institution: o.institution, totalEurM: o.totalEurM });
            addEdge(pId, oId, 'conflict_official', 'КПК Табл. 9');
          });
        });
      } else if (preset === 'judge_hubs') {
        (nd.multiFlagHubs || []).slice(0, 18).forEach(function (hub) {
          if (isExcludedName(hub.judge)) return;
          var n3 = courtToNuts3[norm(hub.courtName)] || '';
          var cId = 'court:' + norm(hub.courtName);
          var jId = 'judge:' + norm(hub.judge);
          addNode(cId, hub.courtName, 'court', { nuts3: n3 });
          addNode(jId, hub.judge, 'judge', { judge: hub.judge, courtName: hub.courtName, ratio: hub.maxRatio, isHub: true });
          addEdge(cId, jId, 'court_judge', hub.unexplainedCount + ' RED');
          (hub.parties || []).slice(0, 5).forEach(function (p) {
            if (isExcludedName(p.party)) return;
            var pType = classifyPartyType(p.party);
            var pId = p.eik ? 'party:' + p.eik : pType + ':' + norm(p.party);
            addNode(pId, p.party, pType, { eik: p.eik || '', party: p.party, procEurM: p.procEurM || 0 });
            addEdge(jId, pId, 'unexplained_red', '×' + Number(p.ratio || 0).toFixed(1).replace('.', ',') + ' (' + p.k + '/' + p.n + ')');
          });
        });
      } else if (preset === 'multi_year') {
        var mySorted = (nd.multiYear || []).slice().sort(function (a, b) {
          var aU = a.tier === 'UNEXPLAINED_PRIORITY' ? 0 : 1;
          var bU = b.tier === 'UNEXPLAINED_PRIORITY' ? 0 : 1;
          return aU - bU || b.maxRatio - a.maxRatio;
        });
        mySorted.slice(0, 32).forEach(function (my) {
          if (isExcludedName(my.judge) || isExcludedName(my.party)) return;
          var n3 = courtToNuts3[norm(my.courtName)] || '';
          var cId = 'court:' + norm(my.courtName);
          var jId = 'judge:' + norm(my.judge);
          var pType = classifyPartyType(my.party);
          var pId = my.eik ? 'party:' + my.eik : pType + ':' + norm(my.party);
          var clId = 'cluster:my:' + norm(my.party) + ':' + norm(my.judge);
          var yrLbl = (my.years || []).join('+');
          addNode(cId, my.courtName, 'court', { nuts3: n3 });
          addNode(jId, my.judge, 'judge', { judge: my.judge, courtName: my.courtName, ratio: my.maxRatio });
          addNode(pId, my.party, pType, { eik: my.eik || '', party: my.party, procEurM: my.procEurM || 0 });
          addNode(clId, 'Рецидив ' + yrLbl, 'case_cluster', {
            judge: my.judge,
            eik: my.eik || '',
            detail: my.party + ' → ' + my.judge + ' (' + my.totalK + '/' + my.totalN + ' дела)',
          });
          addEdge(cId, jId, 'court_judge', '');
          addEdge(jId, clId, 'multi_year', '×' + Number(my.maxRatio || 0).toFixed(1).replace('.', ','));
          addEdge(clId, pId, 'multi_year', yrLbl);
        });
      } else if (preset === 'lawyers_j3') {
        (nd.lawyerFlags || []).forEach(function (lf) {
          if (isExcludedName(lf.judge) || isExcludedName(lf.representative)) return;
          var n3 = courtToNuts3[norm(lf.courtName)] || '';
          var cId = 'court:' + norm(lf.courtName);
          var jId = 'judge:' + norm(lf.judge);
          var lId = 'lawyer:' + norm(lf.representative);
          addNode(cId, lf.courtName, 'court', { nuts3: n3 });
          addNode(jId, lf.judge, 'judge', { judge: lf.judge, courtName: lf.courtName, ratio: lf.ratio });
          addNode(lId, lf.representative, 'lawyer', { k: lf.k, nRep: lf.nRep, ratio: lf.ratio });
          addEdge(cId, jId, 'court_judge', '');
          addEdge(lId, jId, 'lawyer_judge', '×' + Number(lf.ratio || 0).toFixed(1).replace('.', ',') + ' (' + lf.k + '/' + lf.nRep + ')');
          (lf.topClients || []).slice(0, 2).forEach(function (cl) {
            if (isExcludedName(cl)) return;
            var clType = classifyPartyType(cl);
            var pId = clType + ':' + norm(cl);
            addNode(pId, cl, clType, { party: cl });
            addEdge(pId, lId, 'lawyer_judge', 'клиент');
          });
        });
        (payload.eppoLawSecurityRows || []).forEach(function (row) {
          if (row.sector !== 'law' || String(row.cat || '').indexOf('ЗЧОД') !== -1) return;
          var lId = row.eik ? 'lawyer:eik:' + row.eik : 'lawyer:' + norm(row.name);
          addNode(lId, row.name, 'lawyer', { eik: row.eik || '', recordId: row.id });
          if (row.authEik) {
            var aId = 'party:' + row.authEik;
            addNode(aId, 'Възложител ЕИК ' + row.authEik, 'prosecutor', { eik: row.authEik, recordId: row.id });
            addEdge(aId, lId, 'lawyer_judge', row.val || 'J3');
          }
        });
      } else if (preset === 'unexplained_top') {
        (nd.unexplainedFlags || []).slice(0, 46).forEach(function (f) {
          if (isExcludedName(f.judge) || isExcludedName(f.party)) return;
          var cId = 'court:' + norm(f.court);
          var jId = 'judge:' + norm(f.judge);
          var pType = classifyPartyType(f.party);
          var pId = f.eik ? 'party:' + f.eik : pType + ':' + norm(f.party);
          addNode(cId, f.court, 'court', { nuts3: f.nuts3 });
          addNode(jId, f.judge, 'judge', { judge: f.judge, courtName: f.court, ratio: f.ratio });
          addNode(pId, f.party, pType, { eik: f.eik || '', party: f.party, procEurM: f.procEurM || 0 });
          addEdge(cId, jId, 'court_judge', '');
          addEdge(jId, pId, 'unexplained_red', '×' + Number(f.ratio || 0).toFixed(1).replace('.', ',') + ' (' + f.k + '/' + f.n + ')');
        });
      } else if (preset === 'zsrs_security') {
        (nd.zsrsTop || []).slice(0, 32).forEach(function (f) {
          if (isExcludedName(f.judge) || isExcludedName(f.party)) return;
          var cId = 'court:' + norm(f.court);
          var jId = 'judge:' + norm(f.judge);
          var pId = f.eik ? 'prosecutor:' + f.eik : 'prosecutor:' + norm(f.party);
          addNode(cId, f.court, 'court', { nuts3: f.nuts3 });
          addNode(jId, f.judge, 'judge', { judge: f.judge, courtName: f.court, ratio: f.ratio });
          addNode(pId, f.party, 'prosecutor', { eik: f.eik || '', party: f.party });
          addEdge(cId, jId, 'court_judge', '');
          addEdge(jId, pId, 'zsrs_duty', '×' + Number(f.ratio || 0).toFixed(1).replace('.', ',') + ' (' + f.k + '/' + f.n + ')');
        });
        (payload.securityFlags || []).slice(0, 10).forEach(function (sf) {
          if (isExcludedName(sf.judge) || isExcludedName(sf.party)) return;
          var jId = 'judge:' + norm(sf.judge.split('(')[0]);
          var pId = sf.eik ? 'prosecutor:' + sf.eik : 'prosecutor:' + norm(sf.party);
          addNode(jId, sf.judge, 'judge', { judge: sf.judge.split('(')[0].trim(), recordId: sf.id });
          addNode(pId, sf.party, 'prosecutor', { eik: sf.eik || '', recordId: sf.id });
          addEdge(jId, pId, 'zsrs_duty', sf.mult || 'ЗСРС');
        });
      } else if (preset === 'politicians_eppo') {
        (payload.politicians || []).forEach(function (pol) {
          if (isExcludedName(pol.name)) return;
          var oId = 'official:' + norm(pol.name);
          addNode(oId, pol.name, 'official', { name: pol.name, institution: pol.role, recordId: pol.id });
          var eiks = (pol.eiks || []).filter(Boolean);
          if (eiks.length) {
            eiks.slice(0, 3).forEach(function (eik, i) {
              var pId = 'party:' + eik;
              var lbl = i === 0 ? (pol.company || 'ЕИК ' + eik) : 'ЕИК ' + eik;
              addNode(pId, lbl.slice(0, 44), 'party', { eik: eik, recordId: pol.id });
              addEdge(oId, pId, 'conflict_official', pol.eur || 'КПК');
            });
          } else {
            var pId = 'party:pol:' + pol.id;
            addNode(pId, (pol.company || pol.sectorLabel || 'Свързано дружество').slice(0, 44), 'party', { recordId: pol.id });
            addEdge(oId, pId, 'conflict_official', pol.eur || '');
          }
        });
        (payload.eppoLawSecurityRows || []).forEach(function (ep) {
          var clId = 'cluster:' + ep.id;
          addNode(clId, ep.name.slice(0, 44), 'case_cluster', { eik: ep.eik || '', recordId: ep.id, detail: ep.details });
          if (ep.eik) {
            var pId = 'party:' + ep.eik;
            addNode(pId, ep.name.split('→').pop().trim().slice(0, 40), ep.sector === 'law' ? 'lawyer' : 'party', { eik: ep.eik, recordId: ep.id });
            addEdge(pId, clId, 'multi_year', ep.val || 'EPPO');
          }
          if (ep.authEik) {
            var aId = 'party:' + ep.authEik;
            addNode(aId, 'Орган ЕИК ' + ep.authEik, 'prosecutor', { eik: ep.authEik, recordId: ep.id });
            addEdge(aId, clId, 'zsrs_duty', ep.cat || '');
          }
        });
        (payload.cartelZmipRows || []).forEach(function (cz) {
          var pId = cz.eik ? 'party:' + cz.eik : 'party:' + cz.id;
          var clId = 'cluster:' + cz.id;
          addNode(pId, cz.firm.slice(0, 44), 'party', { eik: cz.eik || '', recordId: cz.id });
          addNode(clId, cz.sectorLabel + ' · Анекси/ЗМИП', 'case_cluster', { eik: cz.eik || '', recordId: cz.id, detail: cz.annex });
          addEdge(pId, clId, 'unexplained_red', cz.zop || '');
        });
      } else {
        // Default: conflict_full (Level 4 Cross-Registry Bridge: Courts <-> Judges <-> Parties <-> Officials)
        (nd.conflictBridge || []).forEach(function (cb) {
          if (isExcludedName(cb.party)) return;
          var pType = classifyPartyType(cb.party);
          var pId = cb.eik ? 'party:' + cb.eik : pType + ':' + norm(cb.party);
          addNode(pId, cb.party, pType, { eik: cb.eik || '', party: cb.party, procEurM: cb.procurementEurM || 0 });
          (cb.courts || []).slice(0, 2).forEach(function (cn) {
            var cId = 'court:' + norm(cn);
            addNode(cId, cn, 'court', { nuts3: courtToNuts3[norm(cn)] || '' });
            addEdge(pId, cId, cb.unexplainedRedCount > 0 ? 'unexplained_red' : 'court_judge', cb.redFlagsCount + ' RED');
          });
          (cb.judges || []).slice(0, 4).forEach(function (jn) {
            if (isExcludedName(jn)) return;
            var jId = 'judge:' + norm(jn);
            addNode(jId, jn, 'judge', { judge: jn, courtName: (cb.courts && cb.courts[0]) || '' });
            addEdge(pId, jId, cb.unexplainedRedCount > 0 ? 'unexplained_red' : 'court_judge', '×' + Number(cb.maxRatio || 0).toFixed(1).replace('.', ','));
            if (cb.courts && cb.courts[0]) {
              addEdge('court:' + norm(cb.courts[0]), jId, 'court_judge', '');
            }
          });
          (cb.officials || []).slice(0, 4).forEach(function (o) {
            if (isExcludedName(o.name)) return;
            var oId = 'official:' + norm(o.name);
            addNode(oId, o.name, 'official', { name: o.name, institution: o.institution || '', totalEurM: o.totalEurM || 0 });
            addEdge(pId, oId, 'conflict_official', 'КПК Табл. 9');
          });
        });
      }

      var rect = canvas.getBoundingClientRect();
      var w = rect.width || 900;
      var h = rect.height || 660;
      nodes.forEach(function (n, idx) {
        var ang = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
        var ring =
          n.type === 'court'
            ? 105
            : n.type === 'judge'
            ? 185
            : n.type === 'official'
            ? 295
            : n.type === 'lawyer'
            ? 245
            : 235;
        var jitterX = ((idx * 37) % 29) - 14;
        var jitterY = ((idx * 53) % 29) - 14;
        n.x = w / 2 + Math.cos(ang) * ring + jitterX;
        n.y = h / 2 + Math.sin(ang) * ring + jitterY;
      });

      state.nodes = nodes;
      state.edges = edges;
      state.nodeById = nodesMap;
      state.panX = 0;
      state.panY = 0;
      state.scale = nodes.length > 90 ? 0.78 : 0.92;
      state.simSteps = 220;
      state.hovered = null;

      if (statsBox) {
        statsBox.innerHTML = '<strong>' + nodes.length + ' възли</strong> · <strong>' + edges.length + ' връзки</strong>';
      }
      if (nodeListEl) {
        var sortedList = nodes
          .slice()
          .sort(function (a, b) {
            return b.degree - a.degree || (b.isHub ? 1 : 0) - (a.isHub ? 1 : 0);
          })
          .slice(0, 60);
        nodeListEl.innerHTML = sortedList
          .map(function (n) {
            var cfg = TYPE_META[n.type] || TYPE_META.party;
            var attrs = nodeOpenAttrs(n);
            return (
              '<li ' +
              attrs +
              ' data-svet-graph-node="' +
              esc(n.id) +
              '"><span><i class="dot" style="background:' +
              (n.isHub ? '#b91c1c' : cfg.col) +
              ';margin-right:6px;"></i>' +
              esc(n.label.length > 32 ? n.label.slice(0, 31) + '…' : n.label) +
              '</span><span class="mono muted" style="font-size:11px;">' +
              n.degree +
              '</span></li>'
            );
          })
          .join('');
      }

      updateTooltip(null);
      state.initialized = true;
      if (state.active) startLoop();
    }

    function renderFrame(targetCtx, w, h, dpr, isDark, solidBg) {
      targetCtx.save();
      targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (solidBg) {
        targetCtx.fillStyle = isDark ? '#0b1120' : '#fcfbf8';
        targetCtx.fillRect(0, 0, w, h);
      } else {
        targetCtx.clearRect(0, 0, w, h);
      }
      targetCtx.translate(w / 2 + state.panX, h / 2 + state.panY);
      targetCtx.scale(state.scale, state.scale);
      targetCtx.translate(-w / 2, -h / 2);

      var hov = state.hovered;
      var activeSet = {};
      if (hov) {
        activeSet[hov.id] = true;
        state.edges.forEach(function (e) {
          if (e.source === hov.id) activeSet[e.target] = true;
          if (e.target === hov.id) activeSet[e.source] = true;
        });
      }

      for (var ei = 0; ei < state.edges.length; ei++) {
        var e = state.edges[ei];
        var a = state.nodeById[e.source];
        var b = state.nodeById[e.target];
        if (!a || !b) continue;
        var lit = !hov || (activeSet[a.id] && activeSet[b.id]);
        targetCtx.beginPath();
        targetCtx.moveTo(a.x, a.y);
        targetCtx.lineTo(b.x, b.y);
        if (e.kind === 'path_highlight') {
          targetCtx.strokeStyle = lit ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.12)';
          targetCtx.lineWidth = 2.6;
        } else if (e.kind === 'unexplained_red') {
          targetCtx.strokeStyle = lit ? 'rgba(185,28,28,0.62)' : 'rgba(185,28,28,0.08)';
          targetCtx.lineWidth = 1.6;
        } else if (e.kind === 'conflict_official') {
          targetCtx.strokeStyle = lit ? 'rgba(225,29,72,0.62)' : 'rgba(225,29,72,0.08)';
          targetCtx.lineWidth = 1.5;
        } else if (e.kind === 'lawyer_judge') {
          targetCtx.strokeStyle = lit ? 'rgba(2,132,199,0.65)' : 'rgba(2,132,199,0.08)';
          targetCtx.lineWidth = 1.6;
        } else if (e.kind === 'multi_year') {
          targetCtx.strokeStyle = lit ? 'rgba(13,148,136,0.68)' : 'rgba(13,148,136,0.08)';
          targetCtx.lineWidth = 1.6;
        } else if (e.kind === 'zsrs_duty') {
          targetCtx.strokeStyle = lit ? 'rgba(107,33,168,0.58)' : 'rgba(107,33,168,0.08)';
          targetCtx.lineWidth = 1.3;
        } else {
          targetCtx.strokeStyle = lit ? 'rgba(100,116,139,0.38)' : 'rgba(100,116,139,0.06)';
          targetCtx.lineWidth = 1;
        }
        targetCtx.stroke();

        if (e.label && ((hov && lit) || e.kind === 'path_highlight')) {
          var mx = (a.x + b.x) / 2;
          var my = (a.y + b.y) / 2;
          targetCtx.font = '600 9.5px "IBM Plex Mono", monospace';
          targetCtx.lineWidth = 3;
          targetCtx.strokeStyle = isDark ? 'rgba(9,13,22,0.92)' : 'rgba(252,251,248,0.94)';
          targetCtx.strokeText(e.label, mx + 3, my - 3);
          targetCtx.fillStyle = isDark ? '#e2e8f0' : '#334155';
          targetCtx.fillText(e.label, mx + 3, my - 3);
        }
      }

      for (var ni = 0; ni < state.nodes.length; ni++) {
        var n = state.nodes[ni];
        var nLit = !hov || activeSet[n.id];
        var cfg = TYPE_META[n.type] || TYPE_META.party;
        targetCtx.globalAlpha = nLit ? 1 : 0.14;

        if (n.isHub) {
          targetCtx.beginPath();
          targetCtx.arc(n.x, n.y, n.radius + 5.5, 0, Math.PI * 2);
          targetCtx.fillStyle = 'rgba(220,38,38,0.22)';
          targetCtx.fill();
        }

        targetCtx.beginPath();
        if (n.type === 'judge') {
          var rD = n.radius + 1.5;
          targetCtx.moveTo(n.x, n.y - rD);
          targetCtx.lineTo(n.x + rD, n.y);
          targetCtx.lineTo(n.x, n.y + rD);
          targetCtx.lineTo(n.x - rD, n.y);
          targetCtx.closePath();
        } else if (n.type === 'lawyer') {
          var rS = n.radius;
          targetCtx.rect(n.x - rS, n.y - rS, rS * 2, rS * 2);
        } else if (n.type === 'case_cluster') {
          var rT = n.radius + 1.5;
          targetCtx.moveTo(n.x, n.y - rT);
          targetCtx.lineTo(n.x + rT, n.y + rT * 0.85);
          targetCtx.lineTo(n.x - rT, n.y + rT * 0.85);
          targetCtx.closePath();
        } else {
          targetCtx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        }

        targetCtx.fillStyle = n.isHub && n.type === 'judge' ? '#dc2626' : cfg.col;
        targetCtx.fill();
        targetCtx.lineWidth = hov === n ? 2.5 : 1.4;
        targetCtx.strokeStyle = hov === n ? '#f59e0b' : '#ffffff';
        targetCtx.stroke();

        if (hov === n || (hov && nLit) || n.type === 'court' || n.type === 'official' || n.isHub || n.degree >= 3 || state.nodes.length <= 42) {
          targetCtx.font = (n.type === 'court' || hov === n || n.isHub ? '600' : '400') + ' 10.5px "IBM Plex Sans", sans-serif';
          var lbl = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
          targetCtx.lineWidth = 3;
          targetCtx.strokeStyle = isDark ? 'rgba(9,13,22,0.92)' : 'rgba(252,251,248,0.94)';
          targetCtx.strokeText(lbl, n.x + n.radius + 4, n.y + 3.5);
          targetCtx.fillStyle = isDark ? '#f1f5f9' : '#131720';
          targetCtx.fillText(lbl, n.x + n.radius + 4, n.y + 3.5);
        }
      }
      targetCtx.globalAlpha = 1;
      targetCtx.restore();
    }

    function stepSimulation() {
      var rect = canvas.getBoundingClientRect();
      var w = rect.width || 900;
      var h = rect.height || 660;
      var nodes = state.nodes;
      var edges = state.edges;
      if (rect.width > 0) {
        var dpr = window.devicePixelRatio || 1;
        var targetW = Math.round(w * dpr);
        var targetH = Math.round(h * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
      }

      if (state.simSteps > 0 || state.dragging) {
        if (state.simSteps > 0) state.simSteps--;
        for (var i = 0; i < nodes.length; i++) {
          var a = nodes[i];
          for (var j = i + 1; j < nodes.length; j++) {
            var b = nodes[j];
            var dx = a.x - b.x;
            var dy = a.y - b.y;
            var d2 = dx * dx + dy * dy + 1;
            var f = 2500 / d2;
            var d = Math.sqrt(d2);
            a.vx += (dx / d) * f;
            a.vy += (dy / d) * f;
            b.vx -= (dx / d) * f;
            b.vy -= (dy / d) * f;
          }
          a.vx += (w / 2 - a.x) * 0.008;
          a.vy += (h / 2 - a.y) * 0.008;
        }
        for (var ei = 0; ei < edges.length; ei++) {
          var e = edges[ei];
          var sa = state.nodeById[e.source];
          var sb = state.nodeById[e.target];
          if (!sa || !sb) continue;
          var edx = sb.x - sa.x;
          var edy = sb.y - sa.y;
          var ed = Math.sqrt(edx * edx + edy * edy) || 1;
          var ef = (ed - (e.kind === 'conflict_official' ? 96 : 80)) * 0.045;
          sa.vx += (edx / ed) * ef;
          sa.vy += (edy / ed) * ef;
          sb.vx -= (edx / ed) * ef;
          sb.vy -= (edy / ed) * ef;
        }
        for (var ni = 0; ni < nodes.length; ni++) {
          var n = nodes[ni];
          if (state.dragging === n) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x += n.vx;
          n.y += n.vy;
        }
      }

      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      renderFrame(ctx, w, h, window.devicePixelRatio || 1, isDark, false);

      if (state.active && (state.simSteps > 0 || state.dragging || state.panning)) {
        state.raf = window.requestAnimationFrame(stepSimulation);
      } else {
        state.raf = 0;
      }
    }

    function requestRedraw() {
      if (!state.active || !state.initialized) return;
      if (!state.raf) {
        state.raf = window.requestAnimationFrame(stepSimulation);
      }
    }

    function startLoop() {
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = 0;
      if (state.active) {
        state.raf = window.requestAnimationFrame(stepSimulation);
      }
    }

    function pauseLoop() {
      state.active = false;
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
    }

    function activateLoop() {
      state.active = true;
      if (!state.initialized) {
        buildGraph(presetSel.value || 'conflict_full', oblastSel ? oblastSel.value : '');
      } else {
        state.simSteps = Math.max(state.simSteps, 45);
        startLoop();
      }
    }

    function runShortestPath(fromQ, toQ) {
      var fq = norm(fromQ);
      var tq = norm(toQ);
      if (!fq || !tq) return;

      var adj = {};
      var meta = {};
      var seenEdge = {};

      function link(a, aLbl, aType, aMeta, b, bLbl, bType, bMeta, rel) {
        if (!a || !b || a === b) return;
        if (isExcludedName(aLbl) || isExcludedName(bLbl)) return;
        if (!meta[a]) meta[a] = { id: a, label: aLbl, type: aType, meta: aMeta || {} };
        if (!meta[b]) meta[b] = { id: b, label: bLbl, type: bType, meta: bMeta || {} };
        var ek = a < b ? a + '|' + b : b + '|' + a;
        if (seenEdge[ek]) return;
        seenEdge[ek] = true;
        if (!adj[a]) adj[a] = [];
        if (!adj[b]) adj[b] = [];
        adj[a].push({ to: b, rel: rel || '' });
        adj[b].push({ to: a, rel: rel || '' });
      }

      (nd.unexplainedFlags || []).concat(nd.zsrsTop || []).forEach(function (f) {
        var cId = 'court:' + norm(f.court);
        var jId = 'judge:' + norm(f.judge);
        var pType = classifyPartyType(f.party);
        var pId = f.eik ? 'party:' + f.eik : pType + ':' + norm(f.party);
        link(cId, f.court, 'court', { nuts3: f.nuts3 }, jId, f.judge, 'judge', { judge: f.judge, courtName: f.court }, 'докладчик');
        link(jId, f.judge, 'judge', { judge: f.judge, courtName: f.court }, pId, f.party, pType, { eik: f.eik || '', party: f.party, procEurM: f.procEurM || 0 }, '×' + Number(f.ratio || 0).toFixed(1).replace('.', ','));
      });

      (nd.multiFlagHubs || []).forEach(function (hub) {
        var cId = 'court:' + norm(hub.courtName);
        var jId = 'judge:' + norm(hub.judge);
        link(cId, hub.courtName, 'court', { nuts3: courtToNuts3[norm(hub.courtName)] || '' }, jId, hub.judge, 'judge', { judge: hub.judge, courtName: hub.courtName, isHub: true }, 'хъб');
        (hub.parties || []).forEach(function (p) {
          var pType = classifyPartyType(p.party);
          var pId = p.eik ? 'party:' + p.eik : pType + ':' + norm(p.party);
          link(jId, hub.judge, 'judge', { judge: hub.judge, isHub: true }, pId, p.party, pType, { eik: p.eik || '', party: p.party, procEurM: p.procEurM || 0 }, '×' + Number(p.ratio || 0).toFixed(1).replace('.', ','));
        });
      });

      (nd.lawyerFlags || []).forEach(function (lf) {
        var cId = 'court:' + norm(lf.courtName);
        var jId = 'judge:' + norm(lf.judge);
        var lId = 'lawyer:' + norm(lf.representative);
        link(cId, lf.courtName, 'court', { nuts3: courtToNuts3[norm(lf.courtName)] || '' }, jId, lf.judge, 'judge', { judge: lf.judge, courtName: lf.courtName }, 'съд');
        link(lId, lf.representative, 'lawyer', { k: lf.k, nRep: lf.nRep, ratio: lf.ratio }, jId, lf.judge, 'judge', { judge: lf.judge }, 'адвокат');
        (lf.topClients || []).forEach(function (cl) {
          var clType = classifyPartyType(cl);
          link('party:' + norm(cl), cl, clType, { party: cl }, lId, lf.representative, 'lawyer', {}, 'клиент');
        });
      });

      (nd.conflictBridge || []).forEach(function (cb) {
        var pType = classifyPartyType(cb.party);
        var pId = cb.eik ? 'party:' + cb.eik : pType + ':' + norm(cb.party);
        (cb.courts || []).forEach(function (cn) {
          link(pId, cb.party, pType, { eik: cb.eik || '', procEurM: cb.procurementEurM || 0 }, 'court:' + norm(cn), cn, 'court', { nuts3: courtToNuts3[norm(cn)] || '' }, 'дела');
        });
        (cb.judges || []).forEach(function (jn) {
          link(pId, cb.party, pType, { eik: cb.eik || '', procEurM: cb.procurementEurM || 0 }, 'judge:' + norm(jn), jn, 'judge', { judge: jn, courtName: (cb.courts && cb.courts[0]) || '' }, 'RED');
        });
        (cb.officials || []).forEach(function (o) {
          link(pId, cb.party, pType, { eik: cb.eik || '', procEurM: cb.procurementEurM || 0 }, 'official:' + norm(o.name), o.name, 'official', { name: o.name, institution: o.institution || '', totalEurM: o.totalEurM || 0 }, 'КПК');
        });
      });

      (nd.multiYear || []).forEach(function (my) {
        var pType = classifyPartyType(my.party);
        var pId = my.eik ? 'party:' + my.eik : pType + ':' + norm(my.party);
        var jId = 'judge:' + norm(my.judge);
        link(pId, my.party, pType, { eik: my.eik || '' }, jId, my.judge, 'judge', { judge: my.judge, courtName: my.courtName }, (my.years || []).join('+'));
      });

      (payload.politicians || []).forEach(function (pol) {
        var oId = 'official:' + norm(pol.name);
        (pol.eiks || []).forEach(function (eik) {
          if (!eik) return;
          link(oId, pol.name, 'official', { name: pol.name, institution: pol.role, recordId: pol.id }, 'party:' + eik, pol.company || 'ЕИК ' + eik, 'party', { eik: eik, recordId: pol.id }, 'КПК');
        });
      });

      (payload.eppoLawSecurityRows || []).concat(payload.cartelZmipRows || []).forEach(function (r) {
        if (r.eik && r.authEik) {
          link('party:' + r.eik, r.name || r.firm || r.eik, r.sector === 'law' ? 'lawyer' : 'party', { eik: r.eik, recordId: r.id }, 'party:' + r.authEik, 'Възложител ' + r.authEik, 'prosecutor', { eik: r.authEik, recordId: r.id }, r.val || r.zop || 'ЗОП');
        }
      });

      var starts = [];
      var targets = {};
      Object.keys(meta).forEach(function (id) {
        var m = meta[id];
        var nLbl = norm(m.label);
        var nId = norm(m.id);
        if (nLbl.indexOf(fq) !== -1 || nId.indexOf(fq) !== -1) starts.push(id);
        if (nLbl.indexOf(tq) !== -1 || nId.indexOf(tq) !== -1) targets[id] = true;
      });

      if (pathBox) pathBox.style.display = 'block';
      if (!starts.length || !Object.keys(targets).length) {
        if (pathBox) {
          pathBox.innerHTML = 'Не е намерен възел за <strong>' + esc(!starts.length ? fromQ : toQ) + '</strong> в съдебно-институционалния граф.';
        }
        return;
      }

      var queue = starts.map(function (s) { return { nodes: [s], rels: [] }; });
      var visited = {};
      starts.forEach(function (s) { visited[s] = true; });
      var found = null;

      while (queue.length && !found) {
        var curPath = queue.shift();
        var cur = curPath.nodes[curPath.nodes.length - 1];
        if (targets[cur] && curPath.nodes.length > 1) {
          found = curPath;
          break;
        }
        if (curPath.nodes.length >= 7) continue;
        var neighbors = adj[cur] || [];
        for (var i = 0; i < neighbors.length; i++) {
          var nb = neighbors[i];
          if (!visited[nb.to]) {
            visited[nb.to] = true;
            queue.push({ nodes: curPath.nodes.concat([nb.to]), rels: curPath.rels.concat([nb.rel]) });
          }
        }
      }

      if (!found) {
        if (pathBox) {
          pathBox.innerHTML = 'Няма открита верига до 6 стъпки между <strong>' + esc(fromQ) + '</strong> и <strong>' + esc(toQ) + '</strong>.';
        }
        return;
      }

      var cNodes = found.nodes.map(function (id) { return meta[id]; });
      var cEdges = [];
      for (var k = 0; k < found.nodes.length - 1; k++) {
        cEdges.push({ source: found.nodes[k], target: found.nodes[k + 1], kind: 'path_highlight', label: found.rels[k] || '' });
      }
      if (pathBox) {
        pathBox.innerHTML =
          '<strong>Открита верига (' +
          (found.nodes.length - 1) +
          ' стъпки):</strong> ' +
          cNodes
            .map(function (cn) {
              return '<span class="tag tag-plum">' + esc(cn.label) + '</span>';
            })
            .join(' &rarr; ');
      }
      buildGraph('', '', cNodes, cEdges);
    }

    function toWorld(cx, cy) {
      var rect = canvas.getBoundingClientRect();
      return {
        x: (cx - rect.left - rect.width / 2 - state.panX) / state.scale + rect.width / 2,
        y: (cy - rect.top - rect.height / 2 - state.panY) / state.scale + rect.height / 2,
      };
    }

    function hitAt(x, y) {
      for (var i = state.nodes.length - 1; i >= 0; i--) {
        var n = state.nodes[i];
        var dx = n.x - x;
        var dy = n.y - y;
        if (dx * dx + dy * dy <= (n.radius + 6) * (n.radius + 6)) return n;
      }
      return null;
    }

    presetSel.addEventListener('change', function () {
      if (oblastSel) oblastSel.value = '';
      if (pathBox) pathBox.style.display = 'none';
      buildGraph(presetSel.value, '');
    });

    if (oblastSel) {
      oblastSel.addEventListener('change', function () {
        if (pathBox) pathBox.style.display = 'none';
        if (oblastSel.value) buildGraph('', oblastSel.value);
        else buildGraph(presetSel.value, '');
      });
    }

    if (btnRelayout) {
      btnRelayout.addEventListener('click', function () {
        state.simSteps = 220;
        startLoop();
      });
    }

    if (btnResetZoom) {
      btnResetZoom.addEventListener('click', function () {
        state.panX = 0;
        state.panY = 0;
        state.scale = state.nodes.length > 90 ? 0.78 : 0.92;
        requestRedraw();
      });
    }

    if (btnExportPng) {
      btnExportPng.addEventListener('click', function () {
        var rect = canvas.getBoundingClientRect();
        var w = rect.width || 900;
        var h = rect.height || 660;
        var dpr = window.devicePixelRatio || 1;
        var off = document.createElement('canvas');
        off.width = Math.round(w * dpr);
        off.height = Math.round(h * dpr);
        var oCtx = off.getContext('2d');
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        renderFrame(oCtx, w, h, dpr, isDark, true);
        var a = document.createElement('a');
        a.href = off.toDataURL('image/png');
        a.download = 'NASVETLO_OT_MRAK_KAM_SVETLINA_GRAPH.png';
        a.click();
      });
    }

    if (btnFindPath) {
      btnFindPath.addEventListener('click', function () {
        if (pathFromInp && pathToInp) runShortestPath(pathFromInp.value, pathToInp.value);
      });
    }

    if (btnPathDemo) {
      btnPathDemo.addEventListener('click', function () {
        var dFrom = 'Нора Владимирова Маринова';
        var dTo = 'Стефан Иванов Цанков';
        if (pathFromInp) pathFromInp.value = dFrom;
        if (pathToInp) pathToInp.value = dTo;
        runShortestPath(dFrom, dTo);
      });
    }

    canvas.addEventListener('mousedown', function (ev) {
      var p = toWorld(ev.clientX, ev.clientY);
      var hit = hitAt(p.x, p.y);
      state.downX = ev.clientX;
      state.downY = ev.clientY;
      state.dragMoved = false;
      if (hit) {
        state.dragging = hit;
        state.simSteps = Math.max(state.simSteps, 60);
      } else {
        state.panning = true;
        state.lastX = ev.clientX;
        state.lastY = ev.clientY;
      }
      startLoop();
    });

    window.addEventListener('mousemove', function (ev) {
      if (state.dragging) {
        if (Math.hypot(ev.clientX - state.downX, ev.clientY - state.downY) >= 5) {
          state.dragMoved = true;
        }
        var p = toWorld(ev.clientX, ev.clientY);
        state.dragging.x = p.x;
        state.dragging.y = p.y;
        requestRedraw();
      } else if (state.panning) {
        if (Math.hypot(ev.clientX - state.downX, ev.clientY - state.downY) >= 5) {
          state.dragMoved = true;
        }
        state.panX += ev.clientX - state.lastX;
        state.panY += ev.clientY - state.lastY;
        state.lastX = ev.clientX;
        state.lastY = ev.clientY;
        requestRedraw();
      } else if (ev.target === canvas && state.active) {
        var hp = toWorld(ev.clientX, ev.clientY);
        var hit = hitAt(hp.x, hp.y);
        if (state.hovered !== hit) {
          state.hovered = hit;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          updateTooltip(hit);
          requestRedraw();
        }
      }
    });

    window.addEventListener('mouseup', function () {
      state.dragging = null;
      state.panning = false;
    });

    canvas.addEventListener('click', function (ev) {
      if (state.dragMoved) return;
      var p = toWorld(ev.clientX, ev.clientY);
      var hit = hitAt(p.x, p.y);
      if (hit) {
        state.hovered = hit;
        updateTooltip(hit);
        requestRedraw();
        openNodeDossier(hit);
      }
    });

    canvas.addEventListener(
      'wheel',
      function (ev) {
        ev.preventDefault();
        state.scale = Math.max(0.25, Math.min(3.5, state.scale * (ev.deltaY < 0 ? 1.12 : 0.89)));
        requestRedraw();
      },
      { passive: false }
    );

    window.addEventListener('resize', function () {
      if (state.active) requestRedraw();
    });

    var themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        window.setTimeout(requestRedraw, 20);
      });
    }

    return {
      activate: activateLoop,
      pause: pauseLoop,
      buildGraph: buildGraph,
      runShortestPath: runShortestPath,
    };
  }

  // ===========================================================================
  // 1-CLICK CITIZEN & JOURNALIST SIGNAL GENERATOR (ИВСС / АДФИ / КПК / EPPO)
  // ===========================================================================
  function initSignalGenerator(payload) {
    var modal = document.getElementById('svetSignalModal');
    var backdrop = document.getElementById('svetSignalBackdrop');
    var titleEl = document.getElementById('svetSignalModalTitle');
    var metaEl = document.getElementById('svetSignalMeta');
    var textEl = document.getElementById('svetSignalText');
    var closeBtn = document.getElementById('svetSignalCloseBtn');
    var cancelBtn = document.getElementById('svetSignalCancelBtn');
    var copyBtn = document.getElementById('svetSignalCopyBtn');
    var dlBtn = document.getElementById('svetSignalDownloadBtn');
    var printBtn = document.getElementById('svetSignalPrintBtn');
    var toastEl = document.getElementById('svetSignalToast');
    var quickBtn = document.getElementById('svetOpenSignalQuickBtn');
    if (!modal || !backdrop || !textEl) return;

    var doi = (payload && payload.zenodoDoi) || '10.5281/zenodo.24580253';
    var doiUrl = (payload && payload.zenodoUrl) || 'https://zenodo.org/records/24580253';
    var sha =
      (payload && payload.datasetSha256) ||
      'a30faab18bbfa551a3fc8a2389c2f8661115f9b85137e35b5eb0ad41b7a912ca';
    var uMeta = (payload && payload.universeMeta) || {};
    var casesFmt = uMeta.casesFmt || '2 234 509';
    var courtsFmt = uMeta.courtsFmt || '180';
    var judgesFmt = uMeta.judgesFmt || '3 244';
    var yearRange = uMeta.yearRange || '2023–2026';

    var flagByIdx = {};
    ((payload && payload.signalFlags) || []).forEach(function (rf) {
      if (rf && rf.idx != null) flagByIdx[String(rf.idx)] = rf;
    });

    var coiByEik = {};
    ((payload && payload.networkData && payload.networkData.conflictBridge) || []).forEach(function (cb) {
      if (cb && cb.eik) coiByEik[String(cb.eik)] = cb;
    });

    var activeAuthority = 'ivss';
    var activeContext = {
      kind: 'macro',
      title: 'Национален 4-годишен одит ЕИСС (' + yearRange + ')',
      party: 'Обобщен одит на случайното разпределение в ЕИСС',
      eik: '',
      court: courtsFmt + ' съдилища',
      caseKind: 'Търговски, граждански и административни дела',
      year: yearRange,
      judge: 'Национален извадков списък (869 RED / 154 необяснени)',
      kn: '869 RED от 62 166 теста',
      ratio: '≥ 3,00×',
      q: '< 0,01 (BH FDR)',
      daysMonths: '4 последователни години',
      procEur: 53224934606,
      caseUrl: 'https://nasvetlo.website/ot-mrak-kam-svetlina.html',
      summary: '',
    };

    function fmtProcBg(v) {
      var num = Number(v || 0);
      if (!isFinite(num) || num <= 0) return 'Няма пряко отчетен ЗОП обем за конкретната страна';
      return fmtEur(num);
    }

    function fmtQVal(q) {
      var num = Number(q);
      if (!isFinite(num)) return String(q || '—');
      return num < 0.0001 ? num.toExponential(2) : num.toFixed(4);
    }

    function renderSignalBody() {
      var ctx = activeContext;
      var refLine = ctx.caseUrl ? '\n- Директна препратка в ЕПЕП: ' + ctx.caseUrl : '';
      var eikLine = ctx.eik ? ' (ЕИК ' + ctx.eik + ')' : '';
      var disclaimerBg =
        'ПРАВНА БЕЛЕЖКА И GDPR: Посочените данни представляват математико-статистически сигнал за ' +
        'извършване на институционална проверка и не съставляват обвинение или влязъл в сила акт ' +
        '(при спазване на презумпцията за невиновност). Масивът не съдържа ЕГН и лични данни на физически лица.';
      var archiveBlockBg =
        '\nКРИПТОГРАФСКА ВЕРИФИКАЦИЯ И ПУБЛИЧЕН АРХИВ:\n' +
        '- Източник: ' +
        casesFmt +
        ' дела в ЕПЕП/ЕИСС (' +
        yearRange +
        ', ' +
        courtsFmt +
        ' съдилища, ' +
        judgesFmt +
        ' съдии)\n' +
        '- CERN Zenodo DOI: ' +
        doi +
        ' (' +
        doiUrl +
        ')\n' +
        '- SHA-256 контролна сума (nasvetlo_eiss_audit.json): ' +
        sha +
        '\n- Пълно уеб досие: https://nasvetlo.website/ot-mrak-kam-svetlina.html';

      if (activeAuthority === 'ivss') {
        return (
          'ДО: ИНСПЕКТОРАТА КЪМ ВИСШИЯ СЪДЕБЕН СЪВЕТ (ИВСС) и СЪДИЙСКАТА КОЛЕГИЯ НА ВСС\n' +
          'ОТНОСНО: Сигнал по Глава VIII АПК и искане за проверка на случайното разпределение по чл. 9 и чл. 54 ЗСВ\n\n' +
          'Уважаеми Главни инспектори и Членове на ВСС,\n\n' +
          'На основание чл. 107–125 АПК и чл. 54, ал. 1, т. 1 и т. 4 ЗСВ представям статистически сигнал, ' +
          'установен при независим биномен тест (Benjamini–Hochberg FDR q < 0,01) върху публичните записи на ЕПЕП/ЕИСС:\n\n' +
          'КОНКРЕТЕН ПРЕДМЕТ НА ПРОВЕРКА:\n' +
          '- Съд и категория: ' +
          ctx.court +
          ' · ' +
          ctx.caseKind +
          ' (' +
          ctx.year +
          ')\n' +
          '- Страна / Субект: ' +
          ctx.party +
          eikLine +
          '\n' +
          '- Разпределен съдия-докладчик: ' +
          ctx.judge +
          '\n' +
          '- Концентрация (k / n): ' +
          ctx.kn +
          ' дела | Кратност спрямо дела в клетката: ' +
          ctx.ratio +
          ' | BH FDR q = ' +
          ctx.q +
          '\n' +
          '- Времева дисперсия: ' +
          ctx.daysMonths +
          refLine +
          (ctx.summary ? '\n\nДОПЪЛНИТЕЛНИ ДАННИ ОТ ДОСИЕТО:\n' + ctx.summary : '') +
          '\n\nМОЛЯ ДА ПРОВЕРИТЕ В ЕИСС:\n' +
          '1. Приложените коефициенти за натовареност, изключвания на съдии и протоколи за разпределение на горепосочените дела.\n' +
          '2. Наличието на повторно/ръчно преразпределение или деактивиране на случайния избор по чл. 9 ЗСВ.\n' +
          archiveBlockBg +
          '\n\n' +
          disclaimerBg +
          '\n\nПодател: __________________________ (Гражданин / Журналист / Организация)\nЕлектронна поща за обратна връзка: __________________________\nДата: __________________________'
        );
      }

      if (activeAuthority === 'adfi') {
        return (
          'ДО: АГЕНЦИЯ ЗА ДЪРЖАВНА ФИНАНСОВА ИНСПЕКЦИЯ (АДФИ) и КОМИСИЯ ЗА ПРОТИВОДЕЙСТВИЕ НА КОРУПЦИЯТА (КПК)\n' +
          'ОТНОСНО: Сигнал за кръстосан риск по ЦАИС ЕОП (ЗОП), ЗПК и свързани съдебни спорове в ЕИСС\n\n' +
          'Уважаеми Директоре на АДФИ / Членове на КПК,\n\n' +
          'Моля за извършване на финансова инспекция и проверка за конфликт на интереси (ЗПК) и концентрация по ЗОП ' +
          'във връзка със засечена кръстосана аномалия между публичните договори в ЦАИС ЕОП и съдебните дела в ЕПЕП/ЕИСС:\n\n' +
          'ЗАСЕЧЕН СУБЕКТ И ИНДИКАТОРИ:\n' +
          '- Субект / Възложител / Изпълнител: ' +
          ctx.party +
          eikLine +
          '\n' +
          '- Засечен обем обществени поръчки: ' +
          fmtProcBg(ctx.procEur) +
          '\n' +
          '- Съдебна концентрация в ЕИСС: ' +
          ctx.court +
          ' · Съдия ' +
          ctx.judge +
          ' (' +
          ctx.kn +
          ', кратност ' +
          ctx.ratio +
          ', q = ' +
          ctx.q +
          ')' +
          refLine +
          (ctx.summary ? '\n\nДЕТАЙЛИ ПО ВЕРИГАТА:\n' + ctx.summary : '') +
          '\n\nМОЛЯ ЗА ПРОВЕРКА ПО КОМПЕТЕНТНОСТ:\n' +
          '1. Дали са спазени процедурите по ЗОП (вкл. договори с 1 оферта, анекси по чл. 116 ЗОП и вписани действителни собственици по ЗМИП).\n' +
          '2. Наличие на свързани лица и несъвместимост/конфликт на интереси по декларираните обстоятелства пред КПК.\n' +
          archiveBlockBg +
          '\n\n' +
          disclaimerBg +
          '\n\nПодател: __________________________\nКонтакт за уведомление по чл. 123 АПК: __________________________'
        );
      }

      return (
        'TO: EUROPEAN PUBLIC PROSECUTOR\'S OFFICE (EPPO — Luxembourg / Sofia European Delegated Prosecutors) & OLAF\n' +
        'SUBJECT: Statistical Cross-Registry Integrity Alert — Bulgaria EISS Judicial Allocation & EU-Funded Procurement (2023–2026)\n\n' +
        'Dear European Chief Prosecutor and European Delegated Prosecutors,\n\n' +
        'Pursuant to Council Regulation (EU) 2017/1939, please find below a reproducible, GDPR-compliant statistical triage record ' +
        'linking official Bulgarian Unified Judicial Portal records (EISS/EPEP) with public procurement awards (CAIS-EOP):\n\n' +
        'SPECIFIC SIGNAL RECORD:\n' +
        '- Entity / Party: ' +
        ctx.party +
        eikLine +
        '\n' +
        '- Court & Docket: ' +
        ctx.court +
        ' | ' +
        ctx.caseKind +
        ' (' +
        ctx.year +
        ')\n' +
        '- Judge Allocation Anomaly: ' +
        ctx.judge +
        ' | k/n = ' +
        ctx.kn +
        ' | Multiplier = ' +
        ctx.ratio +
        ' | BH FDR q = ' +
        ctx.q +
        ' (' +
        ctx.daysMonths +
        ')\n' +
        '- Linked Public Procurement Volume (CAIS-EOP): ' +
        fmtProcBg(ctx.procEur) +
        refLine +
        (ctx.summary ? '\n\nDOSSIER CONTEXT:\n' + ctx.summary : '') +
        '\n\nMACRO CONTEXT (EU FUNDS RISK):\n' +
        '- 28,339 EU-funded CAIS-EOP contracts monitored (EUR 10.74B); 9,397 single-bidder awards (EUR 1.79B); 302 high-risk EPPO cohort contracts (EUR 1.58B).\n' +
        '- Immutable CERN Zenodo Dataset DOI: ' +
        doi +
        ' (' +
        doiUrl +
        ')\n' +
        '- Cryptographic Snapshot SHA-256: ' +
        sha +
        '\n- English Executive Brief: https://nasvetlo.website/en/\n\n' +
        'DISCLAIMER: Statistical indicators represent automated triage anomalies over official public registries (0 personal EGN identifiers) ' +
        'and do not constitute criminal accusations under the presumption of innocence.\n\n' +
        'Submitted by: __________________________\nContact Email: __________________________'
      );
    }

    function refreshModal() {
      if (titleEl) titleEl.textContent = 'Сигнал: ' + activeContext.title;
      if (metaEl) {
        metaEl.innerHTML =
          '<span><strong>Субект:</strong> ' +
          esc(activeContext.party) +
          '</span>' +
          '<span><strong>Кратност:</strong> ' +
          esc(activeContext.ratio) +
          '</span>' +
          '<span><strong>CERN Zenodo DOI:</strong> ' +
          esc(doi) +
          '</span>';
      }
      textEl.value = renderSignalBody();
    }

    function openSignalModal(ctx) {
      activeContext = ctx;
      refreshModal();
      backdrop.hidden = false;
      modal.hidden = false;
      backdrop.classList.add('is-open');
      modal.classList.add('is-open');
      window.setTimeout(function () {
        textEl.focus();
      }, 40);
    }

    function closeSignalModal() {
      backdrop.hidden = true;
      modal.hidden = true;
      backdrop.classList.remove('is-open');
      modal.classList.remove('is-open');
    }

    closeSignalModal();

    modal.querySelectorAll('[data-svet-signal-authority]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        modal.querySelectorAll('[data-svet-signal-authority]').forEach(function (b) {
          b.classList.remove('active');
        });
        tab.classList.add('active');
        activeAuthority = tab.getAttribute('data-svet-signal-authority') || 'ivss';
        refreshModal();
      });
    });

    document.addEventListener('click', function (ev) {
      var idxBtn = ev.target.closest('[data-svet-signal-idx]');
      if (idxBtn) {
        ev.stopPropagation();
        var rf = flagByIdx[idxBtn.getAttribute('data-svet-signal-idx')];
        if (!rf) return;
        openSignalModal({
          kind: 'redflag',
          title: rf.party + ' → ' + rf.judge,
          party: rf.party,
          eik: rf.eik || '',
          court: rf.court,
          caseKind: rf.kind,
          year: String(rf.year || ''),
          judge: rf.judge,
          kn: rf.k + ' / ' + rf.n,
          ratio: '×' + Number(rf.ratio || 0).toFixed(2).replace('.', ','),
          q: fmtQVal(rf.q),
          daysMonths: (rf.distinctDays || 0) + ' дни / ' + (rf.distinctMonths || 0) + ' мес.',
          procEur: rf.procEur || 0,
          caseUrl: rf.caseUrl || '',
          summary: rf.basis || '',
        });
        return;
      }

      var coiBtn = ev.target.closest('[data-svet-signal-coi]');
      if (coiBtn) {
        ev.stopPropagation();
        var cb = coiByEik[coiBtn.getAttribute('data-svet-signal-coi')];
        if (!cb) return;
        openSignalModal({
          kind: 'coi',
          title: 'Верига ЕИК ' + cb.eik + ' · ' + cb.party,
          party: cb.party,
          eik: cb.eik || '',
          court: (cb.courts || []).join(', ') || 'Множество съдилища в ЕИСС',
          caseKind: 'Конфликт на интереси и търговски/административни дела',
          year: yearRange,
          judge: 'Засечени съдии в ' + (cb.redFlagsCount || 0) + ' RED флага',
          kn: (cb.unexplainedRedCount || 0) + ' необяснени / ' + (cb.redFlagsCount || 0) + ' общо RED',
          ratio: '×' + Number(cb.maxRatio || 0).toFixed(2).replace('.', ','),
          q: '< 0,01 (BH FDR)',
          daysMonths: 'Многоинституционално кръстосване',
          procEur: Number(cb.procurementEurM || 0) * 1e6,
          caseUrl: 'https://nasvetlo.website/ot-mrak-kam-svetlina.html',
          summary: 'Общ брой ЗОП договори: ' + (cb.procurementContracts || 0),
        });
      }
    });

    document.addEventListener('svet:open-signal', function (ev) {
      var d = (ev && ev.detail) || {};
      openSignalModal({
        kind: 'drawer',
        title: d.title || 'Отворено досие',
        party: d.title || 'Отворено досие',
        eik: '',
        court: courtsFmt + ' съдилища (ЕПЕП/ЕИСС)',
        caseKind: 'Кросиран възел от одитното досие',
        year: yearRange,
        judge: 'Съгласно приложеното досие по-долу',
        kn: 'Виж статистическата справка по-долу',
        ratio: 'FDR < 0,01',
        q: '< 0,01',
        daysMonths: yearRange,
        procEur: 0,
        caseUrl: 'https://nasvetlo.website/ot-mrak-kam-svetlina.html',
        summary: d.summary || '',
      });
    });

    if (quickBtn) {
      quickBtn.addEventListener('click', function () {
        openSignalModal(activeContext);
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeSignalModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSignalModal);
    backdrop.addEventListener('click', closeSignalModal);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal.classList.contains('is-open')) closeSignalModal();
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textEl.value).then(function () {
            if (toastEl) {
              toastEl.hidden = false;
              window.setTimeout(function () {
                toastEl.hidden = true;
              }, 2200);
            }
          });
        }
      });
    }

    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        var blob = new Blob(['\uFEFF' + textEl.value], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'nasvetlo_signal_' + activeAuthority + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', function () {
        var w = window.open('', '_blank', 'width=840,height=920');
        if (!w) return;
        w.document.open();
        w.document.write(
          '<!doctype html><html><head><meta charset="utf-8"><title>' +
            esc(activeContext.title) +
            '</title><style>body{font-family:Georgia,serif;max-width:740px;margin:28px auto;padding:0 18px;line-height:1.55;color:#111;}pre{white-space:pre-wrap;font-family:inherit;font-size:13.5px;}</style></head><body><pre>' +
            esc(textEl.value) +
            '</pre></body></html>'
        );
        w.document.close();
        w.focus();
        w.print();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initGate();
    document.addEventListener('click', function (ev) {
      var pill = ev.target && ev.target.closest ? ev.target.closest('a.svet-inspect-pill') : null;
      if (pill && pill.closest('tr.svet-row-clickable')) {
        ev.stopPropagation();
      }
    });
    ensureRuntimePayload().then(function () {
      initJudicialMap();
      var filterProxy = { searchAll: null };
      var drawerApi = initDependencyDrawer(filterProxy);
      var networkGraphApi = initJudicialNetworkGraph(drawerApi);
      var filterApi = initControls(networkGraphApi);
      if (filterApi && filterApi.searchAll) {
        filterProxy.searchAll = filterApi.searchAll;
      }
      initSignalGenerator(parsePayload());
    });
  });
})();
