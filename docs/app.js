(() => {
  'use strict';

  const state = {
    meta: null,
    officials: [],
    bySlug: new Map(),
    circles: null,
    comp: null,
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
      selected: null,
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

  async function init() {
    try {
      const [offRes, cirRes, compRes] = await Promise.all([
        fetch('data/officials_all.json'),
        fetch('data/circles_graph.json'),
        fetch('data/competition_stats.json'),
      ]);
      const offJson = await offRes.json();
      const cirJson = await cirRes.json();
      const compJson = await compRes.json();

      state.meta = offJson.meta;
      state.officials = offJson.officials || [];
      state.officials.forEach((o) => state.bySlug.set(o.slug, o));
      state.circles = cirJson;
      state.comp = compJson;
      (cirJson.sharedCompanies || []).forEach((sc) => state.sharedEiks.add(sc.eik));

      renderHeaderAndKPIs();
      renderFilterPills();
      renderDirectory();
      renderClusters();
      renderMonopolies();
      populateGraphInstDropdown();
      setupEvents();
    } catch (err) {
      console.error(err);
      document.getElementById('officialsTbody').innerHTML =
        `<tr><td colspan="8" class="loading" style="color:#f87171;">Грешка при зареждане на данните: ${esc(err.message)}</td></tr>`;
    }
  }

  function renderHeaderAndKPIs() {
    const m = state.meta;
    const nat = m.nationalTotals || {};
    document.getElementById('syncSubtitle').textContent =
      `Източник: sigma.midt.bg (СС-BY 4.0) · Обновено: ${m.refreshedAt} · Всички ${m.totalOfficialsAllRoles} лица без пропуск`;
    document.getElementById('asOfChip').textContent = `Данни към: ${m.asOf}`;

    const kpis = [
      {
        cls: 'danger',
        label: 'Всички свързани лица',
        val: `${fmtInt(m.totalOfficialsAllRoles)}`,
        sub: `${fmtInt(m.totalOfficialsCore512)} собств./упр. + ${m.totalOfficialsAllRoles - m.totalOfficialsCore512} в съвети`,
      },
      {
        cls: 'danger',
        label: 'От собствената институция',
        val: `${fmtInt(m.ownInstitutionHits)}`,
        sub: 'Директно съвпадение институция ↔ фирма',
      },
      {
        cls: 'amber',
        label: 'Стойност в мандата / периода',
        val: fmtEur(m.totalPeriodEur),
        sub: `Общо за фирмите им: ${fmtEur(m.totalAllContractsEur)}`,
      },
      {
        cls: 'cyan',
        label: 'Депутати (Народно събрание)',
        val: `${fmtInt(m.mpCount)}`,
        sub: `Роли по ТР: ${m.registryRoleHits} · Свързани/роднини: ${m.familyStakeHits}`,
      },
      {
        cls: 'purple',
        label: 'Споделени фирми (2+ лица)',
        val: `${fmtInt(m.sharedCompaniesCount)}`,
        sub: `${fmtInt((state.circles.institutionalClusters || []).length)} институционални кръга`,
      },
      {
        cls: 'amber',
        label: 'Национално с 1 оферта',
        val: `${((nat.singleOfferValueShare || 0.407) * 100).toFixed(1)}%`,
        sub: `${fmtEur(nat.singleOfferValueEur || 18.5e9)} (${fmtInt(nat.singleOffer || 83930)} договора)`,
      },
    ];

    document.getElementById('kpiGrid').innerHTML = kpis
      .map(
        (k) => `
      <div class="kpi-card ${k.cls}">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-val">${k.val}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>`
      )
      .join('');
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
      { key: 'all', label: 'Всички' },
      { key: 'own', label: '🔥 От собствената институция' },
      { key: 'parliament', label: '🏛️ Народно събрание' },
      { key: 'security', label: '🛡️ ДАНС, ДАТО, МВР' },
      { key: 'central', label: '🏢 Министерства, Агенции и Области' },
      { key: 'municipal', label: '🏙️ Кметове и Общински съвети' },
      { key: 'health', label: '🏥 Болници' },
      { key: 'state_co', label: '⚙️ Държавни/Общ. дружества' },
      { key: 'registry', label: '⚠️ ТР роли / Пропуски' },
      { key: 'family', label: '👨‍👩‍👧 Роднински / Свързани дялове' },
      { key: 'shared', label: '🔗 Споделени фирми' },
      { key: 'burgas', label: '📍 Бургас & Черноморие' },
    ];
    const html = defs
      .map((d) => {
        const cnt = base.filter((o) => matchCategory(o, d.key)).length;
        return `<button class="pill ${state.filter === d.key ? 'active' : ''}" data-filter="${d.key}">${d.label}<span class="cnt">${cnt}</span></button>`;
      })
      .join('');
    document.getElementById('filterPills').innerHTML = html;
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
      if (s === 'risk') return b.riskScore - a.riskScore || b.periodEur - a.periodEur;
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
      tbody.innerHTML = `<tr><td colspan="8" class="loading">Няма намерени лица по зададените филтри.</td></tr>`;
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
              const sharedTag = state.sharedEiks.has(c.eik) ? `<span class="chip chip-purple" style="margin-left:4px;">споделена</span>` : '';
              return `<div class="comp-item"><span class="comp-name">${esc(c.name)}</span><span class="eik-tag">${esc(c.eik)}</span>${sharedTag}</div>`;
            })
            .join('');
          const relHtml =
            o.relatives && o.relatives.length
              ? `<div class="inst-line" style="color:#d8b4fe;">Свързани (ТР): ${o.relatives.map((r) => esc(r.name)).join(', ')}</div>`
              : '';

          const badges = [];
          if (o.ownInstitution) badges.push(`<span class="chip chip-red">ОТ СОБСТВЕНАТА ИНСТ.</span>`);
          if (o.hasContemporaneous) badges.push(`<span class="chip chip-amber">В МАНДАТА</span>`);
          if (o.hasRegistryRole) badges.push(`<span class="chip chip-purple">ТР РОЛЯ</span>`);
          if (o.hasFamilyStake) badges.push(`<span class="chip chip-cyan">СВЪРЗАНО ЛИЦЕ</span>`);
          if (o.boardOnly) badges.push(`<span class="chip chip-gray">ЧЛЕН НА СЪВЕТ</span>`);

          const riskColor = o.riskScore >= 70 ? '#ef4444' : o.riskScore >= 40 ? '#f59e0b' : '#06b6d4';

          return `
            <tr data-slug="${esc(o.slug)}">
              <td class="mono muted">${start + idx + 1}</td>
              <td>
                <span class="official-name">${esc(o.name)}</span>
                ${instLines}
              </td>
              <td>${compHtml}${relHtml}</td>
              <td>
                <div style="font-size:11.5px;color:#93a3bd;">${esc(o.circle)}</div>
                <div class="badges">${badges.join('')}</div>
              </td>
              <td class="num" style="color:#fbbf24;font-weight:700;">${fmtEur(o.periodEur)}</td>
              <td class="num">${fmtEur(o.totalEur)}</td>
              <td class="num">${fmtInt(o.contractCount)}</td>
              <td class="num">
                <div class="risk-bar-wrap">
                  <div class="risk-bar"><i style="width:${o.riskScore}%;background:${riskColor};"></i></div>
                  <span style="color:${riskColor};font-weight:700;">${o.riskScore}</span>
                </div>
              </td>
            </tr>`;
        })
        .join('');
    }

    document.getElementById('pagerBar').innerHTML = `
      <div class="muted">Показани <strong>${slice.length}</strong> от <strong>${total}</strong> лица (Страница ${state.page} / ${totalPages})</div>
      <div style="display:flex;gap:6px;">
        <button class="btn" id="pgPrev" ${state.page <= 1 ? 'disabled' : ''}>← Предишна</button>
        <button class="btn" id="pgNext" ${state.page >= totalPages ? 'disabled' : ''}>Следваща →</button>
      </div>`;

    const prev = document.getElementById('pgPrev');
    const next = document.getElementById('pgNext');
    if (prev) prev.onclick = () => { if (state.page > 1) { state.page--; renderDirectory(); window.scrollTo({ top: 180, behavior: 'smooth' }); } };
    if (next) next.onclick = () => { if (state.page < totalPages) { state.page++; renderDirectory(); window.scrollTo({ top: 180, behavior: 'smooth' }); } };
  }

  // ===== SLIDE-OVER DOSSIER DRAWER =====
  function openDossier(slug) {
    const o = state.bySlug.get(slug);
    if (!o) return;
    document.getElementById('drawerCircle').textContent = `${o.circle} · Риск индекс ${o.riskScore}/100`;
    document.getElementById('drawerName').textContent = o.name;

    const badges = [];
    if (o.ownInstitution) badges.push(`<span class="chip chip-red">🔥 ОТ СОБСТВЕНАТА ИНСТИТУЦИЯ</span>`);
    if (o.hasContemporaneous) badges.push(`<span class="chip chip-amber">В ДЕКЛАРИРАНИЯ ПЕРИОД</span>`);
    if (o.hasRegistryRole) badges.push(`<span class="chip chip-purple">РОЛЯ ПО ТЪРГОВСКИЯ РЕГИСТЪР</span>`);
    if (o.hasFamilyStake) badges.push(`<span class="chip chip-cyan">ДЯЛ НА СВЪРЗАНО ЛИЦЕ</span>`);
    badges.push(`<a class="chip chip-gray" href="${esc(o.sigmaUrl)}" target="_blank" rel="noopener">↗ Профил в СИГМА 2.0</a>`);
    document.getElementById('drawerBadges').innerHTML = badges.join('');

    const instHtml = o.institutions
      .map(
        (i) => `<div class="contract-row">
          <strong>${esc(i.institution)}</strong><br/>
          <span class="muted">${esc(i.positions.join('; '))} · Години: ${esc(i.years.join(', '))}</span>
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
          <div class="muted" style="margin-top:3px;">Роли: ${esc(c.roles.join(', '))}${c.missingYears && c.missingYears.length ? ` · Недекларирани години: <strong style="color:#f87171;">${esc(c.missingYears.join(', '))}</strong>` : ''}</div>
        </div>`
      )
      .join('');

    const relHtml =
      o.relatives && o.relatives.length
        ? `<div class="drawer-section">
            <h4>Вписани свързани лица / роднини (Търговски регистър)</h4>
            ${o.relatives.map((r) => `<div class="contract-row"><strong style="color:#d8b4fe;">${esc(r.name)}</strong> <span class="muted">(${esc(r.role)})</span></div>`).join('')}
          </div>`
        : '';

    const authHtml =
      o.byAuthority && o.byAuthority.length
        ? o.byAuthority
            .map(
              (a) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(35,47,68,0.5);font-size:12.5px;">
                <a href="https://sigma.midt.bg/authorities/${esc(a.id)}" target="_blank" rel="noopener">${esc(a.name)}</a>
                <span class="mono" style="white-space:nowrap;color:#fbbf24;">${fmtEur(a.valueEur)} (${a.contracts})</span>
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
                  <span class="mono" style="color:#fbbf24;font-weight:700;">${fmtEur(ct.valueEur)}</span>
                  <span class="mono muted">${esc(ct.signedAt)} ${ct.duringOffice ? '<span class="chip chip-amber">в мандата</span>' : ''}</span>
                </div>
                <div style="margin-bottom:4px;"><a href="https://sigma.midt.bg/contracts/${encodeURIComponent(ct.id)}" target="_blank" rel="noopener">${esc(ct.subject)}</a></div>
                <div class="muted" style="font-size:11.5px;">Възложител: <strong>${esc(ct.authority)}</strong> → Изпълнител: ${esc(ct.company)}</div>
              </div>`
            )
            .join('')
        : '<div class="muted">Вижте пълния списък в профила в СИГМА 2.0.</div>';

    const declsHtml =
      o.declarations && o.declarations.length
        ? o.declarations
            .map(
              (d) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid rgba(35,47,68,0.4);">
                <span><strong>${esc(d.year)}</strong> (${esc(d.type)}) · ${esc(d.institution)}</span>
                ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" class="mono">XML Сметна палата ↗</a>` : ''}
              </div>`
            )
            .join('')
        : '<div class="muted">Няма индексирани XML препратки.</div>';

    document.getElementById('drawerBody').innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px;">
        <div class="kpi-card amber"><div class="kpi-label">В периода</div><div class="kpi-val" style="font-size:17px;">${fmtEur(o.periodEur)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Общо фирми</div><div class="kpi-val" style="font-size:17px;">${fmtEur(o.totalEur)}</div></div>
        <div class="kpi-card cyan"><div class="kpi-label">Договори</div><div class="kpi-val" style="font-size:17px;">${fmtInt(o.contractCount)}</div></div>
      </div>

      <div class="drawer-section"><h4>Публични длъжности (Сметна палата / КПКОНПИ)</h4>${instHtml}</div>
      <div class="drawer-section"><h4>Свързани компании (${o.companies.length})</h4>${compHtml}</div>
      ${relHtml}
      <div class="drawer-section"><h4>Топ институции възложители (Общо ${o.byAuthorityTotal})</h4>${authHtml}</div>
      <div class="drawer-section"><h4>Най-големи договори (Топ ${o.topContracts.length})</h4>${contractsHtml}</div>
      <div class="drawer-section" style="border-bottom:none;"><h4>Официални декларации (register.cacbg.bg)</h4>${declsHtml}</div>
    `;

    document.getElementById('drawerBackdrop').classList.add('open');
    document.getElementById('dossierDrawer').classList.add('open');
  }

  function closeDossier() {
    document.getElementById('drawerBackdrop').classList.remove('open');
    document.getElementById('dossierDrawer').classList.remove('open');
  }

  // ===== TAB 3: CLUSTERS & SHARED COMPANIES =====
  function renderClusters() {
    const sectors = state.circles.circleSummary || [];
    const maxPeriod = Math.max(...sectors.map((s) => s.periodEur), 1);
    document.getElementById('sectorBarsBox').innerHTML = sectors
      .map((s) => {
        const pct = Math.max(2, (s.periodEur / maxPeriod) * 100);
        return `
          <div class="sector-bar-row">
            <div class="sector-bar-head">
              <strong>${esc(s.circle)}</strong>
              <span class="mono muted">${s.officialCount} лица (${s.ownInstitutionHits} собств.) · <strong style="color:#fbbf24;">${fmtEur(s.periodEur)}</strong></span>
            </div>
            <div class="sector-bar-track"><div class="sector-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
      })
      .join('');

    const shared = state.circles.sharedCompanies || [];
    document.getElementById('sharedCompaniesBox').innerHTML = shared.length
      ? shared
          .map(
            (sc) => `<div class="contract-row">
              <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
                <strong style="color:#fde68a;">${esc(sc.companyName)} <span class="eik-tag">${esc(sc.eik)}</span></strong>
                <span class="chip chip-purple">${sc.officialCount} длъжн. лица · ${fmtEur(sc.maxTotalEur)}</span>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${sc.officials
                  .map(
                    (p) => `<button class="pill" data-open-slug="${esc(p.slug)}" style="font-size:11.5px;">${esc(p.name)} <span class="muted">(${esc(p.institution)})</span></button>`
                  )
                  .join('')}
              </div>
            </div>`
          )
          .join('')
      : '<div class="muted">Няма споделени фирми.</div>';

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
              <div class="muted" style="font-size:11.5px;">${esc(c.circle)} · ${c.officialCount} лица · ${c.companyCount} фирми ${c.ownInstitutionHits > 0 ? `<span class="chip chip-red">${c.ownInstitutionHits} собств.</span>` : ''}</div>
            </div>
            <div class="cluster-metrics">
              ${fmtEur(c.periodEur)}<br/>
              <span class="muted" style="font-size:10.5px;">Общо ${fmtEur(c.totalEur)}</span>
            </div>
          </div>
          <ul class="cluster-people">
            ${c.officials
              .map(
                (p) => `<li data-open-slug="${esc(p.slug)}">
                  <span>${p.ownInstitution ? '🔥 ' : ''}<strong>${esc(p.name)}</strong> <span class="muted">→ ${esc(p.companies.slice(0, 2).join(', '))}</span></span>
                  <span class="mono" style="color:#fbbf24;">${fmtEur(p.periodEur)}</span>
                </li>`
              )
              .join('')}
          </ul>
        </div>`
      )
      .join('');
  }

  // ===== TAB 4: MONOPOLIES & SINGLE-OFFER =====
  function renderMonopolies() {
    const c = state.comp;
    if (!c) return;

    document.getElementById('topPairsTbody').innerHTML = (c.topPairs || [])
      .map(
        (p) => `<tr>
          <td class="mono muted">${p.rank}</td>
          <td>
            <a href="https://sigma.midt.bg/authorities/${esc(p.authoritySlug)}" target="_blank" rel="noopener">${esc(p.authorityName)}</a>
            <div style="color:#fde68a;font-size:12px;">→ <a style="color:#fde68a;" href="https://sigma.midt.bg/companies/${esc(p.bidderSlug)}" target="_blank" rel="noopener">${esc(p.bidderName)}</a></div>
          </td>
          <td class="num">${fmtInt(p.contracts)}</td>
          <td class="num" style="color:#fbbf24;">${fmtEur(p.wonEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('concentrationTbody').innerHTML = (c.byConcentration || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a> <span class="chip chip-gray">${esc(x.typeLabel || '')}</span></td>
          <td class="num" style="color:#f87171;font-weight:700;">${Number(x.hhi || 0).toFixed(2)}</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('singleOfferTbody').innerHTML = (c.bySingleOffer || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a></td>
          <td class="num" style="color:#fbbf24;font-weight:700;">${((x.singleOfferShare || 0) * 100).toFixed(1)}%</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');

    document.getElementById('directAwardTbody').innerHTML = (c.byDirectAward || [])
      .map(
        (x, i) => `<tr>
          <td class="mono muted">${i + 1}</td>
          <td><a href="https://sigma.midt.bg/authorities/${esc(x.slug)}" target="_blank" rel="noopener">${esc(x.name)}</a></td>
          <td class="num" style="color:#c084fc;font-weight:700;">${((x.nonCompetitiveShare || 0) * 100).toFixed(1)}%</td>
          <td class="num">${fmtEur(x.valueEur)}</td>
        </tr>`
      )
      .join('');
  }

  // ===== TAB 2: INTERACTIVE FORCE-DIRECTED NETWORK GRAPH =====
  function populateGraphInstDropdown() {
    const sel = document.getElementById('graphInstSelect');
    const clusters = (state.circles.institutionalClusters || []).filter((c) => c.officialCount >= 2 || c.ownInstitutionHits > 0);
    sel.innerHTML =
      `<option value="">— Избери конкретна институция (${clusters.length}) —</option>` +
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

    // Cap to top 65 officials for ultra-crisp interactive visual readability
    subset = [...subset].sort((a, b) => b.periodEur - a.periodEur || b.totalEur - a.totalEur).slice(0, 65);

    const nodesMap = new Map();
    const edges = [];

    const addNode = (id, label, type, meta = {}) => {
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          label,
          type,
          meta,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          degree: 0,
          radius: type === 'inst' ? 14 : type === 'official' ? (meta.ownInstitution ? 13 : 10) : type === 'company' ? 9 : 7,
        });
      }
      return nodesMap.get(id);
    };

    const addEdge = (a, b, kind, weight = 1) => {
      edges.push({ source: a, target: b, kind, weight });
      nodesMap.get(a).degree++;
      nodesMap.get(b).degree++;
    };

    subset.forEach((o) => {
      const oId = `o:${o.slug}`;
      addNode(oId, o.name, 'official', o);

      const iId = `i:${o.primaryInstitution}`;
      addNode(iId, o.primaryInstitution, 'inst', { name: o.primaryInstitution, circle: o.circle });
      addEdge(iId, oId, o.ownInstitution ? 'own' : 'office', o.ownInstitution ? 2.2 : 1);

      o.companies.forEach((c) => {
        const cId = `c:${c.eik || c.name}`;
        addNode(cId, c.name, 'company', { eik: c.eik, name: c.name, roles: c.roles });
        addEdge(oId, cId, c.registry ? 'registry' : 'company', 1.4);
        if (o.ownInstitution) {
          addEdge(cId, iId, 'loop', 2.0);
        }
      });

      (o.relatives || []).slice(0, 2).forEach((rel) => {
        const rId = `r:${rel.name}`;
        addNode(rId, rel.name, 'relative', rel);
        addEdge(oId, rId, 'relative', 1);
      });
    });

    const nodes = Array.from(nodesMap.values());
    const canvas = document.getElementById('networkCanvas');
    const w = canvas.clientWidth || 900;
    const h = canvas.clientHeight || 680;
    const cx = w / 2;
    const cy = h / 2;

    // Seed circularly by type so physics converges fast without tangling
    nodes.forEach((n, idx) => {
      const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
      const ring = n.type === 'inst' ? 110 : n.type === 'official' ? 210 : n.type === 'company' ? 300 : 350;
      n.x = cx + Math.cos(angle) * ring + (Math.random() - 0.5) * 30;
      n.y = cy + Math.sin(angle) * ring + (Math.random() - 0.5) * 30;
    });

    state.graph.nodes = nodes;
    state.graph.edges = edges;
    state.graph.panX = 0;
    state.graph.panY = 0;
    state.graph.scale = 0.92;
    state.graph.simSteps = 220;
    state.graph.hovered = null;

    const sumPeriod = subset.reduce((acc, o) => acc + o.periodEur, 0);
    document.getElementById('graphStatsBox').innerHTML = `
      <strong>${subset.length} длъжностни лица</strong> · <strong>${nodes.filter((n) => n.type === 'company').length} фирми</strong> · <strong>${nodes.filter((n) => n.type === 'inst').length} институции</strong><br/>
      <span class="muted">Стойност в периода:</span> <strong style="color:#fbbf24;">${fmtEur(sumPeriod)}</strong>`;

    document.getElementById('graphNodeList').innerHTML = subset
      .map(
        (o) => `<li data-open-slug="${esc(o.slug)}">
          <span>${o.ownInstitution ? '🔥 ' : ''}${esc(o.name)}</span>
          <span class="mono" style="color:#fbbf24;font-size:11px;">${fmtEur(o.periodEur)}</span>
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

      // Force simulation
      if (state.graph.simSteps > 0 || state.graph.dragging) {
        if (state.graph.simSteps > 0) state.graph.simSteps--;
        const cx = w / 2;
        const cy = h / 2;

        // Repulsion
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy + 1;
            const force = 2600 / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * force;
            const fy = (dy / d) * force;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
          }
          // Center gravity
          a.vx += (cx - a.x) * 0.008;
          a.vy += (cy - a.y) * 0.008;
        }

        // Springs
        for (const e of edges) {
          const a = nodeById.get(e.source);
          const b = nodeById.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetLen = e.kind === 'loop' ? 95 : 78;
          const f = (d - targetLen) * 0.045;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        for (const n of nodes) {
          if (state.graph.dragging === n) {
            n.vx = 0; n.vy = 0;
            continue;
          }
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x += n.vx;
          n.y += n.vy;
        }
      }

      // Render
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

      // Draw edges
      for (const e of edges) {
        const a = nodeById.get(e.source);
        const b = nodeById.get(e.target);
        if (!a || !b) continue;
        const isLit = !hov || (activeSet.has(a.id) && activeSet.has(b.id));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        if (e.kind === 'loop' || e.kind === 'own') {
          ctx.strokeStyle = isLit ? 'rgba(239,68,68,0.75)' : 'rgba(239,68,68,0.08)';
          ctx.lineWidth = e.kind === 'loop' ? 2.2 : 1.5;
        } else if (e.kind === 'registry') {
          ctx.strokeStyle = isLit ? 'rgba(168,85,247,0.7)' : 'rgba(168,85,247,0.08)';
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = isLit ? 'rgba(148,163,184,0.38)' : 'rgba(148,163,184,0.06)';
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }

      // Draw nodes
      for (const n of nodes) {
        const isLit = !hov || activeSet.has(n.id);
        let fill = '#06b6d4';
        if (n.type === 'official') fill = n.meta.ownInstitution ? '#ef4444' : '#fb7185';
        else if (n.type === 'company') fill = '#f59e0b';
        else if (n.type === 'relative') fill = '#a855f7';

        ctx.globalAlpha = isLit ? 1 : 0.16;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.lineWidth = hov === n ? 2.5 : 1.2;
        ctx.strokeStyle = hov === n ? '#ffffff' : '#080b11';
        ctx.stroke();

        // Label for important or hovered nodes
        if (hov === n || (hov && activeSet.has(n.id)) || n.type === 'inst' || n.degree >= 3 || nodes.length <= 45) {
          ctx.font = `${n.type === 'inst' || hov === n ? '700' : '500'} 10.5px Inter, sans-serif`;
          ctx.fillStyle = isLit ? '#e2e8f0' : 'rgba(226,232,240,0.2)';
          const shortLbl = n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label;
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
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    const wx = (sx - w / 2 - state.graph.panX) / state.graph.scale + w / 2;
    const wy = (sy - h / 2 - state.graph.panY) / state.graph.scale + h / 2;
    return { x: wx, y: wy };
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
        <strong style="color:#f87171;">👤 ${esc(o.name)}</strong><br/>
        <span class="muted">${esc(o.primaryInstitution)}</span><br/>
        В периода: <strong style="color:#fbbf24;">${fmtEur(o.periodEur)}</strong> · Общо: ${fmtEur(o.totalEur)}<br/>
        <button class="btn" style="margin-top:6px;padding:4px 8px;font-size:11.5px;" data-open-slug="${esc(o.slug)}">Отвори пълното досие →</button>`;
    } else if (n.type === 'company') {
      tip.innerHTML = `
        <strong style="color:#fbbf24;">🏢 ${esc(n.label)}</strong><br/>
        <span class="mono muted">ЕИК: ${esc(n.meta.eik)}</span><br/>
        <a href="https://sigma.midt.bg/companies/${esc(n.meta.eik)}" target="_blank" rel="noopener">Виж компанията в СИГМА 2.0 ↗</a>`;
    } else if (n.type === 'inst') {
      tip.innerHTML = `<strong style="color:#22d3ee;">🏛️ ${esc(n.label)}</strong><br/><span class="muted">${esc(n.meta.circle || '')} · ${n.degree} връзки в графа</span>`;
    } else {
      tip.innerHTML = `<strong style="color:#c084fc;">👥 ${esc(n.label)}</strong><br/><span class="muted">Свързано лице (Търговски регистър)</span>`;
    }
  }

  function setupEvents() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        const id = btn.dataset.tab;
        document.getElementById('tab-' + id).classList.add('active');
        if (id === 'graph' && !state.graph.nodes.length) {
          buildGraphData(document.getElementById('graphPresetSelect').value);
        }
      });
    });

    // Directory controls
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

    // Click row to open dossier
    document.getElementById('officialsTbody').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-slug]');
      if (tr) openDossier(tr.dataset.slug);
    });

    // Global delegate for data-open-slug buttons/items
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-open-slug]');
      if (el) openDossier(el.dataset.openSlug);
    });

    // Drawer close
    document.getElementById('drawerClose').onclick = closeDossier;
    document.getElementById('drawerBackdrop').onclick = closeDossier;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDossier(); });

    // Clusters filter
    document.getElementById('clusterSearchInput').addEventListener('input', renderClustersGrid);
    document.getElementById('clusterOnlyOwn').addEventListener('change', renderClustersGrid);

    // Graph controls
    document.getElementById('graphPresetSelect').addEventListener('change', (e) => {
      document.getElementById('graphInstSelect').value = '';
      buildGraphData(e.target.value, '');
    });
    document.getElementById('graphInstSelect').addEventListener('change', (e) => {
      if (e.target.value) buildGraphData('', e.target.value);
      else buildGraphData(document.getElementById('graphPresetSelect').value, '');
    });
    document.getElementById('btnRelayout').addEventListener('click', () => {
      state.graph.simSteps = 220;
    });
    document.getElementById('btnResetZoom').addEventListener('click', () => {
      state.graph.panX = 0; state.graph.panY = 0; state.graph.scale = 0.92;
    });

    // Canvas mouse interactions
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
    window.addEventListener('mouseup', () => {
      state.graph.dragging = null;
      state.graph.panning = false;
    });
    canvas.addEventListener('dblclick', (e) => {
      const p = screenToWorld(canvas, e.clientX, e.clientY);
      const hit = findNodeAt(p.x, p.y);
      if (hit && hit.type === 'official') openDossier(hit.meta.slug);
    });
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
