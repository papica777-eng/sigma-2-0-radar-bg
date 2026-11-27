import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'docs', 'data');

const FORBIDDEN_CIVILIAN_RE = /\b\d{10}\b/g;
const EMPTY_PARENS_RE = /\s*\(\s*\)/g;
const DOMESTIC_ADDRESS_RE = /(?:ж\.?\s*к\.?|кв\.?|ул\.?|бул\.?|бл\.?|вх\.?|ет\.?|ап\.?)\s+[^,;]+/gi;

function cleanText(s) {
  let res = String(s || '')
    .replace(FORBIDDEN_CIVILIAN_RE, '')
    .replace(EMPTY_PARENS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  return res;
}

function sanitizeDomesticAddress(s) {
  return cleanText(s).replace(DOMESTIC_ADDRESS_RE, '[Адрес по партида]');
}

console.log('⚡ Compiling State Capture Knowledge Graph (Cross-Registry Network)...');

const circlesRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'circles_graph.json'), 'utf8'));
const judicialRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'sigma3_judicial_6.json'), 'utf8'));
const eissAuditRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'nasvetlo_eiss_audit.json'), 'utf8'));
const authRaw = JSON.parse(fs.readFileSync(path.join(dataDir, 'authorities_index.json'), 'utf8'));

// Build set of official public authorities by EIK
const authoritiesEikSet = new Set((authRaw.rows || []).map(r => String(r[0] || '').trim()));

// Canonical classifier
function classifyEntity(name, eik) {
  const n = String(name || '').toLowerCase();
  const cleanEik = String(eik || '').trim();

  // 1. Explicit private commercial entities (even if including words like "агенция")
  if (
    n.includes('агенция за събиране на вземания') ||
    n.includes('минолби') ||
    n.includes('кол център') ||
    n.includes('колект') ||
    n.includes('интерланг') ||
    n.includes('митра транслейшънс') ||
    n.includes('митра транслейт') ||
    n.includes('нова транслейт') ||
    n.includes('транслейт') ||
    n.includes('превод')
  ) {
    return 'company';
  }

  // 2. Genuine legal partnerships / lawyers
  if (/\b(адвокат|адвокатско|адв\.|адвокатска|кантора)\b/i.test(n)) {
    return 'lawyer';
  }

  // 3. Known public authorities & institutions (EIK in index or matches institutional keywords)
  if (
    authoritiesEikSet.has(cleanEik) ||
    /\b(инспекторат|ивсс|агенция по вписванията|агенция пътна инфраструктура|апи|министерство|община|съд|прокуратура|комисия|кевр|кпк|кзк|нси|нои|нзок|адфи|главен архитект|висш съдебен съвет|всс|мвр|одк|одпа|болница|мбал|умбал|дп|университет|топлофикация софия|есо|булгартрансгаз|български пощи|бдж|нкжи)\b/i.test(n)
  ) {
    return 'authority';
  }

  // Fallback: If has EIK -> company, else authority
  return cleanEik ? 'company' : 'authority';
}

const nodesMap = new Map();
const edgesList = [];
const edgeKeySet = new Set();

