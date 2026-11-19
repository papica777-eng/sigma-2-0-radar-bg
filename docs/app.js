(() => {
  'use strict';

  const state = {
    meta: null,
    officials: [],
    bySlug: new Map(),
    circles: null,
    comp: null,
    deep: null,
    deepBySlug: new Map(),
    deepTier: 'missed',
    deepConsSearch: '',
    hofMode: 'combined',
    sharedEiks: new Set(),
    filter: 'all',
    scope: 'all',
    sort: 'period',
    search: '',
    page: 1,
    pageSize: 100,
    graph: {
      nodes: [],
      edges: [],
      dragging: null,
      hovered: null,
      panX: 0,
      panY: 0,
      scale: 1,
      panning: false,
      lastX: 0,
      lastY: 0,
      raf: null,
      simSteps: 0,
    },
  };

  const fmtEur = (n) => {
    const v = Number(n || 0);
    if (v >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' млрд. €';
    if (v >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' млн. €';
    if (v >= 1e3) return Math.round(v).toLocaleString('bg-BG') + ' €';
    return v.toFixed(0) + ' €';
  };

  const fmtInt = (n) => Number(n || 0).toLocaleString('bg-BG');

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === 'tab-' + tabId);
    });
    if (tabId === 'graph' && !state.graph.nodes.length) {
      buildGraphData(document.getElementById('graphPresetSelect').value);
    }
  }

  function jumpToDirectory(opts = {}) {
    switchTab('directory');
    if (opts.filter !== undefined) state.filter = opts.filter;
    if (opts.search !== undefined) {
      state.search = opts.search;
      document.getElementById('searchInput').value = opts.search;
    }
    if (opts.sort !== undefined) {
      state.sort = opts.sort;
      document.getElementById('sortSelect').value = opts.sort;
    }
    state.page = 1;
    renderFilterPills();
    renderDirectory();
    const el = document.getElementById('mainTabs');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function init() {
    try {
      const [offRes, cirRes, compRes, deepRes] = await Promise.all([
        fetch('data/officials_all.json'),
        fetch('data/circles_graph.json'),
        fetch('data/competition_stats.json'),
        fetch('data/deep_links.json').catch(() => null),
      ]);
      const offJson = await offRes.json();
      const cirJson = await cirRes.json();
      const compJson = await compRes.json();
      const deepJson = deepRes && deepRes.ok ? await deepRes.json() : null;

      state.meta = offJson.meta;
      state.officials = offJson.officials || [];
      state.officials.forEach((o) => state.bySlug.set(o.slug, o));
      state.circles = cirJson;
      state.comp = compJson;
      state.deep = deepJson;
      if (deepJson && deepJson.hiddenConsortiumLeaderboard) {
        deepJson.hiddenConsortiumLeaderboard.forEach((lb) => state.deepBySlug.set(lb.slug, lb));
      }
      (cirJson.sharedCompanies || []).forEach((sc) => state.sharedEiks.add(sc.eik));

      renderHeader();
      renderHallOfFamePyramid();
      renderVisualCharts();
      renderFilterPills();
      renderDirectory();
      renderDeepTab();
      renderClusters();
      renderMonopolies();
      populateGraphInstDropdown();
      setupEvents();
    } catch (err) {
      console.error(err);
      document.getElementById('officialsTbody').innerHTML =
        `<tr><td colspan="7" class="loading" style="color:#b91c1c;">Грешка при зареждане на данните: ${esc(err.message)}</td></tr>`;
    }
  }

  function renderHeader() {
    const m = state.meta;
    document.getElementById('syncSubtitle').textContent =
      `Данни от sigma.midt.bg (CC-BY 4.0) · Обновено: ${m.refreshedAt} · Пълен обхват: ${m.totalOfficialsAllRoles} лица`;
    document.getElementById('asOfChip').textContent = `Към дата: ${m.asOf}`;
  }

  // ===== CENTRAL NEON PYRAMID: HALL OF FAME (TOP 50) =====
  function renderHallOfFamePyramid() {
    const host = document.getElementById('hofPyramid');
    if (!host || !state.officials.length) return;

    const enriched = state.officials.map((o) => {
      const dc = state.deepBySlug.get(o.slug);
      const dzzdEur = dc ? Number(dc.hiddenConsortiumEur || 0) : 0;
      const dzzdCnt = dc ? Number(dc.hiddenConsortiumCount || 0) : 0;
      return {
        ...o,
        dzzdEur,
        dzzdCnt,
        combinedEur: Number(o.totalEur || 0) + dzzdEur,
      };
    });

    const mode = state.hofMode;
    let pool = enriched;
    if (mode === 'own') {
      pool = enriched
        .filter((o) => o.ownInstitution)
        .sort((a, b) => b.periodEur - a.periodEur || b.combinedEur - a.combinedEur);
    } else if (mode === 'period') {
      pool = [...enriched].sort((a, b) => b.periodEur - a.periodEur || b.combinedEur - a.combinedEur);
    } else if (mode === 'dzzd') {
      pool = enriched
        .filter((o) => o.dzzdEur > 0)
        .sort((a, b) => b.dzzdEur - a.dzzdEur || b.totalEur - a.totalEur);
    } else {
      pool = [...enriched].sort((a, b) => b.combinedEur - a.combinedEur || b.periodEur - a.periodEur);
    }

    const top50 = pool.slice(0, 50);

    // 9-row monumental pyramid geometry: 1 + 2 + 3 + 4 + 5 + 6 + 7 + 10 + 12 = 50
    const rowSpecs = [
      { count: 1, rowCls: 'tier-apex', cardCls: 'rank-apex', level: 'apex' },
      { count: 2, rowCls: 'tier-2', cardCls: 'rank-upper', level: 'upper' },
      { count: 3, rowCls: 'tier-3', cardCls: 'rank-upper', level: 'upper' },
      { count: 4, rowCls: 'tier-4', cardCls: 'rank-mid', level: 'mid' },
      { count: 5, rowCls: 'tier-5', cardCls: 'rank-mid', level: 'mid' },
      { count: 6, rowCls: 'tier-6', cardCls: 'rank-mid', level: 'mid' },
      { count: 7, rowCls: 'tier-7', cardCls: 'rank-base', level: 'base' },
      { count: 10, rowCls: 'tier-base', cardCls: 'rank-base', level: 'base' },
      { count: 12, rowCls: 'tier-base', cardCls: 'rank-base', level: 'base' },
    ];

    const getPrimaryValue = (o) => {
      if (mode === 'period' || mode === 'own') return o.periodEur;
      if (mode === 'dzzd') return o.dzzdEur;
      return o.combinedEur;
    };

    let cursor = 0;
    const rowsHtml = rowSpecs
      .map((spec) => {
        const items = top50.slice(cursor, cursor + spec.count);
        if (!items.length) return '';
        const cardsHtml = items
          .map((o, idx) => {
            const rank = cursor + idx + 1;
            const val = getPrimaryValue(o);
            const pills = [];
            if (o.ownInstitution) pills.push(`<span class="hof-pill hof-pill-own">Собств. инст.</span>`);
            if (o.dzzdEur > 0 && spec.level !== 'base') {
              pills.push(`<span class="hof-pill hof-pill-dzzd">+ДЗЗД</span>`);
            }
            const topComp = (o.companies && o.companies[0]) ? o.companies[0].name : '';
            let subline = '';
            if (spec.level === 'apex') {
              subline = `<div class="hof-subline">${esc(topComp)} · СИГМА: ${fmtEur(o.totalEur)}${o.dzzdEur > 0 ? ' · Скрити ДЗЗД (' + o.dzzdCnt + '): +' + fmtEur(o.dzzdEur) : ''}${o.periodEur > 0 ? ' · В мандата: ' + fmtEur(o.periodEur) : ''}</div>`;
            } else if (spec.level === 'upper') {
              subline = `<div class="hof-subline">${esc(topComp)}${o.dzzdEur > 0 ? ' · ДЗЗД: +' + fmtEur(o.dzzdEur) : ' · В мандата: ' + fmtEur(o.periodEur)}</div>`;
            } else if (spec.level === 'mid') {
              subline = `<div class="hof-subline">${o.dzzdEur > 0 ? 'ДЗЗД +' + fmtEur(o.dzzdEur) : esc(topComp)}</div>`;
            }

            return `<div class="hof-card ${spec.cardCls} ${o.ownInstitution ? 'is-own' : ''}" data-open-slug="${esc(o.slug)}" title="${esc(o.name)} — ${esc(o.primaryInstitution)}">
              <div>
                <div class="hof-card-top">
                  <span class="hof-rank">#${String(rank).padStart(2, '0')}</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">${pills.join('')}</div>
                </div>
                <div class="hof-name">${esc(o.name)}</div>
                <div class="hof-inst">${esc(o.primaryInstitution)}</div>
              </div>
              <div>
                <div class="hof-amount">${mode === 'dzzd' ? '+' : ''}${fmtEur(val)}</div>
                ${subline}
              </div>
            </div>`;
          })
          .join('');
        cursor += items.length;
        return `<div class="hof-row ${spec.rowCls}">${cardsHtml}</div>`;
      })
      .join('');

    host.innerHTML = rowsHtml;

    const sumVal = top50.reduce((acc, o) => acc + getPrimaryValue(o), 0);
    const ownIn50 = top50.filter((o) => o.ownInstitution).length;
    const modeLabels = {
      combined: 'Общ обем (СИГМА + скрити ДЗЗД)',
      own: 'Договори в мандата от собствената институция',
      period: 'Договори в декларирания период',
      dzzd: 'Скрити поръчки през ДЗЗД консорциуми',
    };
    const sumEl = document.getElementById('hofSummaryText');
    if (sumEl) {
      sumEl.innerHTML = `<strong>${top50.length} лица</strong> в пирамидата (${modeLabels[mode]}): <strong class="mono" style="color:#fbbf24;">${fmtEur(sumVal)}</strong> · От собствената институция: <strong style="color:#fda4af;">${ownIn50}</strong>`;
    }
    if (mode === 'combined' && top50.length >= 3) {
      const teaser = document.getElementById('hofTriggerTeaser');
      if (teaser) {
        teaser.textContent = `#01 ${top50[0].name} (${fmtEur(top50[0].combinedEur)}) · #02 ${top50[1].name} · #03 ${top50[2].name}`;
      }
    }
  }

  function openHallOfFame() {
    const bd = document.getElementById('hofModalBackdrop');
    if (!bd) return;
    if (!document.getElementById('hofPyramid').children.length) renderHallOfFamePyramid();
    bd.classList.add('open');
    bd.setAttribute('aria-hidden', 'false');
    bd.scrollTop = 0;
    document.body.style.overflow = 'hidden';
  }

  function closeHallOfFame() {
    const bd = document.getElementById('hofModalBackdrop');
    if (!bd) return;
    bd.classList.remove('open');
    bd.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ===== 4 INTERACTIVE VISUAL CHARTS FOR ORDINARY CITIZENS =====
  function renderVisualCharts() {
    const sectors = (state.circles.circleSummary || []).slice(0, 7);
    const totalPeriod = state.meta.totalPeriodEur || 1;
    const maxSec = Math.max(...sectors.map((s) => s.periodEur), 1);

    const sectorToFilter = (name) => {
      if (name.includes('Общини')) return 'municipal';
      if (name.includes('Народно събрание')) return 'parliament';
      if (name.includes('Служби')) return 'security';
      if (name.includes('Централна') || name.includes('Областни')) return 'central';
      if (name.includes('болници')) return 'health';
      if (name.includes('дружества')) return 'state_co';
      return 'all';
    };

    // Chart 1: Sector Horizontal Bars
    document.getElementById('chartSectorBars').innerHTML = sectors
      .map((s, idx) => {
        const pctWidth = Math.max(2, (s.periodEur / maxSec) * 100);
        const sharePct = ((s.periodEur / totalPeriod) * 100).toFixed(1).replace('.', ',');
        const fillCol = idx === 0 ? '#b91c1c' : idx === 1 ? '#1e3a8a' : '#475569';
        return `
          <div class="hbar-item" data-chart-filter="${sectorToFilter(s.circle)}">
            <div class="hbar-top">
              <span class="hbar-name">${esc(s.circle)} <span class="muted" style="font-weight:400;">(${s.officialCount} лица)</span></span>
              <span class="hbar-val">${fmtEur(s.periodEur)} <span class="muted" style="font-weight:400;">(${sharePct}%)</span></span>
            </div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${pctWidth}%;background:${fillCol};"></div></div>
          </div>`;
      })
      .join('');

    // Chart 2: SVG Donut Breakdown of all 571 Officials
    const ownCnt = state.officials.filter((o) => o.ownInstitution).length;
    const inPeriodOtherCnt = state.officials.filter((o) => !o.ownInstitution && o.inCore512 && o.hasContemporaneous).length;
    const histCoreCnt = state.officials.filter((o) => !o.ownInstitution && o.inCore512 && !o.hasContemporaneous).length;
    const boardOnlyCnt = state.officials.filter((o) => !o.inCore512).length;
    const totalN = state.officials.length || 1;

    const slices = [
      { label: 'От собствената институция', count: ownCnt, color: '#b91c1c', filter: 'own' },
      { label: 'В мандата (друга институция)', count: inPeriodOtherCnt, color: '#b45309', filter: 'all' },
      { label: 'Историческа / извън мандата', count: histCoreCnt, color: '#1e3a8a', filter: 'all' },
      { label: 'Членове на съвети', count: boardOnlyCnt, color: '#94a3b8', filter: 'all' },
    ];

    const r = 64;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const arcsSvg = slices
      .map((sl) => {
        const len = (sl.count / totalN) * circ;
        const svg = `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${sl.color}" stroke-width="24"
          stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 90 90)" style="cursor:pointer;" data-chart-filter="${sl.filter}" />`;
        offset += len;
        return svg;
      })
      .join('');

    document.getElementById('chartDonutWrap').innerHTML = `
      <svg viewBox="0 0 180 180" width="176" height="176" aria-label="Разпределение на 571 лица">
        ${arcsSvg}
        <text x="90" y="86" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="24" font-weight="700" fill="#131720">${totalN}</text>
        <text x="90" y="104" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="11" fill="#6c7484">общо лица</text>
      </svg>
      <ul class="donut-legend">
        ${slices
          .map(
            (sl) => `<li data-chart-filter="${sl.filter}">
              <span><i class="dot" style="background:${sl.color};margin-right:7px;"></i>${sl.label}</span>
              <span class="mono" style="font-weight:600;">${sl.count} <span class="muted" style="font-weight:400;">(${((sl.count / totalN) * 100).toFixed(1)}%)</span></span>
            </li>`
          )
          .join('')}
      </ul>`;

    // Chart 3: Top 10 Biggest Cases by Period Value
    const top10 = [...state.officials]
      .sort((a, b) => b.periodEur - a.periodEur)
      .slice(0, 10);
    const maxTop = Math.max(...top10.map((o) => o.periodEur), 1);

    document.getElementById('chartTop10Bars').innerHTML = top10
      .map((o) => {
        const w = Math.max(3, (o.periodEur / maxTop) * 100);
        const col = o.ownInstitution ? '#b91c1c' : '#334155';
        return `
          <div class="hbar-item" data-open-slug="${esc(o.slug)}">
            <div class="hbar-top">
              <span class="hbar-name">${esc(o.name)} <span class="muted" style="font-weight:400;">· ${esc(o.primaryInstitution)}</span></span>
              <span class="hbar-val" style="color:${o.ownInstitution ? '#b91c1c' : 'var(--ink)'};">${fmtEur(o.periodEur)}</span>
            </div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${w}%;background:${col};"></div></div>
          </div>`;
      })
      .join('');

    // Chart 4: National Competition Stacked Proportion Bars
    const nat = state.meta.nationalTotals || {};
    const proc = state.meta.procedureTotals || {};
    const soValPct = ((nat.singleOfferValueShare || 0.4066) * 100).toFixed(1);
    const multiValPct = (100 - Number(soValPct)).toFixed(1);
    const soCntPct = ((nat.singleOfferShare || 0.4541) * 100).toFixed(1);
    const multiCntPct = (100 - Number(soCntPct)).toFixed(1);
    const nonCompPct = ((proc.nonCompetitiveShare || 0.1354) * 100).toFixed(1);
    const compPct = (100 - Number(nonCompPct)).toFixed(1);

    document.getElementById('chartCompetitionGauge').innerHTML = `
      <div class="gauge-block">
        <div class="hbar-top">
          <span class="hbar-name">По стойност на договорите (€45,47 млрд. с известен брой оферти)</span>
          <span class="hbar-val" style="color:#b91c1c;">${soValPct}% без конкуренция</span>
        </div>
        <div class="gauge-bar">
          <div class="gauge-seg" style="width:${soValPct}%;background:#b91c1c;">${soValPct}% (€18,49 млрд.)</div>
          <div class="gauge-seg" style="width:${multiValPct}%;background:#334155;">${multiValPct}% с 2+ оферти</div>
        </div>
        <div class="gauge-legend">
          <span><i class="dot" style="background:#b91c1c;margin-right:5px;"></i>1 оферта: <strong>€18,49 млрд.</strong></span>
          <span><i class="dot" style="background:#334155;margin-right:5px;"></i>2+ оферти: <strong>€26,98 млрд.</strong></span>
        </div>
      </div>

      <div class="gauge-block">
        <div class="hbar-top">
          <span class="hbar-name">По брой договори (184 843 договора с данни за оферти)</span>
          <span class="hbar-val" style="color:#b45309;">${soCntPct}% само 1 участник</span>
        </div>
        <div class="gauge-bar">
          <div class="gauge-seg" style="width:${soCntPct}%;background:#b45309;">${fmtInt(nat.singleOffer || 83930)} договора</div>
          <div class="gauge-seg" style="width:${multiCntPct}%;background:#64748b;">${fmtInt((nat.contracts || 184843) - (nat.singleOffer || 83930))} с 2+ оферти</div>
        </div>
      </div>

      <div class="gauge-block" style="margin-bottom:0;">
        <div class="hbar-top">
          <span class="hbar-name">Неконкурентни процедури / пряко договаряне (от 187 473 класифицирани)</span>
          <span class="hbar-val" style="color:#6b21a8;">${nonCompPct}% (€5,92 млрд.)</span>
        </div>
        <div class="gauge-bar">
          <div class="gauge-seg" style="width:${nonCompPct}%;background:#6b21a8;">${nonCompPct}%</div>
          <div class="gauge-seg" style="width:${compPct}%;background:#94a3b8;color:#131720;">${compPct}% състезателни процедури</div>
        </div>
        <div class="muted" style="font-size:11.5px;margin-top:6px;">
          Общо <strong>25 380 договора</strong> за <strong>€5,92 млрд.</strong> без открито състезание.
          <a href="#" id="linkJumpMonopolies" style="margin-left:6px;font-weight:600;">Виж най-концентрираните институции &rarr;</a>
        </div>
      </div>`;

    const jm = document.getElementById('linkJumpMonopolies');
    if (jm) {
      jm.onclick = (e) => {
        e.preventDefault();
        switchTab('monopolies');
        document.getElementById('mainTabs').scrollIntoView({ behavior: 'smooth' });
      };
    }
  }

  function getScopedOfficials() {
    if (state.scope === 'core512') {
      return state.officials.filter((o) => o.inCore512);
    }
    return state.officials;
  }

  function matchCategory(o, filterKey) {
    switch (filterKey) {
      case 'own': return o.ownInstitution;
      case 'parliament': return o.circle.includes('Народно събрание');
      case 'security': return o.circle.includes('Служби за сигурност');
      case 'central': return o.circle.includes('Централна власт') || o.circle.includes('Областни');
      case 'municipal': return o.circle.includes('Общини');
      case 'health': return o.circle.includes('болници');
      case 'state_co': return o.circle.includes('Държавни и общински дружества');
      case 'registry': return o.hasRegistryRole || o.omissionsCount > 0;
      case 'family': return o.hasFamilyStake || (o.relatives && o.relatives.length > 0);
      case 'shared': return o.companies.some((c) => state.sharedEiks.has(c.eik));
      case 'burgas': return o.isBurgas;
      default: return true;
    }
  }

  function renderFilterPills() {
    const base = getScopedOfficials();
    const defs = [
      { key: 'all', label: 'Всички', dot: '' },
      { key: 'own', label: 'От собствената институция', dot: '#b91c1c' },
      { key: 'parliament', label: 'Народно събрание', dot: '#1e3a8a' },
      { key: 'security', label: 'ДАНС, ДАТО и МВР', dot: '#131720' },
      { key: 'central', label: 'Министерства, агенции и области', dot: '#0369a1' },
      { key: 'municipal', label: 'Общини и общински съвети', dot: '#b45309' },
      { key: 'health', label: 'Болници', dot: '#0f766e' },
      { key: 'state_co', label: 'Държавни и общински дружества', dot: '#475569' },
      { key: 'registry', label: 'Вписани роли по ТР', dot: '#6b21a8' },
      { key: 'family', label: 'Дял на свързано лице', dot: '#7c3aed' },
      { key: 'shared', label: 'Споделени дружества', dot: '#be123c' },
      { key: 'burgas', label: 'Област Бургас', dot: '#0284c7' },
    ];
    document.getElementById('filterPills').innerHTML = defs
      .map((d) => {
        const cnt = base.filter((o) => matchCategory(o, d.key)).length;
        const dotHtml = d.dot ? `<i class="dot" style="background:${d.dot};"></i>` : '';
        return `<button class="pill ${state.filter === d.key ? 'active' : ''}" data-filter="${d.key}">${dotHtml}${d.label}<span class="cnt">${cnt}</span></button>`;
      })
      .join('');
  }

  function getFilteredOfficials() {
    const q = state.search.trim().toLowerCase();
    let list = getScopedOfficials().filter((o) => matchCategory(o, state.filter));
    if (q) {
      list = list.filter((o) => {
        if (o.name.toLowerCase().includes(q)) return true;
        if (o.primaryInstitution.toLowerCase().includes(q)) return true;
        if (o.circle.toLowerCase().includes(q)) return true;
        if (o.companies.some((c) => c.name.toLowerCase().includes(q) || c.eik.includes(q))) return true;
        if (o.institutions.some((i) => i.institution.toLowerCase().includes(q) || i.positions.some((p) => p.toLowerCase().includes(q)))) return true;
        if ((o.relatives || []).some((r) => r.name.toLowerCase().includes(q))) return true;
        if ((o.byAuthority || []).some((a) => a.name.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    const s = state.sort;
    list = [...list].sort((a, b) => {
      if (s === 'total') return b.totalEur - a.totalEur;
      if (s === 'own') return (b.ownInstitution - a.ownInstitution) || (b.periodEur - a.periodEur);
      if (s === 'contracts') return b.contractCount - a.contractCount;
      if (s === 'name') return a.name.localeCompare(b.name, 'bg');
      return b.periodEur - a.periodEur || b.totalEur - a.totalEur;
    });
    return list;
  }

  function renderDirectory() {
    const list = getFilteredOfficials();
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const slice = list.slice(start, start + state.pageSize);

    const tbody = document.getElementById('officialsTbody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading">Няма намерени записи по зададените критерии.</td></tr>`;
    } else {
      tbody.innerHTML = slice
        .map((o, idx) => {
          const instLines = o.institutions
            .slice(0, 2)
            .map((i) => {
              const pos = i.positions.slice(0, 2).join(', ');
              const yrs = i.years.length ? ` (${i.years[0]}–${i.years[i.years.length - 1]})` : '';
              return `<div class="inst-line">${esc(i.institution)}${pos ? ' · ' + esc(pos) : ''}${yrs}</div>`;
            })
            .join('');
          const compHtml = o.companies
            .map((c) => {
              const sharedTag = state.sharedEiks.has(c.eik) ? `<span class="tag tag-plum" style="margin-left:5px;">споделена</span>` : '';
              return `<div class="comp-item"><span class="comp-name">${esc(c.name)}</span><span class="eik-tag">ЕИК ${esc(c.eik)}</span>${sharedTag}</div>`;
            })
            .join('');
          const relHtml =
            o.relatives && o.relatives.length
              ? `<div class="inst-line" style="color:#6b21a8;">Свързани (ТР): ${o.relatives.map((r) => esc(r.name)).join(', ')}</div>`
              : '';

          const badges = [];
          if (o.ownInstitution) badges.push(`<span class="tag tag-crimson">От собствената инст.</span>`);
          if (o.hasContemporaneous) badges.push(`<span class="tag tag-ochre">В периода</span>`);
          if (o.hasRegistryRole) badges.push(`<span class="tag tag-plum">Роля по ТР</span>`);
          if (o.hasFamilyStake) badges.push(`<span class="tag tag-navy">Свързано лице</span>`);
          if (o.boardOnly) badges.push(`<span class="tag tag-slate">Член на съвет</span>`);

          return `
            <tr data-slug="${esc(o.slug)}">
              <td class="mono muted">${start + idx + 1}</td>
              <td>
                <span class="official-name">${esc(o.name)}</span>
                ${instLines}
              </td>
              <td>${compHtml}${relHtml}</td>
              <td>
                <div style="font-size:11.5px;color:var(--ink-muted);">${esc(o.circle)}</div>
                <div class="badges">${badges.join('')}</div>
              </td>
              <td class="num" style="font-weight:600;color:${o.periodEur > 0 ? 'var(--ink)' : 'var(--ink-muted)'};">${fmtEur(o.periodEur)}</td>
              <td class="num">${fmtEur(o.totalEur)}</td>
              <td class="num">${fmtInt(o.contractCount)}</td>
            </tr>`;
        })
        .join('');
    }

    document.getElementById('pagerBar').innerHTML = `
      <div class="muted">Показани <strong>${slice.length}</strong> от <strong>${total}</strong> лица (страница ${state.page} от ${totalPages})</div>
      <div style="display:flex;gap:6px;">
        <button class="btn" id="pgPrev" ${state.page <= 1 ? 'disabled' : ''}>Предишна</button>
        <button class="btn" id="pgNext" ${state.page >= totalPages ? 'disabled' : ''}>Следваща</button>
      </div>`;

    const prev = document.getElementById('pgPrev');
    const next = document.getElementById('pgNext');
    if (prev) prev.onclick = () => { if (state.page > 1) { state.page--; renderDirectory(); document.getElementById('mainTabs').scrollIntoView({ behavior: 'smooth' }); } };
    if (next) next.onclick = () => { if (state.page < totalPages) { state.page++; renderDirectory(); document.getElementById('mainTabs').scrollIntoView({ behavior: 'smooth' }); } };
  }

  // ===== SLIDE-OVER PROFILE DRAWER =====
  function openDossier(slug) {
    const o = state.bySlug.get(slug);
    if (!o) return;
    document.getElementById('drawerCircle').textContent = o.circle;
    document.getElementById('drawerName').textContent = o.name;

    const badges = [];
    if (o.ownInstitution) badges.push(`<span class="tag tag-crimson">От собствената институция</span>`);
    if (o.hasContemporaneous) badges.push(`<span class="tag tag-ochre">В декларирания период</span>`);
    if (o.hasRegistryRole) badges.push(`<span class="tag tag-plum">Роля по Търговския регистър</span>`);
    if (o.hasFamilyStake) badges.push(`<span class="tag tag-navy">Дял на свързано лице</span>`);
    badges.push(`<a class="tag tag-slate" href="${esc(o.sigmaUrl)}" target="_blank" rel="noopener">Профил в СИГМА 2.0 ↗</a>`);
    document.getElementById('drawerBadges').innerHTML = badges.join('');

    const instHtml = o.institutions
      .map(
        (i) => `<div class="contract-row">
          <strong>${esc(i.institution)}</strong><br/>
          <span class="muted">${esc(i.positions.join('; '))} · Декларирани години: ${esc(i.years.join(', '))}</span>
        </div>`
      )
      .join('');

    const compHtml = o.companies
      .map(
        (c) => `<div class="contract-row">
          <div style="display:flex;justify-content:space-between;gap:8px;">
            <strong><a href="https://sigma.midt.bg/companies/${esc(c.eik)}" target="_blank" rel="noopener">${esc(c.name)}</a></strong>
            <span class="mono muted">ЕИК ${esc(c.eik)}</span>
          </div>
          <div class="muted" style="margin-top:3px;">Основание: ${esc(c.roles.join(', '))}${c.missingYears && c.missingYears.length ? ` · Липсва в декларации за: <strong style="color:var(--crimson);">${esc(c.missingYears.join(', '))}</strong>` : ''}</div>
        </div>`
      )
      .join('');

    const relHtml =
      o.relatives && o.relatives.length
        ? `<div class="drawer-section">
            <h4>Свързани лица по Търговския регистър</h4>
            ${o.relatives.map((r) => `<div class="contract-row"><strong style="color:var(--plum);">${esc(r.name)}</strong> <span class="muted">(${esc(r.role)})</span></div>`).join('')}
          </div>`
        : '';

    const authHtml =
      o.byAuthority && o.byAuthority.length
        ? o.byAuthority
            .map(
              (a) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
                <a href="https://sigma.midt.bg/authorities/${esc(a.id)}" target="_blank" rel="noopener">${esc(a.name)}</a>
                <span class="mono" style="white-space:nowrap;font-weight:600;">${fmtEur(a.valueEur)} (${a.contracts})</span>
              </div>`
            )
            .join('')
        : '<div class="muted">Няма детайли за възложителите.</div>';

    const contractsHtml =
      o.topContracts && o.topContracts.length
        ? o.topContracts
            .map(
              (ct) => `<div class="contract-row">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
                  <span class="mono" style="font-weight:600;">${fmtEur(ct.valueEur)}</span>
                  <span class="mono muted">${esc(ct.signedAt)} ${ct.duringOffice ? '<span class="tag tag-ochre">в периода</span>' : ''}</span>
                </div>
                <div style="margin-bottom:4px;"><a href="https://sigma.midt.bg/contracts/${encodeURIComponent(ct.id)}" target="_blank" rel="noopener">${esc(ct.subject)}</a></div>
                <div class="muted" style="font-size:11.5px;">Възложител: <strong>${esc(ct.authority)}</strong> · Изпълнител: ${esc(ct.company)}</div>
              </div>`
            )
            .join('')
        : '<div class="muted">Пълният списък с договори е достъпен в оригиналния профил в СИГМА 2.0.</div>';

    const declsHtml =
      o.declarations && o.declarations.length
        ? o.declarations
            .map(
              (d) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;font-size:12px;border-bottom:1px solid var(--border);">
                <span><strong>${esc(d.year)}</strong> (${esc(d.type)}) · ${esc(d.institution)}</span>
                ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" class="mono">XML регистър ↗</a>` : ''}
              </div>`
            )
            .join('')
        : '<div class="muted">Няма индексирани XML препратки.</div>';

    document.getElementById('drawerBody').innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px;">
        <div class="kpi-card"><div class="kpi-label">В периода</div><div class="kpi-val" style="font-size:16px;">${fmtEur(o.periodEur)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Общо фирми</div><div class="kpi-val" style="font-size:16px;">${fmtEur(o.totalEur)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Договори</div><div class="kpi-val" style="font-size:16px;">${fmtInt(o.contractCount)}</div></div>
      </div>

      <div class="drawer-section"><h4>Декларирани публични длъжности</h4>${instHtml}</div>
      <div class="drawer-section"><h4>Свързани дружества (${o.companies.length})</h4>${compHtml}</div>
      ${relHtml}
      ${(() => {
        const dc = state.deepBySlug.get(o.slug);
        if (!dc) return '';
        return `<div class="drawer-section">
          <h4 style="color:var(--plum);">Отвъд СИГМА 2.0: Скрити консорциуми (ДЗЗД без ЕИК) — +${fmtEur(dc.hiddenConsortiumEur)} (${dc.hiddenConsortiumCount} ДЗЗД)</h4>
          ${dc.topConsortia
            .map(
              (tc) => `<div class="contract-row" style="border-left:3px solid var(--plum);">
                <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;">
                  <strong class="mono" style="color:var(--plum);">${fmtEur(tc.wonEur)}</strong>
                  <span class="mono muted">${tc.contracts} дог.</span>
                </div>
                <div style="font-size:12px;">${esc(tc.name)}</div>
              </div>`
            )
            .join('')}
        </div>`;
      })()}
      <div class="drawer-section"><h4>Основни възложители (общо ${o.byAuthorityTotal})</h4>${authHtml}</div>
      <div class="drawer-section"><h4>Най-големи договори (Топ ${o.topContracts.length})</h4>${contractsHtml}</div>
      <div class="drawer-section" style="border-bottom:none;"><h4>Декларации в Сметната палата (register.cacbg.bg)</h4>${declsHtml}</div>
    `;

    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('dossierDrawer').classList.add('open');
  }

  function closeDossier() {
    document.getElementById('drawerBackdrop').classList.remove('open');
    document.getElementById('dossierDrawer').classList.remove('open');
  }

  // ===== TAB 1B: BEYOND SIGMA 2.0 (DEEP LINKS, HIDDEN CONSORTIA & CR DEEDS) =====
  function renderDeepTab() {
    const d = state.deep;
    if (!d || !d.summary) return;
    const s = d.summary;

    const heroNum = document.getElementById('heroDeepNum');
    const heroSub = document.getElementById('heroDeepSub');
    if (heroNum) heroNum.textContent = '+' + fmtEur(s.hiddenConsortiumTotalEur);
    if (heroSub) {
      heroSub.textContent = `${fmtInt(s.hiddenConsortiumHitsCount)} ДЗЗД на ${s.hiddenConsortiumOfficialsCount} лица + ${s.brandNewPoliticiansNotInSigma571} нови от XML`;
    }

    document.getElementById('deepKpiGrid').innerHTML = `
      <div class="kpi-card emphasis">
        <div class="kpi-label">Скрити ДЗЗД поръчки (без ЕИК)</div>
        <div class="kpi-val">${fmtEur(s.hiddenConsortiumTotalEur)}</div>
        <div class="kpi-sub">${fmtInt(s.hiddenConsortiumHitsCount)} обединения на ${s.hiddenConsortiumOfficialsCount} лица от СИГМА</div>
      </div>
      <div class="kpi-card emphasis">
        <div class="kpi-label">Нови лица извън СИГМА 2.0</div>
        <div class="kpi-val">${fmtInt(s.brandNewPoliticiansNotInSigma571)}</div>
        <div class="kpi-sub">${s.missedPrivateLinksCount} частни/управленски + ${s.missedPublicStockCount} акции АД</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Сканирани XML (Сметна палата)</div>
        <div class="kpi-val">${fmtInt(s.declarationsScanned)}</div>
        <div class="kpi-sub">Депутати, министри, агенции, кметове (2025–2026)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Разбити мега-консорциуми</div>
        <div class="kpi-val">${fmtInt(s.consortiaExplodedCount)}</div>
        <div class="kpi-sub">Живи партиди по Търговския регистър (ТР)</div>
      </div>`;

    renderDeepConsortia();
    renderDeepXml();
    renderMegaConsortia();
  }

  function renderDeepConsortia() {
    const d = state.deep;
    const tbody = document.getElementById('deepConsTbody');
    if (!d || !tbody) return;
    const q = state.deepConsSearch.trim().toLowerCase();
    let list = d.hiddenConsortiumLeaderboard || [];
    if (q) {
      list = list.filter((lb) =>
        lb.officialName.toLowerCase().includes(q) ||
        lb.institution.toLowerCase().includes(q) ||
        lb.companies.some((c) => c.name.toLowerCase().includes(q) || c.eik.includes(q)) ||
        lb.topConsortia.some((tc) => tc.name.toLowerCase().includes(q))
      );
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading">Няма намерени скрити консорциуми по зададения филтър.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((lb, idx) => {
        const compHtml = lb.companies
          .map((c) => `<div class="comp-item"><span class="comp-name">${esc(c.name)}</span><span class="eik-tag">ЕИК ${esc(c.eik)}</span></div>`)
          .join('');
        const consHtml = lb.topConsortia
          .slice(0, 3)
          .map((tc) => `<div class="inst-line"><strong class="mono" style="color:var(--plum);">${fmtEur(tc.wonEur)}</strong> · ${esc(tc.name.length > 105 ? tc.name.slice(0, 104) + '…' : tc.name)}</div>`)
          .join('');
        const extra = lb.hiddenConsortiumCount > 3 ? `<div class="inst-line muted">+ още ${lb.hiddenConsortiumCount - 3} консорциума (клик за профил)</div>` : '';

        return `<tr data-open-slug="${esc(lb.slug)}">
          <td class="mono muted">${idx + 1}</td>
          <td>
            <span class="official-name">${esc(lb.officialName)}</span>
            <div class="inst-line">${esc(lb.institution)} · <span class="tag tag-plum">${lb.hiddenConsortiumCount} ДЗЗД</span></div>
          </td>
          <td>${compHtml}</td>
          <td class="num muted">${fmtEur(lb.directTotalEur)}</td>
          <td class="num" style="color:var(--crimson);font-weight:700;">+${fmtEur(lb.hiddenConsortiumEur)}</td>
          <td>${consHtml}${extra}</td>
        </tr>`;
      })
      .join('');
  }

  function renderDeepXml() {
    const d = state.deep;
    const tbody = document.getElementById('deepXmlTbody');
    if (!d || !tbody) return;
    let list = (d.deepLinks || []).filter((r) => r.missedBySigma);
    if (state.deepTier === 'private') list = list.filter((r) => r.tier === 'private_link');
    else if (state.deepTier === 'stock') list = list.filter((r) => r.tier === 'public_stock');

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="loading">Няма записи в избраната категория.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map((r, idx) => {
        const newTag = !r.inSigmaPerson
          ? `<span class="tag tag-crimson">НОВО ЛИЦЕ (извън СИГМА)</span>`
          : `<span class="tag tag-plum">НОВА ВРЪЗКА</span>`;
        const typeTag = r.tier === 'private_link'
          ? `<span class="tag tag-ochre">${esc(r.linkType)}</span>`
          : `<span class="tag tag-navy">${esc(r.linkType)}${r.shareCount ? ' · ' + esc(r.shareCount) + ' бр.' : ''}</span>`;
        return `<tr style="cursor:default;">
          <td class="mono muted">${idx + 1}</td>
          <td>
            <span class="official-name">${esc(r.politician)}</span>
            <div class="inst-line">${esc(r.position)} · ${esc(r.institution)}</div>
            <div class="badges">${newTag}</div>
          </td>
          <td>
            <div class="badges" style="margin-top:0;margin-bottom:4px;">${typeTag}</div>
            <div class="inst-line" style="font-family:var(--font-mono);font-size:11px;color:var(--ink-secondary);">${esc(r.rawSnippet)}</div>
          </td>
          <td>
            <a class="comp-name" href="${esc(r.companySigmaUrl)}" target="_blank" rel="noopener">${esc(r.companyName)}</a>
            <div class="eik-tag" style="margin-left:0;">ЕИК ${esc(r.companyEik)} · ${fmtInt(r.companyContracts)} дог.</div>
          </td>
          <td class="num" style="font-weight:600;">${fmtEur(r.companyWonEur)}</td>
          <td style="white-space:nowrap;">
            <a class="btn" style="padding:4px 8px;font-size:11.5px;" href="${esc(r.declarationUrl)}" target="_blank" rel="noopener">XML (${esc(r.declarationYear)}) ↗</a>
          </td>
        </tr>`;
      })
      .join('');
  }

  function renderMegaConsortia() {
    const d = state.deep;
    const grid = document.getElementById('megaConsortiaGrid');
    if (!d || !grid) return;
    const list = d.megaConsortia || [];
    grid.innerHTML = list
      .map((con) => {
        const membersHtml = (con.members || [])
          .map((m) => {
            const crParts = [];
            if (m.managers && m.managers.length) crParts.push(`<strong>Управители / СД:</strong> ${esc(m.managers.slice(0, 3).join('; '))}`);
            if (m.owners && m.owners.length) crParts.push(`<strong>Собственик (ТР):</strong> ${esc(m.owners.slice(0, 2).join('; '))}`);
            if (m.beneficialOwners && m.beneficialOwners.length) crParts.push(`<strong>Действ. собств. (ЗМИП):</strong> ${esc(m.beneficialOwners.slice(0, 2).join('; '))}`);
            if (m.holdingParents && m.holdingParents.length) {
              m.holdingParents.forEach((hp) => {
                const hpTxt = [...(hp.owners || []), ...(hp.beneficialOwners || []), ...(hp.managers || [])].slice(0, 2).join('; ');
                if (hpTxt) crParts.push(`<strong style="color:var(--plum);">Холдинг-майка (${esc(hp.name)}):</strong> ${esc(hpTxt)}`);
              });
            }
            const eikLink = m.eik
              ? `<a href="https://sigma.midt.bg/companies/${esc(m.eik)}" target="_blank" rel="noopener" class="eik-tag">ЕИК ${esc(m.eik)} ↗</a>`
              : `<span class="eik-tag">чуждестранно / ДЗЗД</span>`;
            const ownVal = m.ownWonEur > 0 ? `<span class="mono muted" style="font-size:11px;">(${fmtEur(m.ownWonEur)} директно)</span>` : '';
            return `<li style="cursor:default;flex-direction:column;align-items:stretch;gap:2px;">
              <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span><strong>${esc(m.name)}</strong> ${eikLink}</span>
                ${ownVal}
              </div>
              ${crParts.length ? `<div style="font-size:11.5px;color:var(--ink-secondary);line-height:1.4;">${crParts.join(' · ')}</div>` : ''}
            </li>`;
          })
          .join('');

        return `<div class="cluster-card has-own" style="border-top-color:var(--plum);">
          <div class="cluster-head">
            <div>
              <div class="cluster-title" style="font-size:14px;">${esc(con.consortiumName.length > 130 ? con.consortiumName.slice(0, 129) + '…' : con.consortiumName)}</div>
              <div class="muted" style="font-size:11.5px;margin-top:3px;">${con.members.length} участника · ${con.contracts} дог.</div>
            </div>
            <div class="cluster-metrics" style="color:var(--crimson);">${fmtEur(con.wonEur)}</div>
          </div>
          <ul class="cluster-people">${membersHtml}</ul>
        </div>`;
      })
      .join('');
  }

  // ===== TAB 3: CLUSTERS & SHARED COMPANIES =====
  function renderClusters() {
    const sectors = state.circles.circleSummary || [];
    const maxPeriod = Math.max(...sectors.map((s) => s.periodEur), 1);
    document.getElementById('sectorBarsBox').innerHTML = sectors
      .map((s) => {
        const pct = Math.max(1.5, (s.periodEur / maxPeriod) * 100);
        return `
          <div class="sector-bar-row">
            <div class="sector-bar-head">
              <strong>${esc(s.circle)}</strong>
              <span class="mono muted">${s.officialCount} лица (${s.ownInstitutionHits} собств.) · <strong style="color:var(--ink);">${fmtEur(s.periodEur)}</strong></span>
            </div>
            <div class="sector-bar-track"><div class="sector-bar-fill ${s.ownInstitutionHits > 0 ? 'crimson' : ''}" style="width:${pct}%"></div></div>
          </div>`;
      })
      .join('');

    const shared = state.circles.sharedCompanies || [];
    document.getElementById('sharedCompaniesBox').innerHTML = shared.length
      ? shared
          .map(
            (sc) => `<div class="contract-row">
              <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <strong>${esc(sc.companyName)} <span class="eik-tag">ЕИК ${esc(sc.eik)}</span></strong>
                <span class="tag tag-plum">${sc.officialCount} лица · ${fmtEur(sc.maxTotalEur)}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;">
                ${sc.officials
                  .map(
                    (p) => `<button class="pill" data-open-slug="${esc(p.slug)}" style="font-size:11.5px;">${esc(p.name)} <span class="muted">(${esc(p.institution)})</span></button>`
                  )
                  .join('')}
              </div>
            </div>`
          )
          .join('')
      : '<div class="muted">Няма засечени споделени дружества.</div>';

    renderClustersGrid();
  }

  function renderClustersGrid() {
    const q = (document.getElementById('clusterSearchInput').value || '').trim().toLowerCase();
    const onlyOwn = document.getElementById('clusterOnlyOwn').checked;
    let list = state.circles.institutionalClusters || [];
    if (onlyOwn) list = list.filter((c) => c.ownInstitutionHits > 0);
    if (q) {
      list = list.filter(
        (c) =>
          c.institution.toLowerCase().includes(q) ||
          c.circle.toLowerCase().includes(q) ||
          c.officials.some((o) => o.name.toLowerCase().includes(q) || o.companies.some((cn) => cn.toLowerCase().includes(q)))
      );
    }

    document.getElementById('clustersGrid').innerHTML = list
      .slice(0, 120)
      .map(
        (c) => `
        <div class="cluster-card ${c.ownInstitutionHits > 0 ? 'has-own' : ''}">
          <div class="cluster-head">
            <div>
              <div class="cluster-title">${esc(c.institution)}</div>
              <div class="muted" style="font-size:11.5px;margin-top:2px;">${esc(c.circle)} · ${c.officialCount} лица · ${c.companyCount} фирми ${c.ownInstitutionHits > 0 ? `<span class="tag tag-crimson">${c.ownInstitutionHits} собств. инст.</span>` : ''}</div>
            </div>
            <div class="cluster-metrics">
              ${fmtEur(c.periodEur)}<br/>
              <span class="muted" style="font-size:10.5px;font-weight:400;">Общо ${fmtEur(c.totalEur)}</span>
            </div>
          </div>
          <ul class="cluster-people">
            ${c.officials
              .map(
                (p) => `<li data-open-slug="${esc(p.slug)}">
                  <span>${p.ownInstitution ? '<i class="dot" style="background:#b91c1c;margin-right:5px;"></i>' : ''}<strong>${esc(p.name)}</strong> <span class="muted">· ${esc(p.companies.slice(0, 2).join(', '))}</span></span>
                  <span class="mono" style="white-space:nowrap;">${fmtEur(p.periodEur)}</span>
                </li>`
              )
              .join('')}
          </ul>
        </div>`
      )
      .join('');
  }

  // ===== TAB 4: COMPETITION & SINGLE-OFFER =====
  function renderMonopolies() {
    const c = state.comp;
    if (!c) return;

    document.getElementById('topPairsTbody').innerHTML = (c.topPairs || [])
      .map(
        (p) => `<tr>
          <td class="mono muted">${p.rank}</td>
          <td>
            <a href="https://sigma.midt.bg/authorities/${esc(p.authoritySlug)}" target="_blank" rel="noopener">${esc(p.authorityName)}</a>
            <div style="font-size:12px;color:var(--ink-secondary);margin-top:2px;">&rarr; <a style="color:var(--ochre);font-weight:600;" href="https://sigma.midt.bg/companies/${esc(p.bidderSlug)}" target="_blank" rel="noopener">${esc(p.bidderName)}</a></div>
          </td>
          <td class="num">${fmtInt(p.contracts)}</td>
          <td class="num" style="font-weight:600;">${fmtEur(p.wonEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('concentrationTbody').innerHTML = (c.byConcentration || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a> <span class="tag tag-slate">${esc(x.typeLabel || '')}</span></td>
          <td class="num" style="color:var(--crimson);font-weight:600;">${Number(x.hhi || 0).toFixed(2)}</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('singleOfferTbody').innerHTML = (c.bySingleOffer || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a></td>
          <td class="num" style="color:var(--ochre);font-weight:600;">${((x.singleOfferShare || 0) * 100).toFixed(1)}%</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('directAwardTbody').innerHTML = (c.byDirectAward || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a></td>
          <td class="num" style="color:var(--plum);font-weight:600;">${((x.nonCompetitiveShare || 0) * 100).toFixed(1)}%</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');
  }

  // ===== TAB 2: INTERACTIVE NETWORK GRAPH =====
  function populateGraphInstDropdown() {
    const sel = document.getElementById('graphInstSelect');
    const clusters = (state.circles.institutionalClusters || []).filter((c) => c.officialCount >= 2 || c.ownInstitutionHits > 0);
    sel.innerHTML =
      `<option value="">Всички институции (${clusters.length})</option>` +
      clusters
        .map((c) => `<option value="${esc(c.institution)}">${esc(c.institution)} (${c.officialCount} лица · ${fmtEur(c.periodEur)})</option>`)
        .join('');
  }

  function buildGraphData(preset, specificInst = '') {
    let subset = [];
    if (specificInst) {
      subset = state.officials.filter((o) =>
        o.primaryInstitution === specificInst ||
        o.institutions.some((i) => i.institution.toLowerCase().includes(specificInst.replace(/^Община \/ ОбС /i, '').toLowerCase()))
      );
    } else if (preset === 'own') {
      subset = state.officials.filter((o) => o.ownInstitution);
    } else if (preset === 'parliament') {
      subset = state.officials.filter((o) => o.circle.includes('Народно събрание'));
    } else if (preset === 'central') {
      subset = state.officials.filter((o) => o.circle.includes('Служби') || o.circle.includes('Централна власт'));
    } else if (preset === 'shared') {
      subset = state.officials.filter((o) => o.companies.some((c) => state.sharedEiks.has(c.eik)));
    } else if (preset === 'registry') {
      subset = state.officials.filter((o) => o.hasRegistryRole || o.omissionsCount > 0);
    } else if (preset === 'burgas') {
      subset = state.officials.filter((o) => o.isBurgas);
    } else {
      subset = [...state.officials].sort((a, b) => b.periodEur - a.periodEur).slice(0, 35);
    }

    subset = [...subset].sort((a, b) => b.periodEur - a.periodEur || b.totalEur - a.totalEur).slice(0, 60);

    const nodesMap = new Map();
    const edges = [];

    const addNode = (id, label, type, meta = {}) => {
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          label,
          type,
          meta,
          x: 0, y: 0, vx: 0, vy: 0, degree: 0,
          radius: type === 'inst' ? 13 : type === 'official' ? (meta.ownInstitution ? 11.5 : 9) : type === 'company' ? 8 : 6.5,
        });
      }
      return nodesMap.get(id);
    };

    const addEdge = (a, b, kind) => {
      edges.push({ source: a, target: b, kind });
      nodesMap.get(a).degree++;
      nodesMap.get(b).degree++;
    };

    subset.forEach((o) => {
      const oId = `o:${o.slug}`;
      addNode(oId, o.name, 'official', o);
      const iId = `i:${o.primaryInstitution}`;
      addNode(iId, o.primaryInstitution, 'inst', { name: o.primaryInstitution, circle: o.circle });
      addEdge(iId, oId, o.ownInstitution ? 'own' : 'office');

      o.companies.forEach((c) => {
        const cId = `c:${c.eik || c.name}`;
        addNode(cId, c.name, 'company', { eik: c.eik, name: c.name, roles: c.roles });
        addEdge(oId, cId, c.registry ? 'registry' : 'company');
        if (o.ownInstitution) addEdge(cId, iId, 'loop');
      });

      (o.relatives || []).slice(0, 2).forEach((rel) => {
        const rId = `r:${rel.name}`;
        addNode(rId, rel.name, 'relative', rel);
        addEdge(oId, rId, 'relative');
      });
    });

    const nodes = Array.from(nodesMap.values());
    const canvas = document.getElementById('networkCanvas');
    const w = canvas.clientWidth || 900;
    const h = canvas.clientHeight || 680;
    const cx = w / 2;
    const cy = h / 2;

    nodes.forEach((n, idx) => {
      const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
      const ring = n.type === 'inst' ? 105 : n.type === 'official' ? 205 : n.type === 'company' ? 295 : 340;
      n.x = cx + Math.cos(angle) * ring + (Math.random() - 0.5) * 28;
      n.y = cy + Math.sin(angle) * ring + (Math.random() - 0.5) * 28;
    });

    state.graph.nodes = nodes;
    state.graph.edges = edges;
    state.graph.panX = 0; state.graph.panY = 0; state.graph.scale = 0.92;
    state.graph.simSteps = 220; state.graph.hovered = null;

    const sumPeriod = subset.reduce((acc, o) => acc + o.periodEur, 0);
    document.getElementById('graphStatsBox').innerHTML = `
      <strong>${subset.length} длъжностни лица</strong> · <strong>${nodes.filter((n) => n.type === 'company').length} дружества</strong> · <strong>${nodes.filter((n) => n.type === 'inst').length} институции</strong><br/>
      <span class="muted">Стойност в периода:</span> <strong class="mono">${fmtEur(sumPeriod)}</strong>`;

    document.getElementById('graphNodeList').innerHTML = subset
      .map(
        (o) => `<li data-open-slug="${esc(o.slug)}">
          <span>${o.ownInstitution ? '<i class="dot" style="background:#b91c1c;margin-right:5px;"></i>' : ''}${esc(o.name)}</span>
          <span class="mono muted" style="font-size:11px;">${fmtEur(o.periodEur)}</span>
        </li>`
      )
      .join('');

    startGraphLoop();
  }

  function startGraphLoop() {
    if (state.graph.raf) cancelAnimationFrame(state.graph.raf);
    const canvas = document.getElementById('networkCanvas');
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr))) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      return { w: rect.width || 900, h: rect.height || 680, dpr };
    };

    const tick = () => {
      const { w, h, dpr } = resize();
      const { nodes, edges } = state.graph;
      const nodeById = new Map(nodes.map((n) => [n.id, n]));

      if (state.graph.simSteps > 0 || state.graph.dragging) {
        if (state.graph.simSteps > 0) state.graph.simSteps--;
        const cx = w / 2;
        const cy = h / 2;

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy + 1;
            const force = 2600 / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * force;
            const fy = (dy / d) * force;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
          }
          a.vx += (cx - a.x) * 0.008;
          a.vy += (cy - a.y) * 0.008;
        }

        for (const e of edges) {
          const a = nodeById.get(e.source);
          const b = nodeById.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetLen = e.kind === 'loop' ? 92 : 76;
          const f = (d - targetLen) * 0.045;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        for (const n of nodes) {
          if (state.graph.dragging === n) { n.vx = 0; n.vy = 0; continue; }
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += n.vx; n.y += n.vy;
        }
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + state.graph.panX, h / 2 + state.graph.panY);
      ctx.scale(state.graph.scale, state.graph.scale);
      ctx.translate(-w / 2, -h / 2);

      const hov = state.graph.hovered;
      const activeSet = new Set();
      if (hov) {
        activeSet.add(hov.id);
        edges.forEach((e) => {
          if (e.source === hov.id) activeSet.add(e.target);
          if (e.target === hov.id) activeSet.add(e.source);
        });
      }

      for (const e of edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const isLit = !hov || (activeSet.has(a.id) && activeSet.has(b.id));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (e.kind === 'loop' || e.kind === 'own') {
          ctx.strokeStyle = isLit ? 'rgba(185, 28, 28, 0.55)' : 'rgba(185, 28, 28, 0.07)';
          ctx.lineWidth = e.kind === 'loop' ? 1.8 : 1.3;
        } else if (e.kind === 'registry') {
          ctx.strokeStyle = isLit ? 'rgba(107, 33, 168, 0.5)' : 'rgba(107, 33, 168, 0.07)';
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = isLit ? 'rgba(71, 85, 105, 0.3)' : 'rgba(71, 85, 105, 0.06)';
          ctx.lineWidth = 0.9;
        }
        ctx.stroke();
      }

      for (const n of nodes) {
        const isLit = !hov || activeSet.has(n.id);
        let fill = '#1e3a8a';
        if (n.type === 'official') fill = n.meta.ownInstitution ? '#b91c1c' : '#e11d48';
        else if (n.type === 'company') fill = '#b45309';
        else if (n.type === 'relative') fill = '#6b21a8';

        ctx.globalAlpha = isLit ? 1 : 0.14;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = hov === n ? 2.5 : 1.5;
        ctx.strokeStyle = hov === n ? '#131720' : '#ffffff';
        ctx.stroke();

        if (hov === n || (hov && activeSet.has(n.id)) || n.type === 'inst' || n.degree >= 3 || nodes.length <= 42) {
          ctx.font = `${n.type === 'inst' || hov === n ? '600' : '400'} 10.5px "IBM Plex Sans", sans-serif`;
          const shortLbl = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(252, 251, 248, 0.9)';
          ctx.strokeText(shortLbl, n.x + n.radius + 4, n.y + 3.5);
          ctx.fillStyle = isLit ? '#131720' : 'rgba(19, 23, 32, 0.25)';
          ctx.fillText(shortLbl, n.x + n.radius + 4, n.y + 3.5);
        }
      }
      ctx.restore();
      state.graph.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function screenToWorld(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - rect.width / 2 - state.graph.panX) / state.graph.scale + rect.width / 2,
      y: (clientY - rect.top - rect.height / 2 - state.graph.panY) / state.graph.scale + rect.height / 2,
    };
  }

  function findNodeAt(x, y) {
    for (let i = state.graph.nodes.length - 1; i >= 0; i--) {
      const n = state.graph.nodes[i];
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= (n.radius + 5) * (n.radius + 5)) return n;
    }
    return null;
  }

  function updateGraphTooltip(n) {
    const tip = document.getElementById('graphTooltip');
    if (!n) return;
    if (n.type === 'official') {
      const o = n.meta;
      tip.innerHTML = `
        <strong style="color:var(--crimson);">${esc(o.name)}</strong><br/>
        <span class="muted">${esc(o.primaryInstitution)}</span><br/>
        В периода: <strong class="mono">${fmtEur(o.periodEur)}</strong> · Общо: <span class="mono">${fmtEur(o.totalEur)}</span><br/>
        <button class="btn" style="margin-top:7px;padding:4px 8px;font-size:11.5px;" data-open-slug="${esc(o.slug)}">Отвори профила &rarr;</button>`;
    } else if (n.type === 'company') {
      tip.innerHTML = `
        <strong style="color:var(--ochre);">${esc(n.label)}</strong><br/>
        <span class="mono muted">ЕИК ${esc(n.meta.eik)}</span><br/>
        <a href="https://sigma.midt.bg/companies/${esc(n.meta.eik)}" target="_blank" rel="noopener">Отвори дружеството в СИГМА 2.0 ↗</a>`;
    } else if (n.type === 'inst') {
      tip.innerHTML = `<strong style="color:var(--navy-dark);">${esc(n.label)}</strong><br/><span class="muted">${esc(n.meta.circle || '')} · ${n.degree} връзки в среза</span>`;
    } else {
      tip.innerHTML = `<strong style="color:var(--plum);">${esc(n.label)}</strong><br/><span class="muted">Свързано лице (Търговски регистър)</span>`;
    }
  }

  function setupEvents() {
    // Hero Search & Quick Cities & Funnel
    const runHeroSearch = () => {
      const val = document.getElementById('heroSearchInput').value.trim();
      jumpToDirectory({ filter: 'all', search: val });
    };
    document.getElementById('heroSearchBtn').addEventListener('click', runHeroSearch);
    document.getElementById('heroSearchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runHeroSearch();
    });
    document.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quick;
        if (q === 'Народно събрание') jumpToDirectory({ filter: 'parliament', search: '' });
        else if (q === 'ДАНС') jumpToDirectory({ filter: 'security', search: '' });
        else {
          document.getElementById('heroSearchInput').value = q;
          jumpToDirectory({ filter: 'all', search: q });
        }
      });
    });
    document.querySelectorAll('[data-jump-filter]').forEach((el) => {
      el.addEventListener('click', () => jumpToDirectory({ filter: el.dataset.jumpFilter, search: '' }));
    });
    document.querySelectorAll('[data-jump-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        switchTab(el.dataset.jumpTab);
        document.getElementById('mainTabs').scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Click on chart bars / donut slices to filter directory
    document.body.addEventListener('click', (e) => {
      const chartFilterEl = e.target.closest('[data-chart-filter]');
      if (chartFilterEl) {
        jumpToDirectory({ filter: chartFilterEl.dataset.chartFilter, search: '' });
        return;
      }
      const slugEl = e.target.closest('[data-open-slug]');
      if (slugEl) openDossier(slugEl.dataset.openSlug);
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 1;
      renderDirectory();
    });
    document.getElementById('sortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      renderDirectory();
    });
    document.getElementById('scopeSelect').addEventListener('change', (e) => {
      state.scope = e.target.value;
      state.page = 1;
      renderFilterPills();
      renderDirectory();
    });
    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
      state.pageSize = Number(e.target.value);
      state.page = 1;
      renderDirectory();
    });
    document.getElementById('filterPills').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      state.page = 1;
      renderFilterPills();
      renderDirectory();
    });

    document.getElementById('officialsTbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-slug]');
      if (tr) openDossier(tr.dataset.slug);
    });

    document.getElementById('drawerClose').onclick = closeDossier;
    document.getElementById('drawerBackdrop').onclick = closeDossier;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('dossierDrawer').classList.contains('open')) closeDossier();
        else closeHallOfFame();
      }
    });

    const hofOpenBtn = document.getElementById('hofOpenBtn');
    const hofCloseBtn = document.getElementById('hofCloseBtn');
    const hofModalBackdrop = document.getElementById('hofModalBackdrop');
    if (hofOpenBtn) hofOpenBtn.addEventListener('click', openHallOfFame);
    if (hofCloseBtn) hofCloseBtn.addEventListener('click', closeHallOfFame);
    if (hofModalBackdrop) {
      hofModalBackdrop.addEventListener('click', (e) => {
        if (e.target === hofModalBackdrop) closeHallOfFame();
      });
    }

    document.getElementById('clusterSearchInput').addEventListener('input', renderClustersGrid);
    document.getElementById('clusterOnlyOwn').addEventListener('change', renderClustersGrid);

    const hofControls = document.getElementById('hofControls');
    if (hofControls) {
      hofControls.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-hof-mode]');
        if (!btn) return;
        state.hofMode = btn.dataset.hofMode;
        hofControls.querySelectorAll('.hof-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderHallOfFamePyramid();
      });
    }

    const deepConsInput = document.getElementById('deepConsSearch');
    if (deepConsInput) {
      deepConsInput.addEventListener('input', (e) => {
        state.deepConsSearch = e.target.value;
        renderDeepConsortia();
      });
    }
    const deepTierPills = document.getElementById('deepTierPills');
    if (deepTierPills) {
      deepTierPills.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-deep-tier]');
        if (!btn) return;
        state.deepTier = btn.dataset.deepTier;
        deepTierPills.querySelectorAll('.pill').forEach((p) => p.classList.toggle('active', p === btn));
        renderDeepXml();
      });
    }

    document.getElementById('graphPresetSelect').addEventListener('change', (e) => {
      document.getElementById('graphInstSelect').value = '';
      buildGraphData(e.target.value, '');
    });
    document.getElementById('graphInstSelect').addEventListener('change', (e) => {
      if (e.target.value) buildGraphData('', e.target.value);
      else buildGraphData(document.getElementById('graphPresetSelect').value, '');
    });
    document.getElementById('btnRelayout').addEventListener('click', () => { state.graph.simSteps = 220; });
    document.getElementById('btnResetZoom').addEventListener('click', () => {
      state.graph.panX = 0; state.graph.panY = 0; state.graph.scale = 0.92;
    });

    const canvas = document.getElementById('networkCanvas');
    canvas.addEventListener('mousedown', (e) => {
      const p = screenToWorld(canvas, e.clientX, e.clientY);
      const hit = findNodeAt(p.x, p.y);
      if (hit) {
        state.graph.dragging = hit;
        state.graph.simSteps = Math.max(state.graph.simSteps, 60);
      } else {
        state.graph.panning = true;
        state.graph.lastX = e.clientX;
        state.graph.lastY = e.clientY;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (state.graph.dragging) {
        const p = screenToWorld(canvas, e.clientX, e.clientY);
        state.graph.dragging.x = p.x;
        state.graph.dragging.y = p.y;
      } else if (state.graph.panning) {
        state.graph.panX += e.clientX - state.graph.lastX;
        state.graph.panY += e.clientY - state.graph.lastY;
        state.graph.lastX = e.clientX;
        state.graph.lastY = e.clientY;
      } else if (e.target === canvas) {
        const p = screenToWorld(canvas, e.clientX, e.clientY);
        const hit = findNodeAt(p.x, p.y);
        state.graph.hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (hit) updateGraphTooltip(hit);
      }
    });
    window.addEventListener('mouseup', () => { state.graph.dragging = null; state.graph.panning = false; });
    canvas.addEventListener('click', (e) => {
      const p = screenToWorld(canvas, e.clientX, e.clientY);
      const hit = findNodeAt(p.x, p.y);
      if (hit) {
        updateGraphTooltip(hit);
        if (hit.type === 'official') openDossier(hit.meta.slug);
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      state.graph.scale = Math.max(0.28, Math.min(3.5, state.graph.scale * factor));
    }, { passive: false });
  }

  init();
})();
