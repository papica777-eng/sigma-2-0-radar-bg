(() => {
  'use strict';

  const fmtEur = (n) => {
    const v = Number(n || 0);
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace('.', ',') + ' млрд. €';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' млн. €';
    if (Math.abs(v) >= 1e3) return Math.round(v).toLocaleString('bg-BG') + ' €';
    return v.toFixed(0) + ' €';
  };

  const fmtInt = (n) => Number(n || 0).toLocaleString('bg-BG');

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const STATUS_META = {
    CLOSED_BLOCKED: { label: 'Черна кутия (0 масива)', cls: 'tag-crit' },
    OPENWASHING_COSMETIC: { label: 'Фасадна прозрачност', cls: 'tag-warn' },
    PARTIAL_FRAGMENTED: { label: 'Замръзнали / фрагментирани', cls: 'tag-warn' },
    OPEN_READY_FOR_LINK: { label: 'Готова за свързване', cls: 'tag-ok' },
    CONNECTED_IN_NASVETLO: { label: 'Свързана в NAsvetlo', cls: 'tag-ok' },
  };

  let invData = null;
  let admData = null;
  let activeInvTab = 'overview';
  let statusFilter = 'ALL';
  let clusterFilter = 'ALL';
  let searchFilter = '';
  let sortMode = 'priority';
  let expandedAdminId = null;

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('sigma3_theme', theme); } catch {}
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.innerHTML = theme === 'dark'
        ? '<span class="theme-prefix">НА</span><span class="theme-suffix-light">светло</span>'
        : '<span class="theme-prefix">НА</span><span class="theme-suffix-dark">тъмно</span>';
      btn.title = theme === 'dark' ? 'Превключи на НАсветло' : 'Превключи на НАтъмно';
    }
  }

  function initVisitCounter() {
    const ENDPOINT = 'https://nasvetlo-visits.anchialo-v2.workers.dev';
    const wrap = document.getElementById('nasvetloVisitCounter');
    const sepEl = document.getElementById('nasvetloVisitSep');
    const footerWrap = document.getElementById('nasvetloFooterVisits');
    if (!wrap && !footerWrap) return;

    const SESSION_KEY = 'nasvetlo_visit_counted_v1';
    const FLOOR_KEY = 'nasvetlo_visit_floor_v1';
    const renderCount = (total) => {
      const n = Number(total);
      if (!Number.isFinite(n) || n < 0) return;
      let floor = 0;
      try { floor = parseInt(localStorage.getItem(FLOOR_KEY) || '0', 10) || 0; } catch {}
      const displayVal = Math.max(Math.floor(n), floor);
      try { if (displayVal > floor) localStorage.setItem(FLOOR_KEY, String(displayVal)); } catch {}
      const formatted = fmtInt(displayVal);
      if (wrap) {
        wrap.innerHTML = `<span class="visit-dot" aria-hidden="true"></span><span>Посещения:</span><strong id="nasvetloVisitCount">${formatted}</strong>`;
        wrap.hidden = false;
        wrap.style.display = '';
      }
      if (sepEl) {
        sepEl.textContent = '·';
        sepEl.hidden = false;
        sepEl.style.display = '';
      }
      if (footerWrap) {
        footerWrap.innerHTML = `Посещения: <strong id="nasvetloFooterVisitCount">${formatted}</strong>`;
        footerWrap.hidden = false;
        footerWrap.style.display = '';
      }
    };

    let alreadyCounted = false;
    try { alreadyCounted = sessionStorage.getItem(SESSION_KEY) === '1'; } catch {}
    const url = alreadyCounted ? `${ENDPOINT}/stats` : `${ENDPOINT}/hit`;
    const method = alreadyCounted ? 'GET' : 'POST';

    fetch(url, { method, mode: 'cors', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok && typeof data.total === 'number') {
          if (data.counted || !alreadyCounted) {
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
          }
          renderCount(data.total);
        } else {
          try {
            const cached = parseInt(localStorage.getItem(FLOOR_KEY) || '0', 10);
            if (cached > 0) renderCount(cached);
          } catch {}
        }
      })
      .catch(() => {
        try {
          const cached = parseInt(localStorage.getItem(FLOOR_KEY) || '0', 10);
          if (cached > 0) renderCount(cached);
        } catch {}
      });
  }

  function renderCrossTab() {
    const body = document.getElementById('invCrossBody');
    if (!body || !invData) return;
    const d = invData.investigations || {};

    if (activeInvTab === 'overview') {
      const mvr = d.mvrSecurity || {};
      const me = d.meConcessions || {};
      const dnsk = d.dnsk || {};
      const iaaa = d.iaaa || {};
      const resv = d.reserveAndEnergy || {};
      const pvu = d.mfPvu || {};
      const oth = d.otherRegistries || {};
      const bb = d.blackBoxContracts || {};
      const bbRows = bb.blackBoxBreakdown || [];
      const secNoAct = mvr.noActiveSecurityHighlights || [];
      const top3 = bbRows.slice(0, 3).map((r) => `<strong>${esc(r.name)}</strong> — ${String(r.singleOfferSharePct).replace('.', ',')}% (${fmtInt(r.singleOfferCount)}/${fmtInt(r.contracts)})`).join(', ');

      body.innerHTML = `
        <div class="inv-highlight-grid">
          <article class="inv-finding-card">
            <span class="inv-tag tag-crit">МВР Охранителни лицензи × ЗОП</span>
            <h3>Отнети лицензи с реални охранителни договори</h3>
            <p>От <strong>${fmtInt(mvr.zopMatchedCompanies)}</strong> изпълнители по ЗОП с досие в регистъра за частна охранителна дейност (ЗЧОД) на МВР (${fmtEur(mvr.zopMatchedTotalEur)}), <strong>${fmtInt(mvr.noActiveLicenseZopCount)}</strong> нямат действащ лиценз (<strong>${fmtInt(mvr.explicitRevokedNoActiveCount)}</strong> изрично <strong>„Отнет“ / „Отказ“</strong>). Фирмите с отнет лиценз и без активен документ (${fmtInt(mvr.securityContractNoActiveCount)} бр. — <em>БАТ СЕКЮРИТИ ЕООД</em> и <em>СЕЛЕНА 52 ЕООД</em>) са спечелили <strong>преки охранителни поръчки</strong> за ${fmtEur(mvr.securityContractNoActiveEur)} (охрана на БНР/БНТ и Министерството на туризма).</p>
          </article>

          <article class="inv-finding-card">
            <span class="inv-tag tag-ok">МЕ Кариери × Строители по ЗОП</span>
            <h3>${fmtInt(me.zopMatchedCompanies)} концесионери държат ${fmtEur(me.zopMatchedDirectEur)} + ${fmtEur(me.zopMatchedConsortiumEur)} ДЗЗД</h3>
            <p>Строителните компании с концесии за варовик, мрамор, баластра и диабази около пътните трасета (<em>Главболгарстрой АД</em>, <em>Европейски пътища АД</em>, <em>Пътинженерингстрой-Т ЕАД</em>, <em>Грома Холд ЕООД</em>, <em>Автомагистрали - Черно море АД</em>) концентрират мултимилиардни директни и консорциумни поръчки по ЗОП.</p>
          </article>

          <article class="inv-finding-card">
            <span class="inv-tag tag-warn">ДНСК Надзор &amp; Незаконни строежи</span>
            <h3>${fmtInt(dnsk.illegalInProcedure)} висящи събаряния + ${fmtInt(dnsk.expiredConsultantsInZop)} надзорни фирми с изтекъл срок</h3>
            <p>От ${fmtInt(dnsk.illegalOrdersTotal)} влезли в сила заповеди за премахване на незаконни строежи, <strong>${fmtInt(dnsk.illegalInProcedure)}</strong> са висящи в процедура (някои от 2001–2002 г.). От ${fmtInt(dnsk.totalConsultantsRegistry)} консултанти по чл. 166 ЗУТ, <strong>${fmtInt(dnsk.zopMatchedConsultants)}</strong> печелят по ЗОП (${fmtEur(dnsk.zopConsultantsTotalEur)}), като при <strong>${fmtInt(dnsk.expiredConsultantsInZop)}</strong> срокът в масива на ДНСК е изтекъл.</p>
          </article>

          <article class="inv-finding-card">
            <span class="inv-tag tag-crit">Черни кутии (206 907 договора)</span>
            <h3>${fmtInt(bb.totalSingleOfferCount)} договора с 1 оферта за ${fmtEur(bb.totalSingleOfferEur)}</h3>
            <p>Одитът на реалния брой оферти сред ${bbRows.length} водещи затворени и инфраструктурни възложители (${fmtEur(bb.totalBlackBoxEur)}) показва: ${top3}.</p>
          </article>

          <article class="inv-finding-card">
            <span class="inv-tag tag-ok">Държавен резерв, ИААА, БАБХ &amp; Хазарт</span>
            <h3>${fmtInt(iaaa.zopMatchedCompanies)} транспортни, ${fmtInt(resv.zopMatchedFuelCompanies)} горивни и ${fmtInt(oth.babhZopMatched)} хранителни фирми в ЗОП</h3>
            <p>Пресичането с ИААА (${fmtEur(iaaa.zopMatchedTotalEur)}), задължените лица по ЗЗНН и петролни бази (${fmtEur(resv.zopMatchedFuelEur)}), БАБХ (${fmtEur(oth.babhZopEur)}), енергийните помощи ОЗОБ (${fmtInt(resv.ozobZopMatched)} фирми) и хазартните лицензи на НАП (${fmtInt(oth.napGamblingZopMatched)} фирма в ЗОП: ${fmtEur(oth.napGamblingZopEur)}) разкрива пълния отпечатък на изпълнителите.</p>
          </article>

          <article class="inv-finding-card">
            <span class="inv-tag tag-warn">МФ ПВУ &amp; Бариера при ДФЗ 2025</span>
            <h3>${String(pvu.executionPct || 76.09).replace('.', ',')}% усвояване по ПВУ · ${fmtInt(pvu.zeroPaidBigProjectsCount)} мега-проекта на 0 €</h3>
            <p>Към 30.09.2026 г. от ${fmtEur(pvu.totalBudgetEur)} по ПВУ са изплатени ${fmtEur(pvu.totalPaidEur)}, но <em>Цифровизацията на НАП</em> (23,42 млн. €) и <em>Агенция „Митници“</em> (17,61 млн. €) стоят на <strong>0,00 €</strong>. Междувременно масивът за субсидии на ДФЗ за 2025 г. в <code>data.egov.bg</code> прекъсва с timeout (&gt;120s) при масов CSV експорт.</p>
          </article>
        </div>
        ${secNoAct.length ? `
          <h3 style="font-size:0.95rem;color:var(--crimson);margin:14px 0 8px;">Фокус: Фирми с отнет охранителен лиценз (МВР) и преки охранителни поръчки по ЗОП</h3>
          <div class="inv-table-wrap" style="margin-bottom:16px;">
            <table class="inv-table">
              <thead><tr><th>ЕИК</th><th>Фирма</th><th>Статус в МВР</th><th>Лиценз</th><th class="num">Охрана ЗОП (€)</th><th>Предмет на поръчката</th></tr></thead>
              <tbody>
                ${secNoAct.map((x) => `
                  <tr>
                    <td class="mono">${esc(x.eik)}</td>
                    <td><strong>${esc(x.name)}</strong></td>
                    <td><span class="inv-tag tag-crit">${esc(x.latestStatus)} (няма активен)</span></td>
                    <td class="mono">${esc(x.latestDoc)}</td>
                    <td class="num"><strong>${fmtEur(x.securityContractsEur)}</strong></td>
                    <td>${esc(x.securitySampleSubject)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        ${bbRows.length ? `
          <h3 style="font-size:0.95rem;margin:14px 0 8px;">Топ 5 затворени и инфраструктурни възложители по дял на договорите с 1 оферта</h3>
          <div class="inv-table-wrap">
            <table class="inv-table">
              <thead><tr><th>ЕИК</th><th>Възложител</th><th class="num">Общо ЗОП (записи)</th><th class="num">1 оферта (бр. / %)</th><th class="num">Сума с 1 оферта</th></tr></thead>
              <tbody>
                ${bbRows.slice(0, 5).map((a) => `
                  <tr>
                    <td class="mono">${esc(a.eik)}</td>
                    <td><strong>${esc(a.name)}</strong></td>
                    <td class="num">${fmtEur(a.totalEur)} (${fmtInt(a.contracts)})</td>
                    <td class="num"><span class="inv-tag ${a.singleOfferSharePct >= 40 ? 'tag-crit' : 'tag-warn'}">${fmtInt(a.singleOfferCount)} (${String(a.singleOfferSharePct).replace('.', ',')}%)</span></td>
                    <td class="num"><strong>${fmtEur(a.singleOfferEur)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <p style="font-size:0.75rem;color:var(--ink-muted);margin:8px 0 0;">
            Методологична бележка: Броят записи в таблиците за 1 оферта включва всички договорни позиции и рамкови споразумения в пълния договорен масив (206 907 записа), докато Индексът на прозрачност по-долу използва агрегирания брой договори с обявена стойност от СИГМА 2.0. Общите суми в евро съвпадат.
          </p>
        ` : ''}
      `;
      return;
    }

    if (activeInvTab === 'mvr') {
      const mvr = d.mvrSecurity || {};
      const secNoAct = mvr.noActiveSecurityHighlights || [];
      const top = mvr.topFindings || [];
      body.innerHTML = `
        <p style="margin-top:0;font-size:0.84rem;color:var(--ink-secondary);">
          Регистър на МВР за частна охранителна дейност — ЗЧОД (<a href="${esc(mvr.datasetUrl)}" target="_blank" rel="noopener">data.egov.bg ↗</a>): <strong>${fmtInt(mvr.totalRegistryRecords)}</strong> записа (${fmtInt(mvr.uniqueEiksInRegistry)} уникални ЕИК). Общо <strong>${fmtInt(mvr.zopMatchedCompanies)}</strong> фирми присъстват в ЗОП (${fmtEur(mvr.zopMatchedTotalEur)}), от които <strong>${fmtInt(mvr.noActiveLicenseZopCount)}</strong> нямат нито един действащ лиценз (<strong>${fmtInt(mvr.explicitRevokedNoActiveCount)}</strong> изрично <strong>Отнет</strong>). Политически свързани фирми с лиценз: <strong>${fmtInt(mvr.politicianLinkedCount)}</strong>.
        </p>
        ${secNoAct.length ? `
          <h3 style="font-size:0.95rem;color:var(--crimson);margin:14px 0 8px;">1. Фирми БЕЗ действащ охранителен лиценз, спечелили преки охранителни поръчки по ЗОП</h3>
          <div class="inv-table-wrap" style="margin-bottom:18px;">
            <table class="inv-table">
              <thead><tr><th>ЕИК</th><th>Фирма</th><th>Статус в МВР</th><th>Лиценз (дата)</th><th class="num">Охрана ЗОП (€)</th><th>Предмет на охранителната поръчка</th></tr></thead>
              <tbody>
                ${secNoAct.map((x) => `
                  <tr>
                    <td class="mono">${esc(x.eik)}</td>
                    <td><strong>${esc(x.name)}</strong></td>
                    <td><span class="inv-tag tag-crit">${esc(x.latestStatus)} (няма активен)</span></td>
                    <td class="mono">${esc(x.latestDoc)}</td>
                    <td class="num"><strong>${fmtEur(x.securityContractsEur)}</strong></td>
                    <td>${esc(x.securitySampleSubject)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
        <h3 style="font-size:0.95rem;margin:14px 0 8px;">2. Водещи контрагенти по ЗОП с охранително досие в МВР (разграничение по активен vs отнет лиценз)</h3>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Изпълнител</th><th>Актуален статус (МВР)</th><th class="num">Охрана (€ / бр.)</th><th class="num">Общо ЗОП (€)</th><th>Свързани лица</th></tr></thead>
            <tbody>
              ${top.map((x) => `
                <tr>
                  <td class="mono">${esc(x.eik)}</td>
                  <td><strong>${esc(x.name)}</strong></td>
                  <td><span class="inv-tag ${x.noActiveLicense ? 'tag-crit' : 'tag-ok'}">${x.noActiveLicense ? esc(x.latestStatus) + ' (няма действащ)' : 'Действащ'}</span></td>
                  <td class="num">${x.securityContracts > 0 ? `${fmtEur(x.securityContractsEur)} (${x.securityContracts})` : '—'}</td>
                  <td class="num">${fmtEur(x.wonEur)} (${x.contracts})</td>
                  <td>${(x.linkedOfficials && x.linkedOfficials.length) ? `<span class="inv-tag tag-crit">${esc(x.linkedOfficials.join(', '))}</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (activeInvTab === 'concessions') {
      const me = d.meConcessions || {};
      const rows = me.topFindings || [];
      body.innerHTML = `
        <p style="margin-top:0;font-size:0.84rem;color:var(--ink-secondary);">
          Регистър на Министерство на енергетиката (<a href="${esc(me.datasetUrl)}" target="_blank" rel="noopener">data.egov.bg ↗</a>): <strong>${fmtInt(me.totalConcessions)}</strong> концесии (от тях <strong>${fmtInt(me.mineralGroups?.['Строителни материали'] || 0)}</strong> за строителни и инертни материали). Точно <strong>${fmtInt(me.zopMatchedCompanies)}</strong> концесионери печелят директно <strong>${fmtEur(me.zopMatchedDirectEur)}</strong> по ЗОП + <strong>${fmtEur(me.zopMatchedConsortiumEur)}</strong> през ДЗЗД консорциуми.
        </p>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Концесионер</th><th>Находище &amp; Община</th><th>Полезно изкопаемо / Срок</th><th class="num">Директно ЗОП (€)</th><th class="num">През ДЗЗД (€)</th><th>Свързани политици</th></tr></thead>
            <tbody>
              ${rows.map((x) => `
                <tr>
                  <td class="mono">${esc(x.eik)}</td>
                  <td><strong>${esc(x.name)}</strong><div style="font-size:0.72rem;color:var(--ink-muted);">${esc(x.concessionaire)}</div></td>
                  <td><strong>${esc(x.deposit)}</strong><div style="font-size:0.72rem;color:var(--ink-muted);">общ. ${esc(x.municipality)}, обл. ${esc(x.region)}</div></td>
                  <td>${esc(x.mineralType)} <span class="inv-tag tag-muted">${esc(x.term)}</span></td>
                  <td class="num">${fmtEur(x.wonEur)} (${x.contracts})</td>
                  <td class="num"><strong>${fmtEur(x.consortiumEur)}</strong></td>
                  <td>${(x.linkedOfficials && x.linkedOfficials.length) ? `<span class="inv-tag tag-crit">${esc(x.linkedOfficials.join(', '))}</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (activeInvTab === 'dnsk') {
      const dnsk = d.dnsk || {};
      const cons = dnsk.topConsultants || [];
      const oldest = dnsk.oldestUnexecutedOrders || [];
      const cities = dnsk.topCitiesUnexecuted || [];
      body.innerHTML = `
        <p style="margin-top:0;font-size:0.84rem;color:var(--ink-secondary);">
          ДНСК (<a href="${esc(dnsk.datasetUrlConsultants)}" target="_blank" rel="noopener">Консултанти чл. 166 ЗУТ ↗</a> &amp; <a href="${esc(dnsk.datasetUrlIllegal)}" target="_blank" rel="noopener">Незаконни строежи ↗</a>): <strong>${fmtInt(dnsk.zopMatchedConsultants)}</strong> надзорни фирми печелят по ЗОП (${fmtEur(dnsk.zopConsultantsTotalEur)}), като <strong>${fmtInt(dnsk.expiredConsultantsInZop)}</strong> са с изтекъл срок на удостоверението. Общо <strong>${fmtInt(dnsk.illegalOrdersTotal)}</strong> влезли в сила заповеди за премахване (<strong>${fmtInt(dnsk.illegalInProcedure)}</strong> висящи в процедура).
        </p>
        <div class="inv-highlight-grid">
          <div class="inv-dossier-card">
            <h4>Топ градове по висящи заповеди за събаряне</h4>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${cities.map((c) => `<span class="inv-tag tag-warn">${esc(c.city)}: ${fmtInt(c.count)}</span>`).join('')}
            </div>
          </div>
          <div class="inv-dossier-card">
            <h4>Разбивка по статус на премахванията</h4>
            ${Object.entries(dnsk.illegalActions || {}).map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:8px;"><span>${esc(k)}</span><strong class="mono">${fmtInt(v)}</strong></div>`).join('')}
          </div>
        </div>
        <h3 style="font-size:0.95rem;margin:14px 0 8px;">1. Строителен надзор (чл. 166 ЗУТ) в ЗОП — изтекли удостоверения и свързани политици</h3>
        <div class="inv-table-wrap" style="margin-bottom:18px;">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Консултант / Управител</th><th>Валиден до</th><th class="num">ЗОП (€ / бр.)</th><th>Свързани политици</th></tr></thead>
            <tbody>
              ${cons.map((x) => `
                <tr>
                  <td class="mono">${esc(x.eik)}</td>
                  <td><strong>${esc(x.name)}</strong><div style="font-size:0.72rem;color:var(--ink-muted);">${esc(x.manager)} · ${esc(x.city)}</div></td>
                  <td><span class="inv-tag ${x.isExpired ? 'tag-crit' : 'tag-ok'}">${esc(x.validUntil)} ${x.isExpired ? '(Изтекъл)' : '(Валиден)'}</span></td>
                  <td class="num">${fmtEur(x.wonEur)} (${x.contracts})</td>
                  <td>${(x.linkedOfficials && x.linkedOfficials.length) ? `<span class="inv-tag tag-crit">${esc(x.linkedOfficials.join(', '))}</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <h3 style="font-size:0.95rem;margin:14px 0 8px;">2. Най-старите висящи заповеди за премахване (2001–2002+ г.)</h3>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead><tr><th>Заповед</th><th>Незаконен строеж</th><th>Местонахождение</th><th>Предприети действия</th></tr></thead>
            <tbody>
              ${oldest.map((o) => `<tr><td class="mono">${esc(o.orderNo)}</td><td>${esc(o.object)}</td><td>${esc(o.location)}</td><td>${esc(o.action)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (activeInvTab === 'iaaa') {
      const iaaa = d.iaaa || {};
      const rows = iaaa.topFindings || [];
      body.innerHTML = `
        <p style="margin-top:0;font-size:0.84rem;color:var(--ink-secondary);">
          ИА „Автомобилна администрация“ (<a href="${esc(iaaa.datasetUrl)}" target="_blank" rel="noopener">data.egov.bg ↗</a>): <strong>${fmtInt(iaaa.busLicensesCount)}</strong> автобусни лиценза + <strong>${fmtInt(iaaa.cargoLicensesCount)}</strong> товарни. Засечени в ЗОП: <strong>${fmtInt(iaaa.zopMatchedCompanies)}</strong> компании с договори за <strong>${fmtEur(iaaa.zopMatchedTotalEur)}</strong>.
        </p>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Превозвач</th><th>Лиценз / Вид</th><th>МПС / Област</th><th class="num">ЗОП (€ / бр.)</th><th>Свързани политици</th></tr></thead>
            <tbody>
              ${rows.map((x) => `
                <tr>
                  <td class="mono">${esc(x.eik)}</td>
                  <td><strong>${esc(x.name)}</strong></td>
                  <td><span class="inv-tag tag-muted">№ ${esc(x.licenseNo)}</span> ${esc(x.kind)}</td>
                  <td>${esc(x.vehicles)} · ${esc(x.region)}</td>
                  <td class="num">${fmtEur(x.wonEur)} (${x.contracts})</td>
                  <td>${(x.linkedOfficials && x.linkedOfficials.length) ? `<span class="inv-tag tag-crit">${esc(x.linkedOfficials.join(', '))}</span>` : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      return;
    }

    if (activeInvTab === 'reserve') {
      const resv = d.reserveAndEnergy || {};
      const pvu = d.mfPvu || {};
      const oth = d.otherRegistries || {};
      body.innerHTML = `
        <div class="inv-highlight-grid">
          <div class="inv-dossier-card">
            <h4>ДА „Държавен резерв“ (ЗЗНН горива &amp; складове)</h4>
            <div>Задължени лица: <strong>${fmtInt(resv.obligedCount)}</strong> · Петролни складове: <strong>${fmtInt(resv.warehousesCount)}</strong> · Съвпадения в ЗОП: <strong>${fmtInt(resv.zopMatchedFuelCompanies)}</strong> (${fmtEur(resv.zopMatchedFuelEur)}).</div>
          </div>
          <div class="inv-dossier-card">
            <h4>МЕ (Енергийни помощи) &amp; БАБХ &amp; НАП Хазарт</h4>
            <div>Енергийни помощи ОЗОБ в ЗОП: <strong>${fmtInt(resv.ozobZopMatched)}</strong> · БАБХ храни в ЗОП: <strong>${fmtInt(oth.babhZopMatched)}</strong> (${fmtEur(oth.babhZopEur)}) · НАП Хазарт в ЗОП: <strong>${fmtInt(oth.napGamblingZopMatched)}</strong> (${fmtInt(oth.napGamblingUniqueEiks)} хазартни ЕИК общо).</div>
          </div>
        </div>
        <h3 style="font-size:0.95rem;margin:14px 0 8px;">1. Топ задължени лица по ЗЗНН и петролни бази в обществените поръчки</h3>
        <div class="inv-table-wrap" style="margin-bottom:18px;">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Компания</th><th>Роля в Държавен резерв</th><th class="num">ЗОП (€ / бр.)</th></tr></thead>
            <tbody>
              ${(resv.topFuelFindings || []).map((x) => `
                <tr>
                  <td class="mono">${esc(x.eik)}</td>
                  <td><strong>${esc(x.name)}</strong></td>
                  <td>${esc(x.source)} <div style="font-size:0.72rem;color:var(--ink-muted);">${esc(x.detail)}</div></td>
                  <td class="num">${fmtEur(x.wonEur)} (${x.contracts})</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <h3 style="font-size:0.95rem;margin:14px 0 8px;">2. МФ: Финансово изпълнение на ПВУ към 30.09.2026 г. (${fmtEur(pvu.totalPaidEur)} / ${fmtEur(pvu.totalBudgetEur)} — ${String(pvu.executionPct).replace('.', ',')}%)</h3>
        <div class="inv-table-wrap" style="margin-bottom:18px;">
          <table class="inv-table">
            <thead><tr><th>Код</th><th>Инвестиция по ПВУ</th><th>Ведомство</th><th class="num">Бюджет (€)</th><th class="num">Платено (€)</th><th class="num">Изпълнение</th></tr></thead>
            <tbody>
              ${(pvu.topBudgetProjects || []).map((p) => `
                <tr>
                  <td class="mono">${esc(p.code)}</td>
                  <td><strong>${esc(p.investment)}</strong></td>
                  <td>${esc(p.ministry)}</td>
                  <td class="num">${fmtEur(p.budgetTotal)}</td>
                  <td class="num">${fmtEur(p.paidTotal)}</td>
                  <td class="num"><span class="inv-tag ${p.executionPct < 35 ? 'tag-crit' : p.executionPct < 70 ? 'tag-warn' : 'tag-ok'}">${String(p.executionPct).replace('.', ',')}%</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${(oth.napGamblingTop && oth.napGamblingTop.length) ? `
          <h3 style="font-size:0.95rem;margin:14px 0 8px;">3. Пресичане НАП Хазартни лицензи × ЗОП</h3>
          <div class="inv-table-wrap">
            <table class="inv-table">
              <thead><tr><th>ЕИК</th><th>Компания</th><th>Град / Дейност</th><th class="num">ЗОП (€ / бр.)</th></tr></thead>
              <tbody>
                ${oth.napGamblingTop.map((g) => `
                  <tr><td class="mono">${esc(g.eik)}</td><td><strong>${esc(g.name)}</strong></td><td>${esc(g.city)} · ${esc(g.activity)}</td><td class="num">${fmtEur(g.wonEur)} (${g.contracts})</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      `;
      return;
    }

    if (activeInvTab === 'blackbox') {
      const bb = d.blackBoxContracts || {};
      const rows = bb.blackBoxBreakdown || [];
      body.innerHTML = `
        <p style="margin-top:0;font-size:0.84rem;color:var(--ink-secondary);">
          Реален разрез по брой оферти (<code>bids_received == 1</code>) и процедури без предварително обявление през пълния договорен масив от <strong>206 907 договора</strong>: обхванати <strong>${fmtInt(bb.totalBlackBoxContracts)}</strong> договора за <strong>${fmtEur(bb.totalBlackBoxEur)}</strong>, от които <strong>${fmtInt(bb.totalSingleOfferCount)} договора за ${fmtEur(bb.totalSingleOfferEur)} с 1 оферта</strong>.
        </p>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead><tr><th>ЕИК</th><th>Възложител (Черна кутия)</th><th class="num">Записи / Сума</th><th class="num">1 оферта (бр. / %)</th><th class="num">Сума с 1 оферта</th><th>Топ 3 контрагенти (с 1 оферта)</th></tr></thead>
            <tbody>
              ${rows.map((a) => `
                <tr>
                  <td class="mono">${esc(a.eik)}</td>
                  <td><strong>${esc(a.name)}</strong></td>
                  <td class="num">${fmtInt(a.contracts)}<div style="font-size:0.72rem;color:var(--ink-muted);">${fmtEur(a.totalEur)}</div></td>
                  <td class="num"><span class="inv-tag ${a.singleOfferSharePct >= 40 ? 'tag-crit' : 'tag-warn'}">${fmtInt(a.singleOfferCount)} (${String(a.singleOfferSharePct).replace('.', ',')}%)</span></td>
                  <td class="num"><strong>${fmtEur(a.singleOfferEur)}</strong></td>
                  <td style="font-size:0.75rem;">
                    ${(a.topContractors || []).slice(0, 3).map((tc) => `<div>• <strong>${esc(tc.name)}</strong>: ${fmtEur(tc.eur)} (${tc.single}/${tc.contracts} с 1 оферта)</div>`).join('')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p style="font-size:0.75rem;color:var(--ink-muted);margin:8px 0 0;">
          Методологична бележка: Броят записи включва всички договорни позиции и рамкови споразумения в пълния договорен масив (206 907 записа), докато Индексът на прозрачност по-долу използва агрегирания брой договори с обявена стойност от СИГМА 2.0. Общите суми в евро съвпадат.
        </p>
      `;
    }
  }

  function renderAudit50() {
    const tbody = document.getElementById('audit50Tbody');
    const meta = document.getElementById('audit50CountMeta');
    if (!tbody || !admData) return;

    const allList = admData.administrations || [];
    const list = allList.filter((a) => {
      if (statusFilter !== 'ALL' && a.antiCorruption?.accessStatus !== statusFilter) return false;
      if (clusterFilter !== 'ALL' && a.cluster !== clusterFilter) return false;
      if (searchFilter) {
        const hay = [
          a.name, a.shortName, a.eik,
          ...(Array.isArray(a.extraEiks) ? a.extraEiks : []),
          a.cluster,
          a.antiCorruption?.keyRegistry, a.antiCorruption?.corruptionSchemes,
          a.antiCorruption?.knownBarrier, a.antiCorruption?.action48h,
          a.openData?.egovMatchedName,
        ].join(' ').toLowerCase();
        if (!hay.includes(searchFilter)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortMode === 'spent') return (b.procurement?.spentEur || 0) - (a.procurement?.spentEur || 0);
      if (sortMode === 'exposure') return (b.antiCorruption?.corruptionExposureScore || 0) - (a.antiCorruption?.corruptionExposureScore || 0);
      if (sortMode === 'open') return (b.antiCorruption?.openAccessScore || 0) - (a.antiCorruption?.openAccessScore || 0);
      return (b.antiCorruption?.blackBoxPriority || 0) - (a.antiCorruption?.blackBoxPriority || 0);
    });

    if (meta) {
      const sumEur = list.reduce((acc, x) => acc + Number(x.procurement?.spentEur || 0), 0);
      meta.innerHTML = `Показани <strong>${list.length}</strong> от <strong>${allList.length}</strong> институции · Общ договорен ресурс: <strong>${fmtEur(sumEur)}</strong> · Кликнете върху ред за пълно одитно досие и препоръчителни мерки.`;
    }

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ink-muted);padding:18px;">Няма институции, отговарящи на филтъра.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((a, idx) => {
      const st = a.antiCorruption?.accessStatus || 'PARTIAL_FRAGMENTED';
      const stInfo = STATUS_META[st] || { label: st, cls: 'tag-muted' };
      const od = a.openData || {};
      const ac = a.antiCorruption || {};
      const pr = a.procurement || {};
      const isExp = expandedAdminId === a.id;
      const allEiks = [a.eik, ...(Array.isArray(a.extraEiks) ? a.extraEiks : [])].filter(Boolean);
      const eikLabel = allEiks.length > 1
        ? `Обединени ЕИК (${allEiks.length}): ${allEiks.join(', ')}`
        : `ЕИК: ${a.eik}`;

      const rowHtml = `
        <tr class="inv-admin-row" data-admin-id="${esc(a.id)}">
          <td class="mono">${idx + 1}</td>
          <td>
            <strong>${esc(a.name)}</strong>
            <div class="mono" style="font-size:0.72rem;color:var(--ink-muted);">${esc(eikLabel)} · ${fmtInt(pr.contracts)} договора</div>
          </td>
          <td>
            <span class="inv-tag ${stInfo.cls}">${esc(stInfo.label)}</span>
            <div style="font-size:0.72rem;color:var(--ink-muted);margin-top:3px;">${esc(a.cluster)}</div>
          </td>
          <td class="num"><strong>${fmtEur(pr.spentEur)}</strong></td>
          <td class="num">
            <strong>${fmtInt(od.totalDatasets || 0)}</strong>
            <div style="font-size:0.71rem;color:var(--ink-muted);">${od.latestUpdate ? esc(od.latestUpdate) : 'без данни'}</div>
          </td>
          <td class="num"><span class="inv-tag ${(ac.corruptionExposureScore || 0) >= 85 ? 'tag-crit' : 'tag-warn'}">${ac.corruptionExposureScore}/100</span></td>
          <td style="font-size:0.78rem;color:var(--ink-secondary);">${esc(ac.knownBarrier)}</td>
        </tr>
      `;

      if (!isExp) return rowHtml;

      const dsLinks = (od.topDatasets || []).slice(0, 4).map((ds) =>
        `<div>• <a href="https://data.egov.bg/organisation/dataset/${esc(ds.uri)}" target="_blank" rel="noopener">${esc(ds.name)}</a> <span class="mono" style="color:var(--ink-muted);">(${esc(ds.updated || 'без дата')})</span></div>`
      ).join('') || '<div style="color:var(--crimson);">Няма публикувани масиви в data.egov.bg.</div>';

      const detailHtml = `
        <tr class="inv-admin-detail">
          <td colspan="7">
            <div class="inv-dossier-grid">
              <div class="inv-dossier-card">
                <h4>Доказвана корупционна схема &amp; Ключов регистър</h4>
                <div><strong>Ключов регистър:</strong> ${esc(ac.keyRegistry)}</div>
                <div style="margin-top:4px;"><strong>Схема:</strong> ${esc(ac.corruptionSchemes)}</div>
                <div style="margin-top:4px;"><strong>Ключ за сечение:</strong> <code>${esc(ac.crossLinkKey)}</code></div>
              </div>
              <div class="inv-dossier-card">
                <h4>Налични масиви в data.egov.bg (${fmtInt(od.totalDatasets || 0)} · ${od.machineReadablePct || 0}% маш.)</h4>
                ${dsLinks}
                <div style="margin-top:6px;">
                  <strong>Портал:</strong> <a href="${esc(od.portalUrl)}" target="_blank" rel="noopener">${esc(od.portalUrl)}</a>
                  (HTTP ${od.portalProbe?.httpStatus || 0}${od.portalProbe?.hasWaf ? ' · WAF' : ''}${od.portalProbe?.hasCaptcha ? ' · CAPTCHA' : ''})
                </div>
              </div>
              <div class="inv-dossier-card">
                <h4>Незабавна мярка за отваряне на данните</h4>
                <div style="color:var(--teal);font-weight:600;">${esc(ac.action48h)}</div>
                <div class="mono" style="margin-top:8px;font-size:0.72rem;color:var(--ink-muted);">
                  Отворени данни: ${ac.openAccessScore}/100 · Свързани политици: ${fmtInt(pr.linkedOfficials)} · АДФИ/КЗК: ${fmtInt((a.judicialAndForensics?.adfiReports || 0) + (a.judicialAndForensics?.kzkCount || 0))}
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
      return rowHtml + detailHtml;
    }).join('');
  }

  async function init() {
    try {
      const savedTheme = (() => { try { return localStorage.getItem('sigma3_theme'); } catch { return null; } })();
      if (savedTheme === 'dark' || savedTheme === 'light') applyTheme(savedTheme);

      const themeBtn = document.getElementById('themeToggleBtn');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
          applyTheme(cur === 'dark' ? 'light' : 'dark');
        });
      }

      initVisitCounter();

      const [invRes, admRes] = await Promise.all([
        fetch('data/nasvetlo_investigations.json'),
        fetch('data/nasvetlo_50_admins.json'),
      ]);
      invData = await invRes.json();
      admData = await admRes.json();

      document.getElementById('invTabBar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-inv-tab]');
        if (!btn) return;
        activeInvTab = btn.dataset.invTab;
        document.querySelectorAll('#invTabBar [data-inv-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        renderCrossTab();
      });

      document.getElementById('audit50StatusBar')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-status-filter]');
        if (!btn) return;
        statusFilter = btn.dataset.statusFilter;
        document.querySelectorAll('#audit50StatusBar [data-status-filter]').forEach((b) => b.classList.toggle('active', b === btn));
        renderAudit50();
      });

      document.getElementById('audit50Search')?.addEventListener('input', (e) => {
        searchFilter = String(e.target.value || '').trim().toLowerCase();
        renderAudit50();
      });

      document.getElementById('audit50Cluster')?.addEventListener('change', (e) => {
        clusterFilter = e.target.value || 'ALL';
        renderAudit50();
      });

      document.getElementById('audit50Sort')?.addEventListener('change', (e) => {
        sortMode = e.target.value || 'priority';
        renderAudit50();
      });

      document.getElementById('audit50Tbody')?.addEventListener('click', (e) => {
        const tr = e.target.closest('.inv-admin-row');
        if (!tr) return;
        const id = tr.dataset.adminId;
        expandedAdminId = expandedAdminId === id ? null : id;
        renderAudit50();
      });

      document.querySelectorAll('[data-jump-tab]').forEach((card) => {
        card.addEventListener('click', () => {
          const tab = card.getAttribute('data-jump-tab');
          const btn = document.querySelector(`#invTabBar [data-inv-tab="${tab}"]`);
          if (btn) btn.click();
          document.getElementById('invCrossSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      document.querySelectorAll('[data-jump-status]').forEach((card) => {
        card.addEventListener('click', () => {
          const st = card.getAttribute('data-jump-status');
          const btn = document.querySelector(`#audit50StatusBar [data-status-filter="${st}"]`);
          if (btn) btn.click();
          document.getElementById('invAudit50Section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    } catch (err) {
      // Static SSG content stays intact even if dynamic fetch fails
      console.error('NAsvetlo hydration error:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