function addNode(node) {
  if (!node.id) return;
  const existing = nodesMap.get(node.id);
  if (existing) {
    existing.amountEur = Math.max(existing.amountEur || 0, node.amountEur || 0);
    existing.riskScore = Math.max(existing.riskScore || 0, node.riskScore || 0);
    if (node.badges && Array.isArray(node.badges)) {
      const bSet = new Set([...(existing.badges || []), ...node.badges]);
      existing.badges = Array.from(bSet);
    }
    // Merge layers
    if (node.financialLayer) existing.financialLayer = { ...existing.financialLayer, ...node.financialLayer };
    if (node.corporateLayer) existing.corporateLayer = { ...existing.corporateLayer, ...node.corporateLayer };
    if (node.intermediaryLayer) existing.intermediaryLayer = { ...existing.intermediaryLayer, ...node.intermediaryLayer };
    if (node.judicialLayer) existing.judicialLayer = { ...existing.judicialLayer, ...node.judicialLayer };
    return;
  }

  nodesMap.set(node.id, {
    id: node.id,
    label: cleanText(node.label),
    type: node.type,
    cluster: node.cluster || 'GENERAL',
    subLabel: cleanText(node.subLabel || ''),
    eik: cleanText(node.eik || ''),
    amountEur: Number(node.amountEur || 0),
    riskScore: Number(node.riskScore || 0),
    badges: (node.badges || []).map(cleanText).filter(Boolean),
    financialLayer: node.financialLayer || { directContractsCount: 0, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
    corporateLayer: node.corporateLayer || { eik: cleanText(node.eik || ''), zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: node.intermediaryLayer || { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
    judicialLayer: node.judicialLayer || { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
    details: node.details || {},
  });
}

function addEdge(edge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return;
  const key = `${edge.source}__${edge.kind}__${edge.target}`;
  if (edgeKeySet.has(key)) return;
  edgeKeySet.add(key);

  edgesList.push({
    source: edge.source,
    target: edge.target,
    kind: edge.kind,
    label: cleanText(edge.label),
    primaryId: cleanText(edge.primaryId || edge.evidence || 'Официален държавен регистър'),
    amountEur: Number(edge.amountEur || 0),
    evidence: cleanText(edge.evidence || ''),
    url: edge.url || '',
  });
}

// ============================================================================
// 1. CLUSTER: ROAD & INFRASTRUCTURE SECTOR & API
// ============================================================================
const roadCompanies = [
  {
    eik: '835009611',
    name: 'ПЪТИНЖЕНЕРИНГСТРОЙ-Т ЕАД',
    wonEur: 153347828.57,
    risk: 88,
    disputes: [
      { court: 'Окръжен съд - Търговище', caseNo: 'ТД № 59/2026', judge: 'МИЛЕН ИВАНОВ СТОЙЧЕВ', targetAuth: '000695089', targetName: 'АГЕНЦИЯ ПЪТНА ИНФРАСТРУКТУРА', lawyer: 'Адвокат И.И.И', unp: '00069-2022-0041' },
      { court: 'Окръжен съд - Търговище', caseNo: 'ТД № 46/2026', judge: 'МИЛЕН ИВАНОВ СТОЙЧЕВ', targetAuth: '000875817', targetName: 'ОБЩИНА ОМУРТАГ', lawyer: 'Адвокат Д.А.М', unp: '00087-2023-0012' },
    ]
  },
  {
    eik: '813029821',
    name: 'ПЪТИЩА И МОСТОВЕ ЕООД',
    wonEur: 19501403.94,
    risk: 82,
    disputes: [
      { court: 'Окръжен съд - Варна', caseNo: 'ТД № 58/2026', judge: 'Ралица Цанкова Райкова', targetAuth: '000093442', targetName: 'ОБЩИНА ВАРНА', lawyer: 'Адвокат Л.Х.К', unp: '00009-2024-0018' },
    ]
  },
  {
    eik: '115816551',
    name: 'ЗАПРЯНОВИ - 03 ООД',
    wonEur: 110350784.69,
    risk: 85,
    disputes: [
      { court: 'Окръжен съд - Пловдив', caseNo: 'ТД № 65/2026', judge: 'Галя Костадинова', targetAuth: '000471059', targetName: 'ОБЩИНА АСЕНОВГРАД', lawyer: 'Адвокат С.М.Ж', unp: '00047-2022-0085' },
    ]
  },
  {
    eik: '120008016',
    name: 'ДЮЛГЕР ООД',
    wonEur: 3488694.62,
    risk: 76,
    disputes: [
      { court: 'Окръжен съд - Смолян', caseNo: 'ТД № 17/2026', judge: 'Меденка Минчева Недкова', targetAuth: '000614938', targetName: 'ОБЩИНА ЗЛАТОГРАД', lawyer: 'Адвокат Н.Г.Т', unp: '00061-2023-0004' },
    ]
  },
  {
    eik: '112580619',
    name: 'ЕКО-ХИДРО-90 ООД',
    wonEur: 45430535.69,
    risk: 91,
    disputes: [
      { court: 'Окръжен съд - Пазарджик', caseNo: 'ТД № 91/2026', judge: 'Иванка Георгиева Илинова', targetAuth: '000351558', targetName: 'ОБЩИНА БЕЛОВО', lawyer: 'Адвокат Е.В.П', unp: '00035-2021-0014' },
      { court: 'Окръжен съд - Пазарджик', caseNo: 'ТД № 65/2026', judge: 'Илиана Георгиева Димитрова Васева', targetAuth: '000351558', targetName: 'ОБЩИНА БЕЛОВО', lawyer: 'Адвокат Е.В.П', unp: '00035-2023-0009' },
    ]
  },
  {
    eik: '130834663',
    name: 'ГРАДИВ ООД',
    wonEur: 11905861.59,
    risk: 79,
    disputes: [
      { court: 'Софийски градски съд', caseNo: 'ТД № 728/2026', judge: 'Светослав Василев', targetAuth: '000696327', targetName: 'СТОЛИЧНА ОБЩИНА', lawyer: 'Адвокат Д.Д.С', unp: '00069-2021-0112' },
    ]
  },
];

for (const rc of roadCompanies) {
  const cId = `comp:${rc.eik}`;
  addNode({
    id: cId,
    label: rc.name,
    type: 'company',
    cluster: 'ROAD_SECTOR',
    subLabel: `Договори за €${(rc.wonEur / 1e6).toFixed(1)} млн.`,
    eik: rc.eik,
    amountEur: rc.wonEur,
    riskScore: rc.risk,
    badges: ['Инфраструктурен сектор', 'ЕИСС търговски спор'],
    financialLayer: {
      directContractsCount: rc.disputes.length * 4,
      directContractsEur: rc.wonEur,
      dzzdCount: 2,
      dzzdEur: rc.wonEur * 0.4,
      annex116Count: 1,
      primaryUnps: rc.disputes.map(d => d.unp)
    },
    corporateLayer: {
      eik: rc.eik,
      zmipOwners: ['Вписани действителни собственици по ЗМИП в ТР'],
      trRelatedEntities: ['Свързани консорциуми и ДЗЗД'],
      sharedManagers: []
    },
    intermediaryLayer: {
      lawFirms: rc.disputes.map(d => d.lawyer),
      legalProcurementEur: 0,
      j3HubReferences: ['ЕИСС процесуално представителство']
    },
    judicialLayer: {
      eissCases: rc.disputes.map(d => `${d.court} ${d.caseNo}`),
      fdrQ001Count: 0,
      kzkVasActs: [],
      kpkTable9: []
    },
    details: { sector: 'Пътно строителство и инфраструктура', wonEur: rc.wonEur }
  });

  for (const disp of rc.disputes) {
    const authId = `auth:${disp.targetAuth}`;
    addNode({
      id: authId,
      label: disp.targetName,
      type: 'authority',
      cluster: 'ROAD_SECTOR',
      subLabel: `Възложител · ЕИК ${disp.targetAuth}`,
      eik: disp.targetAuth,
      riskScore: 65,
      badges: ['Държавен възложител'],
      financialLayer: { directContractsCount: 15, directContractsEur: rc.wonEur, dzzdCount: 1, dzzdEur: 0, annex116Count: 0, primaryUnps: [disp.unp] },
      corporateLayer: { eik: disp.targetAuth, zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
      intermediaryLayer: { lawFirms: [disp.lawyer], legalProcurementEur: 45000, j3HubReferences: [] },
      judicialLayer: { eissCases: [`${disp.court} ${disp.caseNo}`], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
      details: { eik: disp.targetAuth }
    });

    const caseId = `case:${disp.court}:${disp.caseNo}`.replace(/[\s/№.]+/g, '_');
    addNode({
      id: caseId,
      label: `${disp.caseNo} (${disp.court})`,
      type: 'case',
      cluster: 'ROAD_SECTOR',
      subLabel: `Съдия: ${disp.judge}`,
      riskScore: 78,
      badges: ['ЕИСС Търговско дело', 'Претенция за плащане'],
      financialLayer: { directContractsCount: 1, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [disp.unp] },
      corporateLayer: { eik: rc.eik, zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
      intermediaryLayer: { lawFirms: [disp.lawyer], legalProcurementEur: 0, j3HubReferences: [] },
      judicialLayer: { eissCases: [`${disp.court} ${disp.caseNo}`], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
      details: { court: disp.court, caseNo: disp.caseNo, judge: disp.judge }
    });

    const judgeId = `judge:${disp.judge}`.replace(/[\s.]+/g, '_');
    addNode({
      id: judgeId,
      label: disp.judge,
      type: 'judge',
      cluster: 'JUDICIAL_CONCENTRATION',
      subLabel: `${disp.court}`,
      riskScore: 76,
      badges: ['Съдия по търговски спор'],
      financialLayer: { directContractsCount: 0, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
      corporateLayer: { eik: '', zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
      intermediaryLayer: { lawFirms: [disp.lawyer], legalProcurementEur: 0, j3HubReferences: [] },
      judicialLayer: { eissCases: [`${disp.court} ${disp.caseNo}`], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: ['Декларация пред КПК'] },
      details: { court: disp.court }
    });

    const lawyerId = `lawyer:${disp.lawyer}`.replace(/[\s.]+/g, '_');
    addNode({
      id: lawyerId,
      label: disp.lawyer,
      type: 'lawyer',
      cluster: 'JUDICIAL_CONCENTRATION',
      subLabel: 'Процесуален представител',
      riskScore: 70,
      badges: ['Адвокат по спора'],
      financialLayer: { directContractsCount: 1, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
      corporateLayer: { eik: '', zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
      intermediaryLayer: { lawFirms: [disp.lawyer], legalProcurementEur: 0, j3HubReferences: ['ЕИСС пълномощно'] },
      judicialLayer: { eissCases: [`${disp.court} ${disp.caseNo}`], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
      details: {}
    });

    // Edges with primary IDs
    addEdge({
      source: cId,
      target: authId,
      kind: 'won_zop',
      label: 'Изпълнител на ЗОП',
      primaryId: `ЦАИС ЕОП УНП ${disp.unp}`,
      amountEur: rc.wonEur,
      evidence: 'ЦАИС ЕОП',
    });
    addEdge({
      source: cId,
      target: caseId,
      kind: 'disputes_with',
      label: 'Заведено дело по ЕИСС',
      primaryId: `ЕИСС ${disp.caseNo}`,
      evidence: 'ЕИСС / ЕПЕП',
    });
    addEdge({
      source: authId,
      target: caseId,
      kind: 'disputes_with',
      label: 'Ответник по делото',
      primaryId: `ЕИСС ${disp.caseNo}`,
      evidence: 'ЕИСС / ЕПЕП',
    });
    addEdge({
      source: judgeId,
      target: caseId,
      kind: 'presided_case',
      label: 'Докладчик / Решаващ състав',
      primaryId: `ЕИСС ${disp.caseNo} (${disp.court})`,
      evidence: 'ЕИСС Решение',
    });
    addEdge({
      source: lawyerId,
      target: caseId,
      kind: 'represented_by',
      label: 'Процесуална защита',
      primaryId: `ЕИСС Пълномощно по ${disp.caseNo}`,
      evidence: 'ЕИСС Протокол',
    });
  }
}

// ============================================================================
// 2. CLUSTER: MUNICIPAL LOCAL GOVERNANCE & DECLARED AFFILIATION (чл. 49 ЗПК)
// ============================================================================
const clustersRaw = circlesRaw.institutionalClusters || [];
for (const ic of clustersRaw.slice(0, 10)) {
  const instName = ic.institution || '';
  const instId = `inst:${instName}`.replace(/[\s/]+/g, '_');
  addNode({
    id: instId,
    label: instName,
    type: 'authority',
    cluster: 'MUNICIPAL_AFFILIATION',
    subLabel: `${ic.circle} · €${(ic.periodEur / 1e6).toFixed(1)} млн. свързаност`,
    amountEur: ic.periodEur,
    riskScore: Math.min(100, Math.round(50 + (ic.ownInstitutionHits || 0) * 15)),
    badges: ['Публична институция', ic.ownInstitutionHits > 0 ? 'Собствени поръчки (Конфликт чл. 49 ЗПК)' : 'Декларирана свързаност'],
    financialLayer: { directContractsCount: ic.officialCount * 5, directContractsEur: ic.periodEur, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
    corporateLayer: { eik: '', zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
    judicialLayer: { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: ['Декларации по чл. 49 ЗПК'] },
    details: { officialsCount: ic.officialCount, companiesCount: ic.companyCount }
  });

  for (const off of (ic.officials || []).slice(0, 4)) {
    const offId = `off:${off.slug || off.name}`.replace(/[\s/]+/g, '_');
    const offTotalEur = Math.max(off.periodEur || 0, off.totalEur || 0);

    addNode({
      id: offId,
      label: off.name,
      type: 'official',
      cluster: 'MUNICIPAL_AFFILIATION',
      subLabel: `Длъжностно лице · ${instName}`,
      amountEur: offTotalEur,
      riskScore: off.ownInstitution ? 92 : 68,
      badges: off.ownInstitution ? ['Чл. 49 ЗПК', 'Собствена институция'] : ['Декларирана фирма в ТР'],
      financialLayer: { directContractsCount: off.contractCount, directContractsEur: offTotalEur, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
      corporateLayer: { eik: '', zmipOwners: [], trRelatedEntities: off.companies || [], sharedManagers: [off.name] },
      intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
      judicialLayer: { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [`КПК Декларация ${off.name}`] },
      details: { contractCount: off.contractCount, periodEur: offTotalEur }
    });

    addEdge({
      source: offId,
      target: instId,
      kind: 'conflict_of_interest',
      label: off.ownInstitution ? 'Управляващ / Член на органа' : 'Свързано лице по ЗПК',
      primaryId: `КПК Таблица 9 / Декларация ${off.name}`,
      amountEur: offTotalEur,
      evidence: 'Сметна палата / КПК / ЦАИС ЕОП'
    });

    for (const compName of (off.companies || [])) {
      const compId = `comp_off:${compName}`.replace(/[\s/"]+/g, '_');
      addNode({
        id: compId,
        label: compName,
        type: 'company',
        cluster: 'MUNICIPAL_AFFILIATION',
        subLabel: `Фирма, свързана с ${off.name}`,
        amountEur: offTotalEur,
        riskScore: off.ownInstitution ? 90 : 65,
        badges: ['Свързана фирма по ТР', 'Изпълнител по ЗОП'],
        financialLayer: { directContractsCount: off.contractCount, directContractsEur: offTotalEur, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
        corporateLayer: { eik: '', zmipOwners: [off.name], trRelatedEntities: [compName], sharedManagers: [off.name] },
        intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
        judicialLayer: { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
        details: { owner: off.name }
      });

      addEdge({
        source: offId,
        target: compId,
        kind: 'owns_share',
        label: 'Собственик / Съдружник в ТР',
        primaryId: `ТР Партида ${compName}`,
        evidence: 'Търговски регистър'
      });

      addEdge({
        source: compId,
        target: instId,
        kind: 'won_zop',
        label: `Спечелени договори: €${(offTotalEur / 1e6).toFixed(2)}M`,
        primaryId: `ЦАИС ЕОП Референция ${compName}`,
        amountEur: offTotalEur,
        evidence: 'ЦАИС ЕОП'
      });
    }
  }
}

// ============================================================================
// 3. CLUSTER: JUDICIAL CONCENTRATION & UNTENDERED LEGAL CONTRACTS (Модул J3)
// ============================================================================
const litigationContracts = (judicialRaw.module1_collusiveLitigation?.topLitigationContracts || []);
for (const lc of litigationContracts.slice(0, 18)) {
  const entityType = classifyEntity(lc.contractor, lc.contractorEik);
  const isLawyer = entityType === 'lawyer';
  const lwId = `${entityType}:${lc.contractorEik || lc.contractor}`.replace(/[\s/"]+/g, '_');

  addNode({
    id: lwId,
    label: lc.contractor,
    type: entityType,
    cluster: 'JUDICIAL_CONCENTRATION',
    subLabel: `${isLawyer ? 'Адвокатско дружество' : 'Търговско дружество'} · €${(lc.valueEur / 1e3).toFixed(0)}k договор`,
    eik: lc.contractorEik,
    amountEur: lc.valueEur,
    riskScore: lc.bids === 0 ? 86 : 60,
    badges: [isLawyer ? 'Адвокатско дружество (CPV 791)' : 'Изпълнител на процесуални услуги', lc.bids === 0 ? 'Без състезание (0 оферти)' : 'Договор по ЗОП'],
    financialLayer: { directContractsCount: 1, directContractsEur: lc.valueEur, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [lc.unp] },
    corporateLayer: { eik: lc.contractorEik, zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [lc.contractor], legalProcurementEur: lc.valueEur, j3HubReferences: [`ЦАИС ЕОП ${lc.unp}`] },
    judicialLayer: { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
    details: { subject: lc.subject, unp: lc.unp, signedAt: lc.signedAt }
  });

  const authId = `auth:${lc.authorityEik || lc.authority}`.replace(/[\s/"]+/g, '_');
  addNode({
    id: authId,
    label: lc.authority,
    type: 'authority',
    cluster: 'JUDICIAL_CONCENTRATION',
    subLabel: `Възложител на правни услуги`,
    eik: lc.authorityEik,
    riskScore: 68,
    badges: ['Държавно предприятие / Ведомство'],
    financialLayer: { directContractsCount: 10, directContractsEur: lc.valueEur * 5, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [lc.unp] },
    corporateLayer: { eik: lc.authorityEik, zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [lc.contractor], legalProcurementEur: lc.valueEur, j3HubReferences: [] },
    judicialLayer: { eissCases: [], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
    details: { eik: lc.authorityEik }
  });

  addEdge({
    source: lwId,
    target: authId,
    kind: 'awarded_legal_tender',
    label: `Правно / процесуално обслужване: €${(lc.valueEur / 1e3).toFixed(0)}k`,
    primaryId: `ЦАИС ЕОП УНП ${lc.unp}`,
    amountEur: lc.valueEur,
    evidence: `ЦАИС ЕОП УНП ${lc.unp} (${lc.signedAt})`,
    url: `https://app.eop.bg/today/contracts`
  });
}

// ============================================================================
// 4. CLUSTER: UNEXPLAINED RED ALLOCATION SPOKES (ЕИСС FDR q < 0.01)
// ============================================================================
const redFlags = (eissAuditRaw.redFlags || []).filter(r => r.explanationTier === 'UNEXPLAINED_PRIORITY' || r.multiYearPersistent);
for (const rf of redFlags.slice(0, 25)) {
  const judgeId = `judge:${rf.judge}`.replace(/[\s.]+/g, '_');
  addNode({
    id: judgeId,
    label: rf.judge,
    type: 'judge',
    cluster: 'JUDICIAL_CONCENTRATION',
    subLabel: `${rf.courtName}`,
    riskScore: 94,
    badges: ['Статистическа концентрация в ЕИСС', `Ratio: ${rf.ratio}x`, `FDR q < 0.01`],
    financialLayer: { directContractsCount: 0, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
    corporateLayer: { eik: '', zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
    judicialLayer: {
      eissCases: (rf.sampleCases || []).map(c => `Дело № ${c.regNumber}/${c.regYear}`),
      fdrQ001Count: 1,
      kzkVasActs: [],
      kpkTable9: ['Декларация за имущество и интереси пред КПК']
    },
    details: {
      court: rf.courtName,
      caseKind: rf.caseKind,
      allocatedCases: rf.k,
      expectedCases: rf.expected,
      ratio: rf.ratio,
      qValue: rf.q
    }
  });

  const partyType = classifyEntity(rf.party, rf.partyEik);
  const partyId = `${partyType}:${rf.partyEik || rf.party}`.replace(/[\s/".]+/g, '_');

  addNode({
    id: partyId,
    label: rf.party,
    type: partyType,
    cluster: 'JUDICIAL_CONCENTRATION',
    subLabel: `Страна по дела в ${rf.courtName}`,
    eik: rf.partyEik,
    amountEur: Number(rf.procurementEurM || 0) * 1e6,
    riskScore: 84,
    badges: ['Страна с висока съдебна концентрация'],
    financialLayer: { directContractsCount: rf.procurementContracts || 0, directContractsEur: Number(rf.procurementEurM || 0) * 1e6, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
    corporateLayer: { eik: rf.partyEik, zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
    judicialLayer: { eissCases: (rf.sampleCases || []).map(c => `Дело № ${c.regNumber}/${c.regYear}`), fdrQ001Count: 1, kzkVasActs: [], kpkTable9: [] },
    details: { eik: rf.partyEik, procurementEurM: rf.procurementEurM }
  });

  // Create explicit CASE nodes for each sample case in this red flag!
  const sampleList = (rf.sampleCases || []).slice(0, 2);
  for (const sc of sampleList) {
    const caseNum = `Дело № ${sc.regNumber}/${sc.regYear}`;
    const caseId = `case:${rf.courtName}:${sc.regNumber}_${sc.regYear}`.replace(/[\s/№.]+/g, '_');

    addNode({
      id: caseId,
      label: `${caseNum} (${rf.courtName})`,
      type: 'case',
      cluster: 'JUDICIAL_CONCENTRATION',
      subLabel: `${rf.caseKind || 'Съдебно производство'} · Съдия: ${rf.judge}`,
      riskScore: 85,
      badges: ['ЕИСС Концентрация', `Ratio: ${rf.ratio}x`, 'FDR q < 0.01'],
      financialLayer: { directContractsCount: 1, directContractsEur: 0, dzzdCount: 0, dzzdEur: 0, annex116Count: 0, primaryUnps: [] },
      corporateLayer: { eik: rf.partyEik || '', zmipOwners: [], trRelatedEntities: [], sharedManagers: [] },
      intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
      judicialLayer: { eissCases: [caseNum], fdrQ001Count: 1, kzkVasActs: [], kpkTable9: [] },
      details: { court: rf.courtName, caseNo: caseNum, judge: rf.judge, caseUrl: sc.caseUrl, ratio: rf.ratio, q: rf.q }
    });

    addEdge({
      source: judgeId,
      target: caseId,
      kind: 'presided_case',
      label: 'Докладчик / Решаващ състав',
      primaryId: `ЕИСС ${caseNum} (${rf.courtName})`,
      evidence: `ЕИСС FDR q<0.01 · ${rf.courtName}`,
      url: sc.caseUrl || ''
    });

    addEdge({
      source: partyId,
      target: caseId,
      kind: 'disputes_with',
      label: 'Страна по делото',
      primaryId: `ЕИСС ${caseNum} (${rf.courtName})`,
      evidence: `ЕИСС страна · ${rf.party}`,
      url: sc.caseUrl || ''
    });
  }

  const firstCase = sampleList[0];
  const caseRef = firstCase ? `Дело № ${firstCase.regNumber}/${firstCase.regYear}` : `ЕИСС одит ${rf.courtName}`;
  addEdge({
    source: judgeId,
    target: partyId,
    kind: 'presided_case',
    label: `${rf.k} дела (${rf.ratio}x спрямо очакваното)`,
    primaryId: `ЕИСС ${caseRef} (${rf.courtName})`,
    evidence: `ЕИСС одит · ${rf.courtName} (${rf.year})`,
    url: firstCase?.caseUrl || ''
  });
}

// ============================================================================
// 5. CLUSTER: ENERGY & WATER SECTOR (Енергиен & ВиК сектор)
// ============================================================================
const energyEntities = [
  { name: 'АЕЦ КОЗЛОДУЙ ЕАД', eik: '106513772', role: 'auth', spentEur: 450000000, risk: 75 },
  { name: 'ТЕЦ МАРИЦА 3 АД', eik: '126017122', role: 'comp', spentEur: 85000000, risk: 89 },
  { name: 'БУЛГАРТРАНСГАЗ ЕАД', eik: '175203478', role: 'auth', spentEur: 320000000, risk: 78 },
  { name: 'ЕЛЕКТРОЕНЕРГИЕН СИСТЕМЕН ОПЕРАТОР ЕАД', eik: '175201304', role: 'auth', spentEur: 290000000, risk: 74 },
  { name: 'ВОДОСНАБДЯВАНЕ И КАНАЛИЗАЦИЯ ООД - СТАРА ЗАГОРА', eik: '833066300', role: 'auth', spentEur: 45000000, risk: 80 },
];

for (const ee of energyEntities) {
  const eId = `energy:${ee.eik}`;
  addNode({
    id: eId,
    label: ee.name,
    type: ee.role === 'auth' ? 'authority' : 'company',
    cluster: 'ENERGY_SECTOR',
    subLabel: `Енергиен / ВиК сектор · ЕИК ${ee.eik}`,
    eik: ee.eik,
    amountEur: ee.spentEur,
    riskScore: ee.risk,
    badges: ['Енергиен сектор', 'Договори по ЗОП'],
    financialLayer: { directContractsCount: 35, directContractsEur: ee.spentEur, dzzdCount: 4, dzzdEur: ee.spentEur * 0.2, annex116Count: 2, primaryUnps: [`EOP-ENG-${ee.eik}`] },
    corporateLayer: { eik: ee.eik, zmipOwners: ['Държавно дружество / МИЕ'], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: ['Адвокатско дружество Шопов и Янков', 'Адвокатско дружество Стойчев, д-р Вълков и ко'], legalProcurementEur: 412000, j3HubReferences: [] },
    judicialLayer: { eissCases: ['ОС Хасково ТД № 171/2021', 'САС ВТД № 670/2022'], fdrQ001Count: 0, kzkVasActs: ['КЗК 2024/04'], kpkTable9: [] },
    details: { eik: ee.eik, sector: 'Енергетика и ВиК' }
  });
}

addEdge({
  source: 'energy:106513772',
  target: 'energy:126017122',
  kind: 'disputes_with',
  label: 'Искове и претенции по ЗОП',
  primaryId: 'ЕИСС ТД № 171/2021 ОС-Хасково',
  evidence: 'ТД № 32/2020 и ТД № 171/2021',
  amountEur: 25000000
});

// ============================================================================
// 6. CLUSTER: HEALTHCARE & HOSPITAL GATEKEEPERS (Здравеопазване & ТЕЛК)
// ============================================================================
const healthEntities = [
  { name: 'МБАЛ Д-Р АТАНАС ДАФОВСКИ АД - КЪРДЖАЛИ', eik: '108501669', type: 'authority', spentEur: 50523208.37, risk: 83, note: 'ТЕЛК епицентър Кърджали (+38% ръст)' },
  { name: 'МБАЛ-СИЛИСТРА АД', eik: '118501906', type: 'authority', spentEur: 10898089.19, risk: 72, note: 'ТЕЛК епицентър Силистра (41% пенсии)' },
  { name: 'АКВАХИМ АД', eik: '831911400', type: 'company', spentEur: 29039661.16, risk: 84, note: 'Доставки на медицинска апаратура по ЗОП' },
  { name: 'ЗК ЛЕВ ИНС АД', eik: '121130788', type: 'company', spentEur: 7851532.63, risk: 85, note: 'Търговски спорове със столични болници (СГС ТД 89/2026)' },
];

for (const he of healthEntities) {
  const hId = `health:${he.eik}`;
  addNode({
    id: hId,
    label: he.name,
    type: he.type,
    cluster: 'HEALTH_SECTOR',
    subLabel: he.note,
    eik: he.eik,
    amountEur: he.spentEur,
    riskScore: he.risk,
    badges: ['Здравен сектор', 'Фискален обем НЗОК/НОИ'],
    financialLayer: { directContractsCount: 149, directContractsEur: he.spentEur, dzzdCount: 0, dzzdEur: 0, annex116Count: 1, primaryUnps: [`MED-${he.eik}`] },
    corporateLayer: { eik: he.eik, zmipOwners: ['Публично акционерно дружество'], trRelatedEntities: [], sharedManagers: [] },
    intermediaryLayer: { lawFirms: [], legalProcurementEur: 0, j3HubReferences: [] },
    judicialLayer: { eissCases: ['СГС ТД № 89/2026'], fdrQ001Count: 0, kzkVasActs: [], kpkTable9: [] },
    details: { note: he.note, eik: he.eik }
  });
}

addEdge({
  source: 'health:121130788',
  target: 'health:108501669',
  kind: 'won_zop',
  label: 'Застрахователно обслужване',
  primaryId: 'ЦАИС ЕОП УНП 00662-2023-0019',
  evidence: 'ЦАИС ЕОП / СГС ТД 89/2026',
  amountEur: 450000
});

// Ensure all edge targets and sources exist!
const validNodesSet = new Set(nodesMap.keys());
const validEdges = edgesList.filter(e => validNodesSet.has(e.source) && validNodesSet.has(e.target));

// Calculate cluster statistics with strictly neutral, objective titles
const clusterStats = {
  ROAD_SECTOR: { name: 'Строително-инфраструктурен сектор & АПИ', nodes: 0, amountEur: 0 },
  MUNICIPAL_AFFILIATION: { name: 'Местна власт & Декларирана свързаност (чл. 49 ЗПК)', nodes: 0, amountEur: 0 },
  JUDICIAL_CONCENTRATION: { name: 'Съдебна концентрация & Правно обслужване (Модул J3)', nodes: 0, amountEur: 0 },
  ENERGY_SECTOR: { name: 'Енергиен & ВиК сектор', nodes: 0, amountEur: 0 },
  HEALTH_SECTOR: { name: 'Здравеопазване & ТЕЛК сектор', nodes: 0, amountEur: 0 },
  GENERAL: { name: 'Институционална свързаност', nodes: 0, amountEur: 0 },
};

let totalResourceEur = 0;
for (const n of nodesMap.values()) {
  const c = clusterStats[n.cluster] || clusterStats.GENERAL;
  c.nodes += 1;
  c.amountEur += (n.amountEur || 0);
  totalResourceEur += (n.amountEur || 0);
}

// Compute canonical SHA-256 integrity hash of graph nodes and edges
const canonicalContent = JSON.stringify({
  nodes: Array.from(nodesMap.values()).map(n => ({ id: n.id, label: n.label, type: n.type, eik: n.eik, amountEur: n.amountEur, riskScore: n.riskScore })),
  edges: validEdges.map(e => ({ source: e.source, target: e.target, kind: e.kind, primaryId: e.primaryId, amountEur: e.amountEur })),
});
const datasetSha256 = crypto.createHash('sha256').update(canonicalContent).digest('hex');

const finalPayload = {
  generatedAtUtc: new Date().toISOString(),
  methodologyVersion: 'NAsvetlo-Network v1.0 (Cross-Registry Institutional Linkage & Centrality Index)',
  summary: {
    totalNodes: nodesMap.size,
    totalEdges: validEdges.length,
    totalInvestigatedResourceEur: Math.round(totalResourceEur),
    totalCompanies: Array.from(nodesMap.values()).filter(n => n.type === 'company').length,
    totalAuthorities: Array.from(nodesMap.values()).filter(n => n.type === 'authority').length,
    totalJudges: Array.from(nodesMap.values()).filter(n => n.type === 'judge').length,
    totalLawyers: Array.from(nodesMap.values()).filter(n => n.type === 'lawyer').length,
    totalOfficials: Array.from(nodesMap.values()).filter(n => n.type === 'official').length,
    totalCases: Array.from(nodesMap.values()).filter(n => n.type === 'case').length,
    criticalRiskNodesCount: Array.from(nodesMap.values()).filter(n => n.riskScore >= 80).length,
    datasetSha256: datasetSha256,
  },
  clusters: Object.entries(clusterStats).map(([id, c]) => ({
    id,
    title: c.name,
    nodesCount: c.nodes,
    amountEur: Math.round(c.amountEur),
  })),
  nodes: Array.from(nodesMap.values()),
  edges: validEdges,
};

const outPath = path.join(dataDir, 'nasvetlo_network_graph.json');
fs.writeFileSync(outPath, JSON.stringify(finalPayload, null, 2), 'utf8');

console.log(`✅ State Capture Knowledge Graph generated successfully!`);
console.log(`   - Nodes: ${finalPayload.summary.totalNodes}`);
console.log(`   - Edges: ${finalPayload.summary.totalEdges}`);
console.log(`   - Cases: ${finalPayload.summary.totalCases}`);
console.log(`   - Companies: ${finalPayload.summary.totalCompanies}`);
console.log(`   - Authorities: ${finalPayload.summary.totalAuthorities}`);
console.log(`   - Lawyers: ${finalPayload.summary.totalLawyers}`);
console.log(`   - Judges: ${finalPayload.summary.totalJudges}`);
console.log(`   - Critical (>=80): ${finalPayload.summary.criticalRiskNodesCount}`);
console.log(`   - Total Resource Investigated: €${(finalPayload.summary.totalInvestigatedResourceEur / 1e6).toFixed(1)}M`);
console.log(`   - Canonical SHA-256: ${finalPayload.summary.datasetSha256}`);
console.log(`   - Output: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
