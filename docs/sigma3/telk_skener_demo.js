(() => {
  'use strict';

  const NRN_WEIGHTS = [2, 4, 8, 5, 10, 9, 7, 3, 6, 1, 2];

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('sigma3_theme', theme); } catch {}
    const btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.textContent = theme === 'dark' ? 'Светъл режим' : 'Тъмен режим';
      btn.title = theme === 'dark' ? 'Превключи на Светъл режим' : 'Превключи на Тъмен режим';
    }
  }

  function validateNrnMod11(raw) {
    const nrn = String(raw || '').trim();
    if (!/^\d{12}$/.test(nrn)) {
      return { valid: false, message: 'Невалиден формат: изискват се точно 12 цифри.' };
    }
    const yy = Number(nrn.slice(0, 2));
    const mm = Number(nrn.slice(2, 4));
    const dd = Number(nrn.slice(4, 6));
    const dt = new Date(Date.UTC(2000 + yy, mm - 1, dd));
    if (dt.getUTCFullYear() !== 2000 + yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) {
      return { valid: false, message: 'Невалидна календарна дата в префикса на НРН.' };
    }
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += Number(nrn[i]) * NRN_WEIGHTS[i];
    const rem = sum % 11;
    const expected = rem < 10 ? rem : 0;
    const actual = Number(nrn[11]);
    if (expected !== actual) {
      return { valid: false, message: `Невалидна Modulo 11 контролна цифра (очаквана ${expected}, въведена ${actual}).` };
    }
    return {
      valid: true,
      message: `Валиден НРН (Modulo 11 OK · тип документ ${nrn.slice(6, 8)} · ${nrn.slice(4, 6)}.${nrn.slice(2, 4)}.20${nrn.slice(0, 2)})`,
    };
  }

  function calcNmeAnnex2(p1, p2, p3, declared) {
    const arr = [Number(p1 || 0), Number(p2 || 0), Number(p3 || 0)].filter((v) => Number.isFinite(v) && v > 0);
    if (arr.length === 0) {
      return { maxP: 0, expected: declared, delta: 0, violation: false };
    }
    const maxP = Math.max(...arr);
    let maxIdx = arr.indexOf(maxP);
    const others = arr.reduce((acc, v, idx) => (idx === maxIdx ? acc : acc + v), 0);
    const expected = maxP >= 100 || arr.length === 1 ? Math.min(100, maxP) : Math.min(100, Number((maxP + 0.2 * others).toFixed(1)));
    const delta = Number((declared - expected).toFixed(1));
    return { maxP, expected, delta, violation: delta > 1.0 };
  }

  const SCENARIOS = {
    authentic_plovdiv: {
      verdict: 'АВТЕНТИЧЕН',
      cls: 'is-auth',
      catuskoti: 'FIRST (Истина)',
      title: '1. Автентично ЕР (Пловдив BG421 · Кохерентна НЗИС история)',
      summary: 'Валиден PAdES PDF с 0 дописани байта, RFC 3161 времеви печат, 24-мес. НЗИС е-рецепти (18 бр.), валидни ЕКГ/ЕхоКГ НРН, коректно сумиране по НМЕ Приложение № 2.',
      probs: { auth: 96.4, fab: 1.8, sys: 1.8 },
      ci: [1.1, 7.9],
      nmeOk: true,
      nmeMsg: 'НМЕ Приложение № 2, т. III: P_max 60% + 20% × 15% = 63.0% (отчетен ТНР 63.0% — без инфлация).',
      steps: [
        { s: 1, name: 'Посредник', st: 'CLEAR', txt: 'Пловдив (BG421) → Пловдив (BG421)' },
        { s: 2, name: 'Входен УИН', st: 'CLEAR', txt: '1.1× спрямо нормата' },
        { s: 3, name: 'НЗИС 24 мес.', st: 'CLEAR', txt: '18 изпълнени рецепти + 2 ЕхоКГ НРН' },
        { s: 4, name: 'ЕИСМЕ / НМЕ', st: 'CLEAR', txt: 'Разглеждане 22 мин., коректна НМЕ математика' },
        { s: 5, name: 'НОИ фонд', st: 'CLEAR', txt: 'BG421 BASELINE (индекс 31/99)' },
      ],
      zdoi: null,
    },
    acute_trauma: {
      verdict: 'АВТЕНТИЧЕН',
      cls: 'is-auth',
      catuskoti: 'FIRST (Истина · Имунитет за остра травма)',
      title: '2. Остра травма с реална болнична епикриза (S45.9 / G56.3 · 15 дни)',
      summary: 'Истинска жертва на тежка травма: 0 предходни хронични рецепти за последните 24 мес., диагноза отпреди 15 дни, но с валидна болнична епикриза тип 07 и ЕМГ НРН. Модулът ACUTE_TRAUMA_ONCOLOGY_IMMUNITY защитава пациента от фалшива тревога.',
      probs: { auth: 94.8, fab: 2.6, sys: 2.6 },
      ci: [1.5, 9.6],
      nmeOk: true,
      nmeMsg: 'Водещо травматично увреждане 70% ТНР + обективен ЕМГ протокол + епикриза 07.',
      steps: [
        { s: 1, name: 'Посредник', st: 'CLEAR', txt: 'Локална болнична травматология' },
        { s: 2, name: 'Входен УИН', st: 'CLEAR', txt: '1.1× спрямо нормата' },
        { s: 3, name: 'НЗИС (Остър)', st: 'CLEAR', txt: 'Имунитет по S45.9/G56.3 с валидна 07 епикриза + ЕМГ НРН' },
        { s: 4, name: 'ЕИСМЕ / НМЕ', st: 'CLEAR', txt: '25 мин. заседание · Дефинитивно увреждане' },
        { s: 5, name: 'НОИ фонд', st: 'CLEAR', txt: '0% фалшиви обвинения към реално пострадали' },
      ],
      zdoi: null,
    },
    tampered_pdf: {
      verdict: 'ФАЛШИВ / МАНИПУЛИРАН',
      cls: 'is-fake',
      catuskoti: 'SECOND (Лъжа · Криптографска манипулация)',
      title: '3. Подправен PDF документ (+17 дописани байта след /ByteRange)',
      summary: 'След последния електронен подпис са добавени 17 неоторизирани байта извън подписания диапазон. Клас А улавя нарушението детерминистично със 100% точност.',
      probs: { auth: 0.0, fab: 0.0, sys: 100.0 },
      ci: [99.0, 100.0],
      nmeOk: false,
      nmeMsg: 'КРИПТОГРАФСКИ БЛОК: PDF /ByteRange не покрива 100% от байтовете на файла (trailingBytes = 17).',
      steps: [
        { s: 1, name: 'Посредник', st: 'CLEAR', txt: 'BG421' },
        { s: 2, name: 'Входен УИН', st: 'CLEAR', txt: '1.0×' },
        { s: 3, name: 'НЗИС', st: 'CLEAR', txt: 'Спрян поради невалиден файл' },
        { s: 4, name: 'PAdES /ByteRange', st: 'ANOMALY', txt: 'trailingBytes = 17 > 0 -> ФАЛШИВ' },
        { s: 5, name: 'НОИ плащане', st: 'ANOMALY', txt: 'БЛОКИРАНО ПРЕДИ ОТПУСКАНЕ' },
      ],
      zdoi: 'СИГНАЛ ЗА ПОДПРАВЕН ДОКУМЕНТ (Клас А): Открити са 17 дописани байта след края на подписания PAdES /ByteRange диапазон. Изисква се служебна проверка по чл. 308 НК.',
    },
    preseal_mismatch: {
      verdict: 'ФАЛШИВ / МАНИПУЛИРАН',
      cls: 'is-fake',
      catuskoti: 'SECOND (Лъжа · COMMITMENT_MISMATCH)',
      title: '4. Подменен процент ТНР (50% → 72%) след подаване (Pre-Seal Diff)',
      summary: 'При подаването пациентът е запечатан с Pre-Seal ангажимент за 50% ТНР. В крайния подписан XAdES-BES плик процентът е сменен на 72% (втора група инвалидност).',
      probs: { auth: 0.0, fab: 0.0, sys: 100.0 },
      ci: [99.0, 100.0],
      nmeOk: false,
      nmeMsg: 'COMMITMENT_MISMATCH: expectedTnrPercent = 50%, reportedTnrPercent = 72% (+22% подмяна).',
      steps: [
        { s: 1, name: 'Pre-Seal SHA-256', st: 'ANOMALY', txt: 'Хешът не съвпада с финалното ЕР' },
        { s: 2, name: 'XAdES Digest', st: 'CLEAR', txt: 'Подписът е нов, но нарушава Pre-Seal' },
        { s: 3, name: 'НЗИС', st: 'CLEAR', txt: 'Подменено поле tnrPercent' },
        { s: 4, name: 'ЕИСМЕ', st: 'ANOMALY', txt: 'Прагово групиране на 72%' },
        { s: 5, name: 'НОИ фонд', st: 'ANOMALY', txt: 'Неправомерен скок към 2-ра група' },
      ],
      zdoi: 'ОДИТЕН СИГНАЛ (Pre-Seal Mismatch): Разминаване между входящия Pre-Seal SHA-256 ангажимент (50% ТНР) и крайния документ (72% ТНР).',
    },
    fabricated_healthy: {
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      cls: 'is-susp',
      catuskoti: 'THIRD (Парадокс · Задължителен НЕЛК преглед)',
      title: '5. Фалшива диагноза, написана на здрав човек (I50.0 на 7 дни + 0 рецепти + НМЕ 30%+20%+20%=70%)',
      summary: 'Подписът КЕП е валиден, но ядрото засича едновременно 4 несъвместимости: хронична I50.0 отпреди 7 дни, 0 изпълнени рецепти в НЗИС, 0 обективни ЕхоКГ НРН, незаконно линейно събиране по НМЕ (70% при максимум 38%) и противоречив текст („без оплаквания, нормална ЕхоКГ ФИ 62%“).',
      probs: { auth: 0.3, fab: 96.2, sys: 3.5 },
      ci: [92.1, 100.0],
      nmeOk: false,
      nmeMsg: 'NME_ARITHMETIC_VIOLATION: 30% + 20% + 20% по Приложение № 2, т. III позволяват макс. 38.0%, а не 70.0% (+32.0% незаконна инфлация).',
      steps: [
        { s: 1, name: 'Клин. противоречие', st: 'ANOMALY', txt: '„без оплаквания, ФИ 62%“ при 70% ТНР' },
        { s: 2, name: 'Обективни НРН', st: 'ANOMALY', txt: 'MISSING_OBJECTIVE_EVIDENCE (0 ЕхоКГ/ЕКГ)' },
        { s: 3, name: 'НЗИС Хроника', st: 'ANOMALY', txt: 'I50.0 на 7 дни с 0 изпълнени е-рецепти за 24 мес.' },
        { s: 4, name: 'НМЕ Приложение 2', st: 'ANOMALY', txt: '30%+20%+20% = 70% (нарушение на т. III НМЕ)' },
        { s: 5, name: 'Чл. 22 GDPR / НЕЛК', st: 'ANOMALY', txt: 'Присъствена комисия в друга област + ЗДОИ сигнал' },
      ],
      zdoi: 'ОДИТЕН СИГНАЛ / ЗДОИ (FABRICATED_DIAGNOSIS_RISK + NME_ARITHMETIC_VIOLATION): Статус СЪМНИТЕЛЕН — АНОМАЛИЯ | Zig Tiny-AI p_фалшива=96.2% (95% CI 92.1%–100%). Препоръка по чл. 22 GDPR: присъствен контролен преглед от независим състав на НЕЛК в друга област и представяне на оригинални образни изследвания.',
    },
    gdpr_block: {
      verdict: 'PII_EGRESS_BLOCKED (GDPR чл. 9 Блок)',
      cls: 'is-fake',
      catuskoti: 'SUNYATA / PII GUARD',
      title: '6. Блокиран теч на сурово ЕГН и IBAN преди издаване на Pre-Seal',
      summary: 'В клиничния текст са открити незаличени лични данни (сурово 10-цифрено ЕГН, домашен адрес и IBAN). Системата блокира износа (PII_EGRESS_BLOCKED), занулява буфера в RAM чрез write_volatile и запазва единствено публичните ЕИК/NUTS-3 кодове.',
      probs: { auth: 0.0, fab: 0.0, sys: 100.0 },
      ci: [100.0, 100.0],
      nmeOk: true,
      nmeMsg: 'ЕГН е псевдонимизирано с ефемерен 256-битов CSPRNG HMAC-SHA256 ключ и заличено на 100% от паметта.',
      steps: [
        { s: 1, name: 'ЕГН Zeroize', st: 'ANOMALY', txt: 'Обнаружен 10-цифрен ЕГН -> занулен в RAM' },
        { s: 2, name: 'IBAN / Адрес', st: 'ANOMALY', txt: 'Заличен от локалния PII Scrubber' },
        { s: 3, name: 'Публичен ЕИК', st: 'CLEAR', txt: 'ЕИК и NUTS-3 запазени за одит' },
        { s: 4, name: 'Износ Pre-Seal', st: 'ANOMALY', txt: 'СПРЯН докато текстът не се обезличи' },
        { s: 5, name: 'Облачен пренос', st: 'CLEAR', txt: '0 байта напуснали браузъра' },
      ],
      zdoi: null,
    },
  };

  function renderScenario(key) {
    const out = document.getElementById('telkSimulatorOutput');
    if (!out) return;
    const s = SCENARIOS[key] || SCENARIOS.authentic_plovdiv;
    out.innerHTML = `
      <div class="telk-verdict-box ${esc(s.cls)}">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;">
          <div class="telk-verdict-title">Вердикт: ${esc(s.verdict)}</div>
          <span class="inv-tag ${s.cls === 'is-auth' ? 'tag-ok' : s.cls === 'is-susp' ? 'tag-warn' : 'tag-crit'}">.soul Чатушкоти: ${esc(s.catuskoti)}</span>
        </div>
        <div style="font-weight:700;margin-bottom:4px;">${esc(s.title)}</div>
        <p style="margin:0;font-size:0.88rem;line-height:1.5;">${esc(s.summary)}</p>
      </div>

      <div class="telk-nme-callout ${s.nmeOk ? 'is-ok' : 'is-violation'}">
        <strong>НМЕ / Крипто проверка:</strong> ${esc(s.nmeMsg)}
      </div>

      <div class="telk-ai-meters">
        <div class="telk-ai-card">
          <div>Автентичен профил: <strong>${s.probs.auth.toFixed(1)}%</strong></div>
          <div class="telk-meter-track"><span style="width:${s.probs.auth}%;background:var(--teal);"></span></div>
        </div>
        <div class="telk-ai-card">
          <div>Риск „Фалшива диагноза“: <strong>${s.probs.fab.toFixed(1)}%</strong></div>
          <div class="telk-meter-track"><span style="width:${s.probs.fab}%;background:var(--crimson);"></span></div>
        </div>
        <div class="telk-ai-card">
          <div>НМЕ / Системен риск: <strong>${s.probs.sys.toFixed(1)}%</strong></div>
          <div class="telk-meter-track"><span style="width:${s.probs.sys}%;background:var(--ochre);"></span></div>
        </div>
        <div class="telk-ai-card">
          <div>95% Конформен интервал (Риск):</div>
          <div class="mono" style="font-weight:700;margin-top:4px;">[${s.ci[0].toFixed(1)}% – ${s.ci[1].toFixed(1)}%]</div>
        </div>
      </div>

      <div class="telk-pipe-grid">
        ${s.steps
          .map(
            (st) => `
          <div class="telk-pipe-node ${st.st === 'ANOMALY' ? 'is-anomaly' : 'is-clear'}">
            <strong>Възел ${st.s}: ${esc(st.name)}</strong>
            <div style="margin:4px 0;"><span class="inv-tag ${st.st === 'ANOMALY' ? 'tag-crit' : 'tag-ok'}">${esc(st.st)}</span></div>
            <div>${esc(st.txt)}</div>
          </div>
        `,
          )
          .join('')}
      </div>

      ${s.zdoi ? `<pre class="telk-signal-pre">${esc(s.zdoi)}</pre>` : ''}
    `;
  }

  function evaluateSandbox() {
    const out = document.getElementById('telkSandboxResult');
    if (!out) return;

    const nrn = document.getElementById('sbNrn')?.value || '';
    const traj = document.getElementById('sbTrajectory')?.value || 'chronic';
    const p1 = Number(document.getElementById('sbP1')?.value || 0);
    const p2 = Number(document.getElementById('sbP2')?.value || 0);
    const p3 = Number(document.getElementById('sbP3')?.value || 0);
    const declaredTnr = Number(document.getElementById('sbDeclaredTnr')?.value || 0);
    const ageDays = Number(document.getElementById('sbAgeDays')?.value || 0);
    const rxCount = Number(document.getElementById('sbRxCount')?.value || 0);
    const objCount = Number(document.getElementById('sbObjCount')?.value || 0);
    const hasHosp07 = document.getElementById('sbEpicrisis')?.value === '1';
    const narrType = document.getElementById('sbNarrative')?.value || 'coherent';
    const oblast = document.getElementById('sbOblast')?.value || 'BG421';

    const nrnRes = validateNrnMod11(nrn);
    const nme = calcNmeAnnex2(p1, p2, p3, declaredTnr);
    const isChronic = traj === 'chronic';
    const suddenChronic = isChronic && declaredTnr >= 50 && ageDays < 30;
    const zeroRxChronic = isChronic && declaredTnr >= 50 && rxCount === 0;
    const missingObj = (isChronic && declaredTnr >= 50 && objCount === 0) || (!isChronic && !hasHosp07 && objCount === 0);
    const narrContra = narrType === 'contradiction' && declaredTnr >= 50;
    const critHighOb = oblast === 'BG425' || oblast === 'BG325' || oblast === 'BG313';

    let fabRiskScore = 0.03;
    if (suddenChronic) fabRiskScore += 0.34;
    if (zeroRxChronic) fabRiskScore += 0.32;
    if (missingObj) fabRiskScore += 0.28;
    if (narrContra) fabRiskScore += 0.42;
    if (!isChronic && (hasHosp07 || objCount > 0)) fabRiskScore = 0.03;

    let nmeSysScore = 0.02;
    if (nme.violation) nmeSysScore += Math.min(0.85, 0.45 + nme.delta / 60);
    if (critHighOb && zeroRxChronic) nmeSysScore += 0.15;

    const pFab = Math.min(97.5, Math.round(fabRiskScore * 1000) / 10);
    const pSys = Math.min(96.0, Math.round(nmeSysScore * 1000) / 10);
    const rawAuth = Math.max(1.0, 100 - Math.min(98.5, pFab + pSys));
    const norm = rawAuth + pFab + pSys;
    const authPct = Number(((rawAuth / norm) * 100).toFixed(1));
    const fabPct = Number(((pFab / norm) * 100).toFixed(1));
    const sysPct = Number((100 - authPct - fabPct).toFixed(1));

    const flaggedFabricated = (suddenChronic && (zeroRxChronic || missingObj)) || (zeroRxChronic && missingObj) || narrContra || fabPct >= 65;
    const isSuspicious = nrnRes.valid && (nme.violation || flaggedFabricated || missingObj || sysPct >= 65);

    let verdict = 'АВТЕНТИЧЕН';
    let cls = 'is-auth';
    let catuskoti = 'FIRST (Истина)';
    if (!nrnRes.valid) {
      verdict = 'ФАЛШИВ / МАНИПУЛИРАН (Невалиден НРН)';
      cls = 'is-fake';
      catuskoti = 'SECOND (Лъжа)';
    } else if (isSuspicious) {
      verdict = 'СЪМНИТЕЛЕН — АНОМАЛИЯ';
      cls = 'is-susp';
      catuskoti = 'THIRD (Парадокс · Към независим НЕЛК лекар)';
    }

    const attrs = [];
    if (nme.violation) attrs.push(`Нарушена формула по НМЕ Приложение № 2 (+${nme.delta}% над тавана ${nme.expected}%)`);
    if (suddenChronic) attrs.push(`Внезапна хронична диагноза (${ageDays} дни < 30 дни)`);
    if (zeroRxChronic) attrs.push('0 изпълнени е-рецепти в НЗИС при ТНР ≥ 50%');
    if (missingObj) attrs.push('Липсват обективни инструментални НРН изследвания');
    if (narrContra) attrs.push('Клиничният текст („без оплаквания, ФИ 62%“) противоречи на високия ТНР');
    if (!isChronic && (hasHosp07 || objCount > 0)) attrs.push('Активиран имунитет за остра травма/онкология с валиден 07/ЕМГ документ');
    if (attrs.length === 0) attrs.push('Кохерентна НЗИС терапия и нормативно съответствие по НМЕ');

    const zdoiText = isSuspicious
      ? `ОДИТЕН СИГНАЛ / ЗДОИ: Статус ${verdict}; НРН ${nrn}; Област ${oblast}; Активирани индикатори: ${attrs.join(' | ')}. Препоръка по чл. 22 GDPR: присъствен контролен преглед от независим НЕЛК състав от друга област.`
      : '';

    out.innerHTML = `
      <div class="telk-verdict-box ${cls}">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;">
          <div class="telk-verdict-title">Жив резултат: ${esc(verdict)}</div>
          <span class="inv-tag ${cls === 'is-auth' ? 'tag-ok' : cls === 'is-susp' ? 'tag-warn' : 'tag-crit'}">.soul Чатушкоти: ${esc(catuskoti)}</span>
        </div>
        <div style="font-size:0.86rem;"><strong>НРН проверка:</strong> ${esc(nrnRes.message)}</div>
      </div>

      <div class="telk-nme-callout ${nme.violation ? 'is-violation' : 'is-ok'}">
        <strong>НМЕ Приложение № 2, т. III (ДВ, бр. 10/2023):</strong>
        P<sub>max</sub> (${nme.maxP}%) + 20% от останалите = законов максимум <strong>${nme.expected}%</strong> · Отчетен ТНР: <strong>${declaredTnr}%</strong>
        ${nme.violation ? ` -> <span class="inv-tag tag-crit">NME_ARITHMETIC_VIOLATION (+${nme.delta}%)</span>` : ' -> <span class="inv-tag tag-ok">Съответства</span>'}
      </div>

      <div class="telk-ai-meters">
        <div class="telk-ai-card">
          <div>Автентичен: <strong>${authPct}%</strong></div>
          <div class="telk-meter-track"><span style="width:${authPct}%;background:var(--teal);"></span></div>
        </div>
        <div class="telk-ai-card">
          <div>Риск „Фалшива диагноза“: <strong>${fabPct}%</strong></div>
          <div class="telk-meter-track"><span style="width:${fabPct}%;background:var(--crimson);"></span></div>
        </div>
        <div class="telk-ai-card">
          <div>НМЕ / Системен риск: <strong>${sysPct}%</strong></div>
          <div class="telk-meter-track"><span style="width:${sysPct}%;background:var(--ochre);"></span></div>
        </div>
      </div>

      <div style="font-size:0.85rem;">
        <strong>Обясними фактори (Zig Tiny-AI &amp; НМЕ):</strong>
        <ul style="margin:6px 0 0 18px;">
          ${attrs.map((a) => `<li>${esc(a)}</li>`).join('')}
        </ul>
      </div>

      ${zdoiText ? `<pre class="telk-signal-pre">${esc(zdoiText)}</pre>` : ''}
    `;
  }

  function setupRadarTableFilter() {
    const searchEl = document.getElementById('telkRadarSearch');
    const tierEl = document.getElementById('telkRadarTierFilter');
    const tbody = document.getElementById('telkRadarTbody');
    if (!searchEl || !tierEl || !tbody) return;

    const filterRows = () => {
      const q = searchEl.value.trim().toLowerCase();
      const tier = tierEl.value;
      const rows = tbody.querySelectorAll('tr');
      for (const tr of rows) {
        const text = tr.textContent.toLowerCase();
        const matchQ = !q || text.includes(q);
        const matchTier = tier === 'ALL' || tr.children[2]?.textContent.trim() === tier;
        tr.style.display = matchQ && matchTier ? '' : 'none';
      }
    };

    searchEl.addEventListener('input', filterRows);
    tierEl.addEventListener('change', filterRows);
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      applyTheme(localStorage.getItem('sigma3_theme') || 'light');
    } catch {
      applyTheme('light');
    }

    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
      });
    }

    const scnBar = document.getElementById('telkScenarioBar');
    if (scnBar) {
      scnBar.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-scn]');
        if (!btn) return;
        for (const b of scnBar.querySelectorAll('[data-scn]')) b.classList.remove('active');
        btn.classList.add('active');
        renderScenario(btn.getAttribute('data-scn'));
      });
    }
    renderScenario('authentic_plovdiv');

    for (const id of [
      'sbNrn',
      'sbTrajectory',
      'sbP1',
      'sbP2',
      'sbP3',
      'sbDeclaredTnr',
      'sbAgeDays',
      'sbRxCount',
      'sbObjCount',
      'sbEpicrisis',
      'sbNarrative',
      'sbOblast',
    ]) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', evaluateSandbox);
        el.addEventListener('change', evaluateSandbox);
      }
    }
    evaluateSandbox();
    setupRadarTableFilter();
  });
})();
