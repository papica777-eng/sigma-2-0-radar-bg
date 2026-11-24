/* ============================================================================
 * NAsvetlo · еЗдраве (НЗИС) Прототип — Публична демонстрация (Zero-Cloud / 0 PII)
 * Без излагане на затворения Rust/Zig/Mojo производствен код.
 * ========================================================================== */
(function () {
  'use strict';

  const CASES = [
    {
      id: 'CASE_AUTH_01_PRODROMOV',
      cohort: 'AUTHENTIC',
      erNumber: 'ЕР № 2610-1404-3985',
      erDate: '14.10.2026 г.',
      telkCommission: 'ТЕЛК — УМБАЛ Бургас (I състав)',
      patientPseudonym: 'HMAC-SHA256: 9f4a…c21e (ЕГН занулено в RAM)',
      oblastCode: 'BG341',
      oblastName: 'Бургас',
      titleBg: 'Остра тежка невро-съдова травма (G56.3 · n. radialis)',
      sourceEvidenceBg:
        'УМБАЛ Бургас ИЗ № 16844/2023 г. по КП P124, СМЕ № 204/2024 г. д-р Галина Милева, Направление НРН 261014043985, Амб. лист НРН 261014043703',
      icd10: 'G56.3',
      icd10LabelBg: 'Увреждане на лъчевия нерв (n. radialis), S45.9, I73.9, L02.4',
      tnrPct: 70,
      validityTermBg: 'Пожизнено',
      elapsedMs: 26.12,
      verdict: 'АВТЕНТИЧЕН',
      catuskotiState: 'FIRST',
      trajectoryLabelBg: 'Остра травма / съдова увреда (имунитет срещу хроничен филтър)',
      pAuthentic: 0.9953,
      pFabricatedDiagnosis: 0.0021,
      pSystemicOrNmeInflation: 0.0026,
      ci95Lower: 0,
      ci95Upper: 0.0432,
      rxCount24m: 6,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 72,
        message: 'Съответствие с Приложение № 2, т. III НМЕ: изчислен таван 72.0% (от 4 увреждания), отчетен ТНР 70.0%.',
      },
      flags: [],
      exams: [
        { nrn: '261014043703', type: 'X001', date: '14.10.2026', facility: 'ДКЦ — Бургас (Неврология)', summary: 'Персистираща пареза на n. radialis, сензорен и моторен дефицит.', ok: true },
        { nrn: '261014043985', type: 'R001', date: '14.10.2026', facility: 'Медицинско направление за ТЕЛК', summary: 'Насочване към ТЕЛК с приложена СМЕ № 204/2024 г. и ИЗ № 16844.', ok: true },
      ],
      hospitals: [
        { nrn: '230828075049', period: '28.08.2023 – 04.09.2023', hospital: 'УМБАЛ Бургас АД', kp: 'КП P124 · ИЗ № 16844/2023', summary: 'Артериален кръвоизлив, хемоглобин 71 g/L, трансфузия, травматична увреда на n. radialis.', simhash: 'UNIQUE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: '240615091124', date: '15.06.2024', desc: 'ЕМГ + СМЕ № 204/2024 г. — обективно потвърдена аксонотмеза.', ok: true },
        { cat: 'Е-Рецепта (P001)', nrn: '260901014412', date: '01.09.2026', desc: 'Невротропна и съдова поддържаща терапия (6 изпълнени рецепти в НЗИС).', ok: true },
      ],
      pkCategory: 'Няма основание за сигнал — досието е напълно валидирано.',
    },
    {
      id: 'CASE_AUTH_02_KICHUKOV',
      cohort: 'AUTHENTIC',
      erNumber: 'ЕР № 2608-2819-8011',
      erDate: '19.08.2026 г.',
      telkCommission: 'ТЕЛК — Бургас (Онкологичен профил)',
      patientPseudonym: 'HMAC-SHA256: 4b81…7d09 (ЕГН занулено в RAM)',
      oblastCode: 'BG341',
      oblastName: 'Бургас',
      titleBg: 'Онкологично досие: Карцином на колон десценденс (C18.6)',
      sourceEvidenceBg: 'МБАЛ „Сърце и Мозък“ Бургас, И.З. № 28198/2026 г., Хистология блокче № 12625/26 (G2 аденокарцином 8140/3), КТ стадиране',
      icd10: 'C18.6',
      icd10LabelBg: 'Злокачествено новообразувание на колон десценденс (G2, 8140/3)',
      tnrPct: 75,
      validityTermBg: '3 години (онкологичен режим)',
      elapsedMs: 7.65,
      verdict: 'АВТЕНТИЧЕН',
      catuskotiState: 'FIRST',
      trajectoryLabelBg: 'Онкологична траектория (имунитет по C00–C97)',
      pAuthentic: 0.9953,
      pFabricatedDiagnosis: 0.0021,
      pSystemicOrNmeInflation: 0.0026,
      ci95Lower: 0,
      ci95Upper: 0.0432,
      rxCount24m: 12,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 87,
        message: 'Съответствие с Приложение № 2, т. III НМЕ: изчислен таван 87.0% (от 4 увреждания), отчетен ТНР 75.0%.',
      },
      flags: [],
      exams: [
        { nrn: '260805031204', type: 'X001', date: '05.08.2026', facility: 'Онкологична комисия — Бургас', summary: 'Решение на клинична онкологична комисия за адювантна терапия.', ok: true },
      ],
      hospitals: [
        { nrn: '260722074418', period: '22.07.2026 – 30.07.2026', hospital: 'МБАЛ „Сърце и Мозък“ — Бургас', kp: 'ИЗ № 28198/2026', summary: 'Резекция на колон десценденс, постоперативен статус без усложнения.', simhash: 'UNIQUE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: '260728088310', date: '28.07.2026', desc: 'Хистология блокче № 12625/26 — G2 аденокарцином (8140/3) + КТ стадиране.', ok: true },
        { cat: 'Е-Рецепта (P001)', nrn: '260811019920', date: '11.08.2026', desc: 'Онкологични и симптоматични медикаменти (12 изпълнени рецепти).', ok: true },
      ],
      pkCategory: 'Няма основание за сигнал — досието е напълно валидирано.',
    },
    {
      id: 'CASE_AUTH_03_DIALYSIS',
      cohort: 'AUTHENTIC',
      erNumber: 'ЕР № 2605-1102-9841',
      erDate: '12.05.2026 г.',
      telkCommission: 'ТЕЛК — Пловдив (Вътрешни болести)',
      patientPseudonym: 'HMAC-SHA256: 7c02…aa91 (ЕГН занулено в RAM)',
      oblastCode: 'BG421',
      oblastName: 'Пловдив',
      titleBg: 'Хронична бъбречна недостатъчност V ст. на хемодиализа (N18.5)',
      sourceEvidenceBg: 'Амбулаторна процедура № 38 (Хемодиализа) — 156 диализни сесии за 12 мес., креатинин 780 μmol/L, АВ фистула',
      icd10: 'N18.5',
      icd10LabelBg: 'Хронична бъбречна болест, 5-ти стадий (терминална)',
      tnrPct: 100,
      validityTermBg: 'Пожизнено с чужда помощ',
      elapsedMs: 8.33,
      verdict: 'АВТЕНТИЧЕН',
      catuskotiState: 'FIRST',
      trajectoryLabelBg: 'Хронично проследяване (доказана 24-месечна НЗИС история)',
      pAuthentic: 0.9909,
      pFabricatedDiagnosis: 0.0045,
      pSystemicOrNmeInflation: 0.0046,
      ci95Lower: 0,
      ci95Upper: 0.0481,
      rxCount24m: 48,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 100,
        message: 'Съответствие с Приложение № 2, т. III НМЕ: изчислен таван 100.0% (от 3 увреждания), отчетен ТНР 100.0%.',
      },
      flags: [],
      exams: [
        { nrn: '260502031900', type: 'X001', date: '02.05.2026', facility: 'Клиника по диализно лечение — Пловдив', summary: 'АПр № 38 — 156 сесии/год., функционираща АВ фистула.', ok: true },
      ],
      hospitals: [
        { nrn: '251114072301', period: '14.11.2025 – 21.11.2025', hospital: 'УМБАЛ „Св. Георги“ — Пловдив', kp: 'КП Нефрология', summary: 'Конструиране и ревизия на артериовенозна фистула.', simhash: 'UNIQUE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: '260501081115', date: '01.05.2026', desc: 'Креатинин 780 μmol/L, eGFR < 9 mL/min.', ok: true },
        { cat: 'Е-Рецепта (P001)', nrn: '260504017782', date: '04.05.2026', desc: '48 изпълнени НЗОК рецепти за 24 мес.', ok: true },
      ],
      pkCategory: 'Няма основание за сигнал — досието е напълно валидирано.',
    },
    {
      id: 'CASE_AUTH_04_POST_MI',
      cohort: 'AUTHENTIC',
      erNumber: 'ЕР № 2604-8820-4412',
      erDate: '08.04.2026 г.',
      telkCommission: 'ТЕЛК — София-град (Кардиология)',
      patientPseudonym: 'HMAC-SHA256: 2e19…8f40 (ЕГН занулено в RAM)',
      oblastCode: 'BG411',
      oblastName: 'София (столица)',
      titleBg: 'Пост-инфарктно състояние с LAD стент и ФИ 36% (I25.1)',
      sourceEvidenceBg: 'УМБАЛ „Св. Екатерина“ София, инвазивна КАГ, поставен DES стент в LAD, ЕхоКГ ФИ 36%',
      icd10: 'I25.1',
      icd10LabelBg: 'Атеросклеротична болест на сърцето, пост-ОМИ, СН NYHA III',
      tnrPct: 75,
      validityTermBg: '3 години',
      elapsedMs: 7.97,
      verdict: 'АВТЕНТИЧЕН',
      catuskotiState: 'FIRST',
      trajectoryLabelBg: 'Хронично проследяване с инвазивна КАГ и ЕхоКГ',
      pAuthentic: 0.9909,
      pFabricatedDiagnosis: 0.0045,
      pSystemicOrNmeInflation: 0.0046,
      ci95Lower: 0,
      ci95Upper: 0.0482,
      rxCount24m: 24,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 87,
        message: 'Съответствие с Приложение № 2, т. III НМЕ: изчислен таван 87.0% (от 3 увреждания), отчетен ТНР 75.0%.',
      },
      flags: [],
      exams: [
        { nrn: '260329031102', type: 'X001', date: '29.03.2026', facility: 'УМБАЛ „Св. Екатерина“ — ДКБ', summary: 'ЕхоКГ: LVEF 36%, предно-септална хипокинезия, NYHA III.', ok: true },
      ],
      hospitals: [
        { nrn: '250910076643', period: '10.09.2025 – 17.09.2025', hospital: 'УМБАЛ „Св. Екатерина“ — София', kp: 'КП Интервенционална кардиология', summary: 'ОМИ с ST-елевация, ангиопластика и DES стентиране на проксимална LAD.', simhash: 'UNIQUE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: '250910085109', date: '10.09.2025', desc: 'Инвазивна коронарография (КАГ) + NT-proBNP 2450 pg/mL.', ok: true },
        { cat: 'Е-Рецепта (P001)', nrn: '260401012233', date: '01.04.2026', desc: 'Двойна антиагрегантна терапия, ARNI, SGLT2i (24 рецепти).', ok: true },
      ],
      pkCategory: 'Няма основание за сигнал — досието е напълно валидирано.',
    },
    {
      id: 'CASE_AUTH_05_AMPUTATION',
      cohort: 'AUTHENTIC',
      erNumber: 'ЕР № 2606-5501-2109',
      erDate: '21.06.2026 г.',
      telkCommission: 'ТЕЛК — Русе (Ортопедия)',
      patientPseudonym: 'HMAC-SHA256: 6a3d…11b4 (ЕГН занулено в RAM)',
      oblastCode: 'BG323',
      oblastName: 'Русе',
      titleBg: 'Травматична ампутация на подбедрица след трудова злополука (S88.1)',
      sourceEvidenceBg: 'МБАЛ – Русе, Оперативен протокол за ампутация на ниво средна трета на дясна подбедрица, контролен рентген',
      icd10: 'S88.1',
      icd10LabelBg: 'Травматична ампутация между коляното и глезена',
      tnrPct: 60,
      validityTermBg: 'Пожизнено',
      elapsedMs: 6.73,
      verdict: 'АВТЕНТИЧЕН',
      catuskotiState: 'FIRST',
      trajectoryLabelBg: 'Остра травматична увреда (S00–T98 имунитет)',
      pAuthentic: 0.9952,
      pFabricatedDiagnosis: 0.0021,
      pSystemicOrNmeInflation: 0.0026,
      ci95Lower: 0,
      ci95Upper: 0.0433,
      rxCount24m: 3,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 60,
        message: 'Съответствие с Приложение № 2, т. III НМЕ: изчислен таван 60.0% (от 1 увреждания), отчетен ТНР 60.0%.',
      },
      flags: [],
      exams: [
        { nrn: '260612031774', type: 'X001', date: '12.06.2026', facility: 'МБАЛ — Русе (Ортопедия)', summary: 'Зараснал ампутационен чукан, насочен за протезиране.', ok: true },
      ],
      hospitals: [
        { nrn: '260502073119', period: '02.05.2026 – 18.05.2026', hospital: 'УМБАЛ Канев — Русе', kp: 'КП Травматология', summary: 'Оперативен протокол: ампутация на дясна подбедрица.', simhash: 'UNIQUE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: '260516089912', date: '16.05.2026', desc: 'Контролна рентгенография след ампутация.', ok: true },
      ],
      pkCategory: 'Няма основание за сигнал — досието е напълно валидирано.',
    },
    {
      id: 'CASE_FRAUD_06_KARDZHALI_SILISTRA',
      cohort: 'FRAUDULENT_ANNULLED',
      erNumber: 'ЕР № 2602-9914-0072',
      erDate: '11.02.2026 г.',
      telkCommission: 'ТЕЛК — Силистра / Кърджали (Аномален клъстер)',
      patientPseudonym: 'HMAC-SHA256: e10f…33c8 (ЕГН занулено в RAM)',
      oblastCode: 'BG325',
      oblastName: 'Силистра (адрес Варна)',
      titleBg: 'Схема „Фиктивна хипертония и ретинопатия без терапия“ (I10)',
      sourceEvidenceBg: 'Реална съдебна практика на Адм. съд и отмяна от НЕЛК: адрес във Варна, подава в Силистра, 0 лекарства за 24 мес., диагноза от 14 дни',
      icd10: 'I10',
      icd10LabelBg: 'Есенциална (първична) хипертония + декларирана ретинопатия',
      tnrPct: 72,
      validityTermBg: '3 години (ЗАСЕЧЕНА АНОМАЛИЯ)',
      elapsedMs: 9.11,
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      catuskotiState: 'THIRD',
      trajectoryLabelBg: 'Хронична диагноза без предходна НЗИС проследимост (<14 дни)',
      pAuthentic: 0.0,
      pFabricatedDiagnosis: 0.9988,
      pSystemicOrNmeInflation: 0.0012,
      ci95Lower: 0.9619,
      ci95Upper: 1.0,
      rxCount24m: 0,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 60,
        message: 'NME_ARITHMETIC_VIOLATION: Отчетен ТНР 72.0% надвишава с +12.0% максимума 60.0% по Приложение № 2, т. III НМЕ.',
      },
      flags: [
        { code: 'NME_ARITHMETIC_VIOLATION', msg: 'Отчетен ТНР 72.0% надвишава с +12.0% максимума 60.0% по Приложение № 2, т. III НМЕ.' },
        { code: 'MISSING_OBJECTIVE_EVIDENCE', msg: 'Заявен ≥50% ТНР без приложени валидни НРН на ЕКГ, ЕхоКГ или епикриза.' },
        { code: 'NARRATIVE_CLINICAL_CONTRADICTION', msg: 'Текстът съдържа „без оплаквания“, „нормална ЕКГ“ в противоречие с 72% ТНР.' },
        { code: 'FABRICATED_DIAGNOSIS_RISK', msg: 'Zig Tiny-AI p=99.9% (95% CI 96.2%–100%): Внезапна хронична I10 с 0 рецепти. Задължителен присъствен преглед в НЕЛК.' },
      ],
      exams: [
        { nrn: '260128039901', type: 'X001', date: '28.01.2026', facility: 'Кабинет извън областта (медицински туризъм)', summary: 'Първи запис преди 14 дни; „без оплаквания, нормална ЕКГ“.', ok: false },
      ],
      hospitals: [
        { nrn: 'ЛИПСВА НРН', period: '0 хоспитализации за 24 мес.', hospital: 'Няма данни в НЗИС', kp: '—', summary: 'Отсъства болнична епикриза (тип 07) въпреки 72% ТНР.', simhash: 'NONE' },
      ],
      rxlabs: [
        { cat: 'Е-Рецепта (P001)', nrn: '0 ЗАПИСА', date: '2024–2026', desc: '0 изпълнени антихипертензивни рецепти по НЗОК за 24 месеца.', ok: false },
        { cat: 'Инструментално/Лаб. изследване', nrn: 'ЛИПСВА НРН', date: '—', desc: 'Липсва обективно ЕхоКГ и фундоскопия.', ok: false },
      ],
      pkCategory: 'Фиктивна диагноза без НЗИС история и нарушена формула по НМЕ',
    },
    {
      id: 'CASE_FRAUD_07_ARITHMETIC_INFLATION',
      cohort: 'FRAUDULENT_ANNULLED',
      erNumber: 'ЕР № 2603-4410-0075',
      erDate: '04.03.2026 г.',
      telkCommission: 'ТЕЛК — Регионален състав (Отменено от ВАС)',
      patientPseudonym: 'HMAC-SHA256: c49a…7701 (ЕГН занулено в RAM)',
      oblastCode: 'BG412',
      oblastName: 'София (област)',
      titleBg: 'Схема „Незаконно линейно сумиране 30%+30%+15%=75%“ (M54.5)',
      sourceEvidenceBg: 'Решение на Адм. съд: ТЕЛК незаконосъобразно събира 30% + 30% + 15% = 75% ТНР (законов таван: 39.0%)',
      icd10: 'M54.5',
      icd10LabelBg: 'Болка ниско в гърба (лумбаго) + 2 леки съпътстващи диагнози',
      tnrPct: 75,
      validityTermBg: '3 години (ЗАСЕЧЕНА АРИТМЕТИЧНА ИЗМАМА)',
      elapsedMs: 6.57,
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      catuskotiState: 'THIRD',
      trajectoryLabelBg: 'Хронична диагноза с незаконна линейна сума по НМЕ',
      pAuthentic: 0.0108,
      pFabricatedDiagnosis: 0.0482,
      pSystemicOrNmeInflation: 0.941,
      ci95Lower: 0.946,
      ci95Upper: 1.0,
      rxCount24m: 4,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 39,
        message: 'NME_ARITHMETIC_VIOLATION: Отчетен ТНР 75.0% надвишава с +36.0% максимума 39.0% по Приложение № 2, т. III НМЕ.',
      },
      flags: [
        { code: 'NME_ARITHMETIC_VIOLATION', msg: 'Отчетен ТНР 75.0% надвишава с +36.0% законовия таван 39.0% (вероятна незаконна линейна сума).' },
      ],
      exams: [
        { nrn: '260220031411', type: 'X001', date: '20.02.2026', facility: 'МЦ — София-област', summary: '3 леки увреждания (30%, 30%, 15%), сумирани линейно до 75%.', ok: false },
      ],
      hospitals: [
        { nrn: 'ЛИПСВА НРН', period: '0 хоспитализации', hospital: 'Няма болничен престой', kp: '—', summary: 'Липсва оперативно или стационарно лечение.', simhash: 'NONE' },
      ],
      rxlabs: [
        { cat: 'Е-Рецепта (P001)', nrn: '260115013344', date: '15.01.2026', desc: 'НСПВС обезболяващи (4 рецепти за 24 мес.).', ok: true },
      ],
      pkCategory: 'Незаконно изчислен % ТНР в нарушение на Приложение № 2 НМЕ',
    },
    {
      id: 'CASE_FRAUD_08_CLONED_TEMPLATE',
      cohort: 'FRAUDULENT_ANNULLED',
      erNumber: 'ЕР № 2601-7741-0071',
      erDate: '19.01.2026 г.',
      telkCommission: 'ТЕЛК — Варна / Шумен (ОПГ разследване)',
      patientPseudonym: 'HMAC-SHA256: b310…99fa (ЕГН занулено в RAM)',
      oblastCode: 'BG331',
      oblastName: 'Варна / Шумен',
      titleBg: 'Схема „Клонирана епикриза от брокер без ЕМГ“ (G54.1)',
      sourceEvidenceBg: 'Обвинителен акт по чл. 311 и 321 НК: клониран текст на епикриза (Zig 64-bit SimHash > 92%), липсващо апаратно ЕМГ',
      icd10: 'G54.1',
      icd10LabelBg: 'Увреждания на поясно-кръстцовия сплит',
      tnrPct: 71,
      validityTermBg: '3 години (ЗАСЕЧЕН КЛОНИНГ)',
      elapsedMs: 9.39,
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      catuskotiState: 'THIRD',
      trajectoryLabelBg: 'Общ профил с клониран текст (SimHash Hamming ≤ 6)',
      pAuthentic: 0.0007,
      pFabricatedDiagnosis: 0.9456,
      pSystemicOrNmeInflation: 0.0537,
      ci95Lower: 0.9572,
      ci95Upper: 1.0,
      rxCount24m: 0,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 66,
        message: 'NME_ARITHMETIC_VIOLATION: Отчетен ТНР 71.0% надвишава с +5.0% максимума 66.0% по Приложение № 2, т. III НМЕ.',
      },
      flags: [
        { code: 'TEMPLATE_CLONE_SIMHASH', msg: '64-битовият Zig SimHash засече почти идентичен шаблон на епикриза (Hamming ≤ 6) спрямо предишни досиета.' },
        { code: 'NME_ARITHMETIC_VIOLATION', msg: 'Отчетен ТНР 71.0% надвишава с +5.0% максимума 66.0% по НМЕ.' },
        { code: 'NARRATIVE_CLINICAL_CONTRADICTION', msg: 'Текстът съдържа „без оплаквания“, „запазена походка“, „ФИ 62%“ в противоречие с 71% ТНР.' },
      ],
      exams: [
        { nrn: '260110034455', type: 'X001', date: '10.01.2026', facility: 'Частен кабинет (разследвана група)', summary: 'Шаблонен текст без приложена оригинална ЕМГ крива.', ok: false },
      ],
      hospitals: [
        { nrn: '260112078899', period: '12.01.2026 – 13.01.2026', hospital: 'Спорна епикриза (SimHash клонинг)', kp: 'Клониран шаблон', summary: '94% лексикално съвпадение с други 17 досиета от същия УИН.', simhash: 'CLONE_DETECTED' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: 'ЛИПСВА ЕМГ', date: '—', desc: 'Липсва апаратна електромиография (ЕМГ) в НЗИС.', ok: false },
      ],
      pkCategory: 'Клонирана медицинска документация (SimHash) и липсващо ЕМГ',
    },
    {
      id: 'CASE_FRAUD_09_SUDDEN_PSYCH',
      cohort: 'FRAUDULENT_ANNULLED',
      erNumber: 'ЕР № 2602-3309-0080',
      erDate: '22.02.2026 г.',
      telkCommission: 'ТЕЛК — Психиатричен профил (Отменено от НЕЛК)',
      patientPseudonym: 'HMAC-SHA256: 8f9c…004d (ЕГН занулено в RAM)',
      oblastCode: 'BG425',
      oblastName: 'Кърджали',
      titleBg: 'Схема „Внезапна шизофрения на 45 г. без хоспитализация“ (F20.0)',
      sourceEvidenceBg: 'Проверка на НЕЛК: F20.0 въведена преди 18 дни, 0 дни в ЦПЗ, 0 антипсихотици, преглед за 2 минути',
      icd10: 'F20.0',
      icd10LabelBg: 'Параноидна шизофрения (декларирана внезапно на 45 г.)',
      tnrPct: 80,
      validityTermBg: '3 години (ЗАСЕЧЕНА АНОМАЛИЯ)',
      elapsedMs: 7.23,
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      catuskotiState: 'THIRD',
      trajectoryLabelBg: 'Хронична психиатрична диагноза без ЦПЗ/НЗИС проследимост',
      pAuthentic: 0.0,
      pFabricatedDiagnosis: 1.0,
      pSystemicOrNmeInflation: 0.0,
      ci95Lower: 0.962,
      ci95Upper: 1.0,
      rxCount24m: 0,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 80,
        message: 'Аритметично съответствие (1 диагноза 80%), но 100% риск от фиктивна диагноза по клинико-терапевтичен одит.',
      },
      flags: [
        { code: 'MISSING_OBJECTIVE_EVIDENCE', msg: '80% ТНР без нито един стационарен престой в ЦПЗ или диспансерно досие.' },
        { code: 'NARRATIVE_CLINICAL_CONTRADICTION', msg: 'Текстът съдържа „клинично здрав“, „нормален статус“ в противоречие с 80% ТНР.' },
        { code: 'FABRICATED_DIAGNOSIS_RISK', msg: 'Zig Tiny-AI p=100.0%: Внезапна F20.0 на 18 дни с 2-минутен уикенд преглед и 0 рецепти.' },
      ],
      exams: [
        { nrn: '260204037710', type: 'X001', date: '04.02.2026 (събота, 2 мин.)', facility: 'Извънболничен кабинет', summary: 'Въведена F20.0 преди 18 дни без предходна анамнеза.', ok: false },
      ],
      hospitals: [
        { nrn: '0 ПРЕСТОЯ', period: '0 дни в ЦПЗ / психиатрия', hospital: 'Няма данни в НЗИС', kp: '—', summary: 'Липсва хоспитализация или диспансерен протокол.', simhash: 'NONE' },
      ],
      rxlabs: [
        { cat: 'Е-Рецепта (P001)', nrn: '0 ЗАПИСА', date: '2024–2026', desc: '0 изпълнени рецепти за антипсихотици по НЗОК.', ok: false },
      ],
      pkCategory: 'Фиктивна психиатрична диагноза без хоспитализация и терапия',
    },
    {
      id: 'CASE_FRAUD_10_FAKE_BLINDNESS',
      cohort: 'FRAUDULENT_ANNULLED',
      erNumber: 'ЕР № 2601-6620-0095',
      erDate: '15.01.2026 г.',
      telkCommission: 'ТЕЛК — Очни болести (Разследване Прокуратура/ДАНС)',
      patientPseudonym: 'HMAC-SHA256: 5d77…e902 (ЕГН занулено в RAM)',
      oblastCode: 'BG324',
      oblastName: 'Разград',
      titleBg: 'Схема „Фиктивна двустранна слепота без периметрия и VEP“ (H54.0)',
      sourceEvidenceBg: 'Специализирано разследване: 95% ТНР с чужда помощ (слепота), докато лицето шофира; липсват периметрия и VEP',
      icd10: 'H54.0',
      icd10LabelBg: 'Слепота на двете очи (декларирана без обективен VEP)',
      tnrPct: 95,
      validityTermBg: 'Пожизнено с чужда помощ (ЗАСЕЧЕНА АНОМАЛИЯ)',
      elapsedMs: 8.46,
      verdict: 'СЪМНИТЕЛЕН — АНОМАЛИЯ',
      catuskotiState: 'THIRD',
      trajectoryLabelBg: 'Високорисков профил без компютърна периметрия и VEP',
      pAuthentic: 0.0485,
      pFabricatedDiagnosis: 0.689,
      pSystemicOrNmeInflation: 0.2625,
      ci95Lower: 0.8865,
      ci95Upper: 1.0,
      rxCount24m: 0,
      nme: {
        formula: 'P_НМЕ = min(100%, P_max + 20% × ΣP_съпътстващи) — Приложение № 2, т. III НМЕ (ДВ, бр. 10/2023)',
        expected: 95,
        message: 'Аритметично съответствие (95%), но комбинирана AI вероятност за аномалия 95.2% поради липса на VEP.',
      },
      flags: [
        { code: 'NARRATIVE_CLINICAL_CONTRADICTION', msg: 'Текстът съдържа „в референтни граници“, „без отклонения“ в противоречие с 95% ТНР.' },
        { code: 'FABRICATED_DIAGNOSIS_RISK', msg: 'Комбинирана вероятност за аномалия 95.2%: липсват компютърна периметрия и VEP.' },
      ],
      exams: [
        { nrn: '260108031199', type: 'X001', date: '08.01.2026', facility: 'Очен кабинет (без VEP апаратура)', summary: 'Субективна зрителна острота 0.02, но бележка „в референтни граници“.', ok: false },
      ],
      hospitals: [
        { nrn: 'ЛИПСВА НРН', period: '0 хоспитализации', hospital: 'Няма данни в НЗИС', kp: '—', summary: 'Липсва очна клиника или невроофталмологичен престой.', simhash: 'NONE' },
      ],
      rxlabs: [
        { cat: 'Инструментално/Лаб. изследване', nrn: 'ЛИПСВА VEP', date: '—', desc: 'Липсват компютърна периметрия и VEP.', ok: false },
        { cat: 'Е-Рецепта (P001)', nrn: '0 ЗАПИСА', date: '2024–2026', desc: '0 изпълнени офталмологични рецепти за 24 месеца.', ok: false },
      ],
      pkCategory: 'Липсващо обективно изследване (VEP/периметрия) при 95% ТНР',
    },
  ];

  const state = {
    filter: 'ALL',
    view: 'desktop',
    tab: 'audit',
    selectedId: CASES[0].id,
    lastPayloadJson: '',
    lastProtocolId: '',
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pct(v) {
    return (Number(v || 0) * 100).toFixed(1) + '%';
  }

  function currentCase() {
    return CASES.find((c) => c.id === state.selectedId) || CASES[0];
  }

  function renderList() {
    const listEl = document.getElementById('ezCaseList');
    const headingEl = document.getElementById('ezListHeading');
    if (!listEl) return;

    const items = state.filter === 'ALL' ? CASES : CASES.filter((c) => c.cohort === state.filter);
    if (headingEl) headingEl.textContent = 'Верифицирани досиета (' + items.length + ')';

    listEl.innerHTML = items
      .map((item) => {
        const isSel = item.id === state.selectedId;
        const ok = item.verdict === 'АВТЕНТИЧЕН';
        return (
          '<button type="button" class="ez-case-btn' +
          (isSel ? ' is-selected' : '') +
          '" data-ez-case="' +
          esc(item.id) +
          '">' +
          '<div class="ez-case-btn__top">' +
          '<span class="ez-case-btn__icd">' +
          esc(item.icd10) +
          ' · ' +
          item.tnrPct +
          '%</span>' +
          '<span class="ez-pill ' +
          (ok ? 'ez-pill--ok' : 'ez-pill--danger') +
          '">' +
          (ok ? 'Автентичен' : 'Аномалия') +
          '</span></div>' +
          '<p class="ez-case-btn__title">' +
          esc(item.titleBg) +
          '</p>' +
          '<div class="ez-case-btn__meta"><span>' +
          esc(item.oblastName) +
          '</span><span>' +
          item.elapsedMs.toFixed(1) +
          ' ms</span></div></button>'
        );
      })
      .join('');
  }

  function renderTabBody(c) {
    const isAnomaly = c.verdict !== 'АВТЕНТИЧЕН';
    if (state.tab === 'audit') {
      const flagsHtml =
        c.flags.length > 0
          ? '<div class="ez-card"><h3>Засечени криминалистични и клинични флагове</h3><ul class="ez-flag-list">' +
            c.flags.map((f) => '<li><code>[' + esc(f.code) + ']</code> ' + esc(f.msg) + '</li>').join('') +
            '</ul></div>'
          : '';
      return (
        '<div class="ez-verdict-box ' +
        (isAnomaly ? 'ez-verdict-box--danger' : 'ez-verdict-box--ok') +
        '"><div><h3 class="ez-verdict-box__title">' +
        (isAnomaly
          ? 'ЗАСЕЧЕНО НЕСЪОТВЕТСТВИЕ (' + c.flags.length + ' флага) — Препоръчан триаж към НЕЛК'
          : 'АВТЕНТИЧНО ЕКСПЕРТНО РЕШЕНИЕ — Потвърдено криптографски и клинично') +
        '</h3><p class="ez-verdict-box__desc">Двигател: <strong>ZIG_0_15_2_SIMD_WASM</strong> · Време: <strong>' +
        c.elapsedMs.toFixed(2) +
        ' ms</strong> · 95% CI: <strong>[' +
        pct(c.ci95Lower) +
        ' – ' +
        pct(c.ci95Upper) +
        ']</strong></p></div>' +
        '<button type="button" class="' +
        (isAnomaly ? 'ez-btn-control' : 'ez-btn-secondary') +
        '" data-ez-open-pk="1">' +
        (isAnomaly ? 'Подай сигнал по реда на „Публичен контрол“' : 'Преглед на модул „Публичен контрол“') +
        '</button></div>' +
        '<div class="ez-card"><h3>Оценка на Zig 0.15.2 Int8 Tiny-AI (Чатушкоти: ' +
        esc(c.catuskotiState) +
        ')</h3><div class="ez-prob-grid">' +
        '<div class="ez-prob-bar"><div class="ez-prob-bar__head"><span>Автентичност</span><strong>' +
        pct(c.pAuthentic) +
        '</strong></div><div class="ez-prob-bar__track"><div class="ez-prob-bar__fill ez-prob-bar__fill--ok" style="width:' +
        Math.max(2, c.pAuthentic * 100) +
        '%"></div></div></div>' +
        '<div class="ez-prob-bar"><div class="ez-prob-bar__head"><span>Фиктивна диагноза</span><strong>' +
        pct(c.pFabricatedDiagnosis) +
        '</strong></div><div class="ez-prob-bar__track"><div class="ez-prob-bar__fill ez-prob-bar__fill--danger" style="width:' +
        Math.max(2, c.pFabricatedDiagnosis * 100) +
        '%"></div></div></div>' +
        '<div class="ez-prob-bar"><div class="ez-prob-bar__head"><span>НМЕ аритметична инфлация</span><strong>' +
        pct(c.pSystemicOrNmeInflation) +
        '</strong></div><div class="ez-prob-bar__track"><div class="ez-prob-bar__fill ez-prob-bar__fill--warn" style="width:' +
        Math.max(2, c.pSystemicOrNmeInflation * 100) +
        '%"></div></div></div></div></div>' +
        '<div class="ez-card"><h3>Нормативна проверка по НМЕ (Приложение № 2, т. III)</h3>' +
        '<p style="margin:0 0 0.4rem;font-size:0.79rem;color:#52687c;">Формула: <code>' +
        esc(c.nme.formula) +
        '</code></p><p style="margin:0;font-size:0.84rem;font-weight:600;">' +
        esc(c.nme.message) +
        '</p></div>' +
        flagsHtml
      );
    }

    if (state.tab === 'exams') {
      return (
        '<div class="ez-card"><h3>Амбулаторни прегледи и направления в НЗИС (X001 / R001)</h3><div class="ez-record-list">' +
        c.exams
          .map(
            (ex) =>
              '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">НРН ' +
              esc(ex.nrn) +
              ' · Тип ' +
              esc(ex.type) +
              '</span><span class="ez-pill ' +
              (ex.ok ? 'ez-pill--ok' : 'ez-pill--danger') +
              '">' +
              (ex.ok ? 'Потвърден в НЗИС' : 'Аномалия / Липса') +
              '</span></div><small>' +
              esc(ex.date) +
              ' · ' +
              esc(ex.facility) +
              '</small><p>' +
              esc(ex.summary) +
              '</p></div>'
          )
          .join('') +
        '</div></div>'
      );
    }

    if (state.tab === 'hospital') {
      return (
        '<div class="ez-card"><h3>Болничен престой, епикризи (H001) и Zig 64-bit SimHash</h3><div class="ez-record-list">' +
        c.hospitals
          .map((h) => {
            const badge =
              h.simhash === 'UNIQUE'
                ? '<span class="ez-pill ez-pill--ok">SimHash: Уникална епикриза</span>'
                : h.simhash === 'CLONE_DETECTED'
                  ? '<span class="ez-pill ez-pill--danger">SimHash: Клониран шаблон (&gt;92%)</span>'
                  : '<span class="ez-pill ez-pill--danger">Липсва болнична епикриза</span>';
            return (
              '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">НРН ' +
              esc(h.nrn) +
              ' · ' +
              esc(h.kp) +
              '</span>' +
              badge +
              '</div><small>' +
              esc(h.period) +
              ' · ' +
              esc(h.hospital) +
              '</small><p>' +
              esc(h.summary) +
              '</p></div>'
            );
          })
          .join('') +
        '</div></div>'
      );
    }

    if (state.tab === 'rxlabs') {
      return (
        '<div class="ez-card"><h3>Обективни изследвания и изпълнени е-Рецепти (P001) — ' +
        c.rxCount24m +
        ' рецепти за 24 мес.</h3><div class="ez-record-list">' +
        c.rxlabs
          .map(
            (r) =>
              '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">' +
              esc(r.cat) +
              ' · НРН ' +
              esc(r.nrn) +
              '</span><span class="ez-pill ' +
              (r.ok ? 'ez-pill--ok' : 'ez-pill--danger') +
              '">' +
              (r.ok ? 'Потвърдено' : 'Липсва / Противоречие') +
              '</span></div><small>Дата: ' +
              esc(r.date) +
              '</small><p>' +
              esc(r.desc) +
              '</p></div>'
          )
          .join('') +
        '</div></div>'
      );
    }

    return (
      '<div class="ez-card"><h3>Адаптерна спецификация за НЗИС (his.bg), RegiX и ДХЧО</h3>' +
      '<div class="ez-sandbox-notice" role="note"><strong>Важно техническо уточнение за одиторите (МЕУ / „Информационно обслужване“ АД):</strong> ' +
      'Имената на крайните точки и обменните структури са <strong>шаблонни (mock/sandbox)</strong> и следват публичната номенклатура на НЗИС ' +
      '(<code>X001/X002</code> за прегледи, <code>P001/P002</code> за е-рецепти, <code>R001/R002</code> за направления, <code>H001/H002</code> за хоспитализации) ' +
      'до предоставяне на официален X.509 достъп и продукционни схеми от „Информационно обслужване“ АД в ДХЧО.</div>' +
      '<div class="ez-record-list" style="margin-top:0.75rem;">' +
      '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">НЗИС (his.bg) · FHIR/XML адаптер (Sandbox)</span><span class="ez-pill ez-pill--info">X001 · P001 · R001 · H001</span></div><p>Валидация на 12-цифрен НРН (Mod-11) и наличие на обективни ЕМГ/КАГ/Хистология/е-рецепти в реално време.</p></div>' +
      '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">RegiX · ИБД-ТЕЛК / НОИ / ЕСГРАОН (Sandbox)</span><span class="ez-pill ez-pill--info">ДХЧО Air-Gapped Ready</span></div><p>Кръстосана проверка на постоянен адрес (ЕСГРАОН), активни плащания (НОИ) и предходни ЕР (ИБД-ТЕЛК) без външен облак.</p></div>' +
      '<div class="ez-record-item"><div class="ez-record-item__head"><span class="ez-record-item__nrn">еАвт (МЕУ) · КЕП / Евротръст / B-Trust</span><span class="ez-pill ez-pill--ok">GDPR чл. 9 &amp; чл. 22</span></div><p>Пациентът достъпва собственото си ЕР и може с 1 клик да подаде сигнал по реда на „Публичен контрол“.</p></div>' +
      '</div></div>'
    );
  }

  function renderDetail() {
    const wrap = document.getElementById('ezDetailWrap');
    const ws = document.getElementById('ezWorkspace');
    if (!wrap) return;
    if (ws) ws.classList.toggle('is-mobile-preview', state.view === 'mobile');

    const c = currentCase();
    const isAnomaly = c.verdict !== 'АВТЕНТИЧЕН';
    const tabs = [
      ['audit', '1. Одит & Щит'],
      ['exams', '2. Прегледи (X001)'],
      ['hospital', '3. Епикризи (H001)'],
      ['rxlabs', '4. Рецепти & Изсл. (P001)'],
      ['integration', '5. НЗИС / RegiX (Sandbox)'],
    ];

    const inner =
      '<article class="ez-patient-card">' +
      '<div class="ez-patient-card__header"><div>' +
      '<p class="ez-patient-card__er">' +
      esc(c.erNumber) +
      ' · ' +
      esc(c.erDate) +
      ' · ' +
      esc(c.telkCommission) +
      '</p>' +
      '<h2 class="ez-patient-card__title">' +
      esc(c.titleBg) +
      '</h2>' +
      '<p class="ez-patient-card__sub">' +
      esc(c.sourceEvidenceBg) +
      '</p></div>' +
      '<div><span class="ez-pill ' +
      (isAnomaly ? 'ez-pill--danger' : 'ez-pill--ok') +
      '">' +
      (isAnomaly ? 'Триаж за НЕЛК (THIRD)' : 'Валидирано (FIRST)') +
      '</span></div></div>' +
      '<div class="ez-patient-card__grid">' +
      '<div class="ez-patient-card__item"><span>Водеща диагноза (МКБ-10)</span><strong>' +
      esc(c.icd10 + ' — ' + c.icd10LabelBg) +
      '</strong></div>' +
      '<div class="ez-patient-card__item"><span>Отчетен ТНР % / Срок</span><strong>' +
      c.tnrPct +
      '% · ' +
      esc(c.validityTermBg) +
      '</strong></div>' +
      '<div class="ez-patient-card__item"><span>Обезличен идентификатор</span><strong>' +
      esc(c.patientPseudonym) +
      '</strong></div>' +
      '<div class="ez-patient-card__item"><span>Клинична траектория</span><strong>' +
      esc(c.trajectoryLabelBg) +
      '</strong></div></div></article>' +
      '<div class="ez-tabs" role="tablist">' +
      tabs
        .map(
          ([k, lbl]) =>
            '<button type="button" class="' +
            (state.tab === k ? 'is-active' : '') +
            '" data-ez-tab="' +
            k +
            '">' +
            lbl +
            '</button>'
        )
        .join('') +
      '</div>' +
      renderTabBody(c);

    if (state.view === 'mobile') {
      wrap.innerHTML =
        '<div class="ez-phone-frame"><div class="ez-phone-frame__notch"><span>09:41</span><strong>еЗдраве · ТЕЛК</strong><span>5G · КЕП</span></div>' +
        '<div class="ez-phone-frame__body">' +
        inner +
        '</div></div>';
    } else {
      wrap.innerHTML = inner;
    }
  }

  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return 'local-offline-sha256-unavailable';
  }

  function openPkModal() {
    const c = currentCase();
    const modal = document.getElementById('ezPkModal');
    const intro = document.getElementById('ezPkIntro');
    const catSel = document.getElementById('ezPkCategory');
    const commentEl = document.getElementById('ezPkComment');
    const receiptEl = document.getElementById('ezPkReceipt');
    const actionsEl = document.getElementById('ezPkActions');
    if (!modal || !intro || !catSel || !commentEl || !receiptEl || !actionsEl) return;

    intro.innerHTML =
      'Свързване с националния механизъм <strong>„Публичен контрол“</strong> в еЗдраве за ЕР <strong>' +
      esc(c.erNumber) +
      '</strong> (' +
      esc(c.icd10) +
      ', ' +
      c.tnrPct +
      '% ТНР).';

    const cats = [
      c.pkCategory,
      'Липсващо обективно изследване (ЕМГ / КАГ / VEP / Хистология) в НЗИС',
      'Нарушена формула за общ ТНР % по Приложение № 2, т. III НМЕ',
      'Клонирана или противоречива медицинска епикриза (SimHash)',
      'Отчетена, но неизвършена медицинска дейност / преглед',
    ];
    catSel.innerHTML = cats.map((x) => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');

    commentEl.value =
      c.flags.length > 0
        ? 'Засечени флагове: ' +
          c.flags.map((f) => f.code).join(', ') +
          '. Моля за присъствен контролен преглед от независим състав на НЕЛК извън област ' +
          c.oblastName +
          ' и проверка на липсващите дейности в НЗИС.'
        : '';

    receiptEl.hidden = true;
    receiptEl.innerHTML = '';
    actionsEl.innerHTML =
      '<button type="button" class="ez-btn-secondary" id="ezPkCancel">Отказ</button>' +
      '<button type="button" class="ez-btn-control" id="ezPkSubmit">Генерирай сигнал (Локална симулация)</button>';

    modal.hidden = false;
  }

  function closePkModal() {
    const modal = document.getElementById('ezPkModal');
    if (modal) modal.hidden = true;
  }

  async function submitPkSignal() {
    const c = currentCase();
    const target = (document.getElementById('ezPkTarget') || {}).value || '';
    const category = (document.getElementById('ezPkCategory') || {}).value || '';
    const comment = ((document.getElementById('ezPkComment') || {}).value || '').trim();
    const timestampIso = new Date().toISOString();
    const protocolId = 'EZ-PK-' + c.oblastCode + '-' + Date.now().toString(36).toUpperCase();

    const payload = {
      schema: 'eZdrave.PublicControl.TELK.Triage.v1',
      mode: 'LOCAL_SANDBOX_SIMULATION_ZERO_NETWORK',
      protocolId,
      timestampIso,
      targetInstitutions: target,
      gdprCompliance: {
        art9ZeroPii: true,
        art22HumanInTheLoop:
          'Автоматизираният резултат е само триаж. Финално решение се постановява единствено с КЕП от лекарски състав на НЕЛК.',
      },
      dossierRef: {
        erNumber: c.erNumber,
        oblastCode: c.oblastCode,
        icd10: c.icd10,
        declaredTnrPct: c.tnrPct,
        expectedNmeCapPct: c.nme.expected,
        patientPseudonym: c.patientPseudonym,
      },
      auditSummary: {
        engine: 'ZIG_0_15_2_SIMD_WASM',
        verdict: c.verdict,
        catuskotiState: c.catuskotiState,
        flags: c.flags.map((f) => f.code),
      },
      citizenSignal: { category, comment },
    };

    const json = JSON.stringify(payload, null, 2);
    const hash = await sha256Hex(json);
    state.lastPayloadJson = json;
    state.lastProtocolId = protocolId;

    const receiptEl = document.getElementById('ezPkReceipt');
    const actionsEl = document.getElementById('ezPkActions');
    if (receiptEl) {
      receiptEl.hidden = false;
      receiptEl.innerHTML =
        '<strong>Локален протокол за „Публичен контрол“ е генериран успешно!</strong>' +
        '<div>Референтен №: <strong>' +
        esc(protocolId) +
        '</strong></div>' +
        '<div>Времеви печат (UTC): ' +
        esc(timestampIso) +
        '</div><code>SHA-256: ' +
        esc(hash) +
        '</code><div id="ezPkCopyMsg" style="margin-top:0.35rem;font-weight:600;"></div>';
    }
    if (actionsEl) {
      actionsEl.innerHTML =
        '<button type="button" class="ez-btn-secondary" id="ezPkCopy">Копирай JSON</button>' +
        '<button type="button" class="ez-btn-secondary" id="ezPkDownload">Изтегли протокол (.json)</button>' +
        '<button type="button" class="ez-btn-control" id="ezPkDone">Готово</button>';
    }
  }

  function init() {
    const root = document.getElementById('ezPortalRoot');
    if (!root) return;

    renderList();
    renderDetail();

    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      if (btn.dataset.ezView) {
        state.view = btn.dataset.ezView;
        root.querySelectorAll('[data-ez-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.ezView === state.view));
        renderDetail();
      } else if (btn.dataset.ezFilter) {
        state.filter = btn.dataset.ezFilter;
        root.querySelectorAll('[data-ez-filter]').forEach((b) => b.classList.toggle('is-active', b.dataset.ezFilter === state.filter));
        renderList();
      } else if (btn.dataset.ezCase) {
        state.selectedId = btn.dataset.ezCase;
        state.tab = 'audit';
        renderList();
        renderDetail();
      } else if (btn.dataset.ezTab) {
        state.tab = btn.dataset.ezTab;
        renderDetail();
      } else if (btn.dataset.ezOpenPk) {
        openPkModal();
      }
    });

    const modal = document.getElementById('ezPkModal');
    if (modal) {
      modal.addEventListener('click', async (ev) => {
        const id = ev.target.id;
        if (id === 'ezPkClose' || id === 'ezPkCancel' || id === 'ezPkDone' || ev.target === modal) {
          closePkModal();
        } else if (id === 'ezPkSubmit') {
          await submitPkSignal();
        } else if (id === 'ezPkCopy') {
          const msg = document.getElementById('ezPkCopyMsg');
          try {
            await navigator.clipboard.writeText(state.lastPayloadJson);
            if (msg) msg.textContent = 'JSON протоколът е копиран в клипборда.';
          } catch {
            if (msg) msg.textContent = 'Използвайте бутона „Изтегли протокол (.json)“.';
          }
        } else if (id === 'ezPkDownload') {
          const blob = new Blob([state.lastPayloadJson], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (state.lastProtocolId || 'ezdrave-signal') + '.json';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
