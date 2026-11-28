// =============================================================================
// NAsvetlo — МРЕЖАТА: Forensic Cross-Registry Network Graph Engine v2.0
// Zero-Emoji Institutional Intelligence Canvas Engine:
//   - 4 Animated Layouts (Force-Clustered, Concentric Radial, 6-Tier Stratified, Sector Matrix)
//   - Custom High-DPI Geometric Node Glyphs + Risk Arc Gauges + Bridge Halos
//   - Curved Multi-Edge Bezier Rendering + Directional Arrows + Active Flow Particles
//   - 2D AABB Collision-Free Smart Label Decluttering
//   - Interactive Radar Minimap, Drag & Pin Nodes, Wheel Zoom-to-Cursor, Fullscreen
//   - Exact BFS Shortest-Path Finder with Autocomplete & Verified Multi-Hop Presets
//   - Ego-Network Isolator (Full / 1-Hop / 2-Hop) + 4-Layer Forensic Inspector
//   - High-Res 2x PNG Export (with SHA-256 Watermark) + Filtered Subgraph JSON Export
//   - Synced Sortable/Filterable Master Registry Table + Rust/Wasm SHA-256/GDPR Verifier
// =============================================================================
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 0. Utilities & Shared Platform Parity (Theme Toggle + Visit Counter)
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtInt(n) {
    return Math.round(Number(n || 0)).toLocaleString('bg-BG');
  }

  function fmtEurShort(n) {
    var v = Number(n || 0);
    if (!isFinite(v) || v <= 0) return '—';
    if (v >= 1e9) return '€' + (v / 1e9).toFixed(2).replace('.', ',') + ' млрд.';
    if (v >= 1e6) return '€' + (v / 1e6).toFixed(1).replace('.', ',') + ' млн.';
    if (v >= 1e3) return '€' + Math.round(v / 1e3).toLocaleString('bg-BG') + ' хил.';
    return '€' + Math.round(v).toLocaleString('bg-BG');
  }

  function fmtEurExact(n) {
    var v = Number(n || 0);
    if (!isFinite(v) || v <= 0) return '€0';
    return '€' + Math.round(v).toLocaleString('bg-BG');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('sigma3_theme', theme);
      localStorage.setItem('nasvetlo_theme', theme);
    } catch (e) {}
    var btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.textContent = theme === 'dark' ? 'Светъл режим' : 'Тъмен режим';
      btn.title = theme === 'dark' ? 'Превключи на Светъл режим' : 'Превключи на Тъмен режим';
    }
  }

  function initThemeAndVisits() {
    var saved = 'light';
    try {
      saved = localStorage.getItem('sigma3_theme') || localStorage.getItem('nasvetlo_theme') || 'light';
    } catch (e) {}
    applyTheme(saved === 'dark' ? 'dark' : 'light');

    var btn = document.getElementById('themeToggleBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
      });
    }

    // Visit Counter Parity
    var ENDPOINT = 'https://nasvetlo-visits.anchialo-v2.workers.dev';
    var wrap = document.getElementById('nasvetloVisitCounter');
    var sepEl = document.getElementById('nasvetloVisitSep');
    var footerWrap = document.getElementById('nasvetloFooterVisits');
    if (!wrap && !footerWrap) return;

    var SESSION_KEY = 'nasvetlo_visit_counted_v1';
    var FLOOR_KEY = 'nasvetlo_visit_floor_v1';
    var renderCount = function (total) {
      var n = Number(total);
      if (!isFinite(n) || n < 0) return;
      var floor = 0;
      try { floor = parseInt(localStorage.getItem(FLOOR_KEY) || '0', 10) || 0; } catch (e) {}
      var displayVal = Math.max(Math.floor(n), floor);
      try { if (displayVal > floor) localStorage.setItem(FLOOR_KEY, String(displayVal)); } catch (e) {}
      var formatted = fmtInt(displayVal);
      if (wrap) {
        wrap.innerHTML = '<span class="visit-dot" aria-hidden="true"></span><span>Посещения:</span><strong id="nasvetloVisitCount">' + formatted + '</strong>';
        wrap.hidden = false;
        wrap.style.display = '';
      }
      if (sepEl) {
        sepEl.textContent = '·';
        sepEl.hidden = false;
        sepEl.style.display = '';
      }
      if (footerWrap) {
        footerWrap.innerHTML = 'Посещения: <strong id="nasvetloFooterVisitCount">' + formatted + '</strong>';
        footerWrap.hidden = false;
        footerWrap.style.display = '';
      }
    };

    var alreadyCounted = false;
    try { alreadyCounted = sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) {}
    fetch(alreadyCounted ? ENDPOINT + '/stats' : ENDPOINT + '/hit', {
      method: alreadyCounted ? 'GET' : 'POST',
      mode: 'cors',
      credentials: 'omit',
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.ok && typeof data.total === 'number') {
          if (data.counted || !alreadyCounted) {
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
          }
          renderCount(data.total);
        }
      })
      .catch(function () {
        try {
          var cached = parseInt(localStorage.getItem(FLOOR_KEY) || '0', 10);
          if (cached > 0) renderCount(cached);
        } catch (e) {}
      });
  }

  // ---------------------------------------------------------------------------
  // 1. Metadata & Precision Monochrome SVG Templates (ZERO EMOJIS)
  // ---------------------------------------------------------------------------
  var TYPE_META = {
    ubo: {
      label: 'Краен собственик (ЗМИП чл. 63)',
      short: 'ЗМИП UBO',
      color: '#059669',
      glow: 'rgba(5, 150, 105, 0.42)',
      shape: 'pentagon',
      tier: 0,
    },
    official: {
      label: 'Публично лице (ЗПК)',
      short: 'ЗПК ЛИЦЕ',
      color: '#d97706',
      glow: 'rgba(217, 119, 6, 0.35)',
      shape: 'ring',
      tier: 1,
    },
    authority: {
      label: 'Възложител / Ведомство',
      short: 'ВЪЗЛОЖИТЕЛ',
      color: '#2563eb',
      glow: 'rgba(37, 99, 235, 0.35)',
      shape: 'shield',
      tier: 2,
    },
    company: {
      label: 'Фирма / ДЗЗД / Холдинг',
      short: 'ФИРМА',
      color: '#e11d48',
      glow: 'rgba(225, 29, 72, 0.35)',
      shape: 'hexagon',
      tier: 3,
    },
    lawyer: {
      label: 'Адвокат / Кантора',
      short: 'КАНТОРА',
      color: '#0891b2',
      glow: 'rgba(8, 145, 178, 0.35)',
      shape: 'square',
      tier: 4,
    },
    judge: {
      label: 'Съдия / Магистрат',
      short: 'СЪДИЯ',
      color: '#7c3aed',
      glow: 'rgba(124, 58, 237, 0.38)',
      shape: 'octagon',
      tier: 5,
    },
    case: {
      label: 'Съдебно дело / Спор',
      short: 'ДЕЛО ЕИСС',
      color: '#db2777',
      glow: 'rgba(219, 39, 119, 0.35)',
      shape: 'diamond',
      tier: 6,
    },
  };

  var EDGE_META = {
    beneficial_owner: { label: 'Действителен собственик (ЗМИП)', color: '#10b981', dashed: false },
    holding_control: { label: 'Холдингов контрол / Феникс', color: '#f97316', dashed: true },
    consortium_member: { label: 'Участие в мега-консорциум (ДЗЗД)', color: '#eab308', dashed: false },
    political_donor: { label: 'Партиен дарител (ЕРИК × ЗОП)', color: '#f43f5e', dashed: true },
    cartel_rotation: { label: 'Картелна ротация / Салами-нарязване', color: '#a855f7', dashed: true },
    state_concession: { label: 'Концесия / Държавен резерв (МЕ / ЗЗНН)', color: '#14b8a6', dashed: false },
    license_violation: { label: 'Изтекъл / Отнет лиценз × ЗОП (ДНСК / МВР)', color: '#dc2626', dashed: true },
    ivss_sanction: { label: 'ИВСС санкция / Неподадена декларация (ЗСВ)', color: '#c026d3', dashed: true },
    won_zop: { label: 'ЗОП договор', color: '#22c55e', dashed: false },
    conflict_of_interest: { label: 'Свързаност чл. 49 ЗПК', color: '#ef4444', dashed: true },
    owns_share: { label: 'Собственост / Участие в ТР', color: '#f59e0b', dashed: false },
    awarded_legal_tender: { label: 'Правни услуги (Модул J3)', color: '#06b6d4', dashed: false },
    presided_case: { label: 'Съдия / ЕИСС концентрация', color: '#8b5cf6', dashed: false },
    disputes_with: { label: 'Търговски / Съдебен спор', color: '#ec4899', dashed: false },
    represented_by: { label: 'Процесуално представителство', color: '#38bdf8', dashed: true },
  };

  var CLUSTER_META = {
    ROAD_SECTOR: { title: 'Инфраструктура & АПИ', color: '#f97316', short: 'ИНФРАСТРУКТУРА' },
    MUNICIPAL_AFFILIATION: { title: 'Местна власт · чл. 49 ЗПК', color: '#eab308', short: 'МЕСТНА ВЛАСТ · ЗПК' },
    JUDICIAL_CONCENTRATION: { title: 'Съдебна концентрация & J3', color: '#8b5cf6', short: 'СЪДЕБНА МРЕЖА · J3' },
    ENERGY_SECTOR: { title: 'Енергетика & ВиК', color: '#06b6d4', short: 'ЕНЕРГЕТИКА & ВИК' },
    HEALTH_SECTOR: { title: 'Здравеопазване & ТЕЛК', color: '#ec4899', short: 'ЗДРАВЕОПАЗВАНЕ · ТЕЛК' },
  };

  var STRATIFIED_HEADERS = [
    { tier: 0, type: 'ubo', title: 'КРАЙНИ СОБСТВЕНИЦИ (ЗМИП)', color: '#059669' },
    { tier: 1, type: 'official', title: 'ПУБЛИЧНИ ЛИЦА (ЗПК)', color: '#d97706' },
    { tier: 2, type: 'authority', title: 'ВЪЗЛОЖИТЕЛИ / ОРГАНИ', color: '#2563eb' },
    { tier: 3, type: 'company', title: 'ФИРМИ / ДЗЗД / ХОЛДИНГИ', color: '#e11d48' },
    { tier: 4, type: 'lawyer', title: 'АДВОКАТИ / КАНТОРИ (J3)', color: '#0891b2' },
    { tier: 5, type: 'judge', title: 'СЪДИИ / МАГИСТРАТИ', color: '#7c3aed' },
    { tier: 6, type: 'case', title: 'СЪДЕБНИ ДЕЛА (ЕИСС)', color: '#db2777' },
  ];

  function getSvgGlyphHtml(type, size) {
    var sz = size || 13;
    var m = TYPE_META[type] || TYPE_META.company;
    var c = m.color;
    if (type === 'ubo') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.2 14.5,6 12,14 4,14 1.5,6" fill="' + c + '" fill-opacity="0.26" stroke="' + c + '" stroke-width="1.6"/><circle cx="8" cy="8.2" r="2.1" fill="' + c + '"/></svg>';
    }
    if (type === 'company') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.5 14,5 14,11 8,14.5 2,11 2,5" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/></svg>';
    }
    if (type === 'authority') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5L13.5 3.8V8.2C13.5 11.4 11.1 13.7 8 14.8C4.9 13.7 2.5 11.4 2.5 8.2V3.8L8 1.5Z" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/></svg>';
    }
    if (type === 'judge') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><polygon points="5.2,1.5 10.8,1.5 14.5,5.2 14.5,10.8 10.8,14.5 5.2,14.5 1.5,10.8 1.5,5.2" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/></svg>';
    }
    if (type === 'lawyer') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.5" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/></svg>';
    }
    if (type === 'official') {
      return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/><circle cx="8" cy="8" r="2.3" fill="' + c + '"/></svg>';
    }
    return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 16 16" aria-hidden="true"><polygon points="8,1.2 14.8,8 8,14.8 1.2,8" fill="' + c + '" fill-opacity="0.22" stroke="' + c + '" stroke-width="1.6"/></svg>';
  }

  // ---------------------------------------------------------------------------
  // 2. Main Graph Engine Boot
  // ---------------------------------------------------------------------------
  function boot() {
    initThemeAndVisits();

    var payloadEl = document.getElementById('mrezhataGraphPayload');
    var canvas = document.getElementById('mrezhaCanvas');
    var container = document.getElementById('canvasContainer');
    if (!payloadEl || !canvas || !container) return;

    var rawData;
    try {
      rawData = JSON.parse(payloadEl.textContent || '{}');
    } catch (e) {
      return;
    }

    var summary = rawData.summary || {};
    var rawNodes = rawData.nodes || [];
    var rawEdges = rawData.edges || [];

    var ctx = canvas.getContext('2d');
    var minimapCanvas = document.getElementById('mrezhaMinimap');
    var minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    // Viewport & Camera State
    var width = container.clientWidth || 1000;
    var height = container.clientHeight || 680;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var cam = { x: width / 2, y: height / 2, zoom: 0.72 };
    var camAnim = null; // { sx, sy, sz, tx, ty, tz, start, dur }

    // Canvas Visual Mode ('dark' telemetry obsidian vs 'light' archival print)
    var canvasTheme = 'dark';

    // Layout & Simulation State
    var layoutMode = 'force'; // 'force' | 'radial' | 'stratified' | 'matrix'
    var sizeMetric = 'centrality'; // 'centrality' | 'amount' | 'risk' | 'degree'
    var physicsPaused = false;
    var alpha = 1.0;
    var morphAnim = null; // { start, dur, origins: Map, targets: Map }
    var pulsePhase = 0;

    // Filter State
    var ALL_NODE_TYPES = ['ubo', 'company', 'authority', 'judge', 'lawyer', 'official', 'case'];
    var activeTypes = new Set(ALL_NODE_TYPES);
    var activeCluster = 'ALL';
    var activeEdgeKind = 'ALL';
    var minRisk = 0;
    var searchQuery = '';
    var egoDepth = 0; // 0 = Full Graph, 1 = 1-Hop, 2 = 2-Hop

    // Selection & Interaction State
    var selectedNode = null;
    var hoveredNode = null;
    var draggedNode = null;
    var isPanning = false;
    var pointerDownPos = { x: 0, y: 0 };
    var dragMoved = false;
    var panOrigin = { x: 0, y: 0 };
    var activePathIds = null; // Set of node IDs
    var activePathEdgeKeys = null; // Set of edge indices
    var activePathSequence = null; // Array of node IDs

    // Build Indexed Nodes & Adjacency
    var clusterKeys = ['ROAD_SECTOR', 'MUNICIPAL_AFFILIATION', 'JUDICIAL_CONCENTRATION', 'ENERGY_SECTOR', 'HEALTH_SECTOR'];
    var clusterCenters = {};
    var clusterRadius = 380;
    for (var ci = 0; ci < clusterKeys.length; ci++) {
      var ang = (ci / clusterKeys.length) * Math.PI * 2 - Math.PI / 2;
      clusterCenters[clusterKeys[ci]] = {
        x: Math.cos(ang) * clusterRadius,
        y: Math.sin(ang) * clusterRadius * 0.82,
      };
    }

    var simNodes = rawNodes.map(function (n, idx) {
      var cc = clusterCenters[n.cluster] || { x: 0, y: 0 };
      var localAng = (idx * 2.399963) % (Math.PI * 2); // golden angle spiral
      var localR = 35 + Math.sqrt((idx % 45) + 1) * 28;
      return Object.assign({}, n, {
        x: cc.x + Math.cos(localAng) * localR,
        y: cc.y + Math.sin(localAng) * localR,
        vx: 0,
        vy: 0,
        radius: 10,
        pinned: false,
      });
    });

    var nodeById = new Map();
    var adjMap = new Map();
    var incidentEdges = new Map();
    simNodes.forEach(function (n) {
      nodeById.set(n.id, n);
      adjMap.set(n.id, []);
      incidentEdges.set(n.id, []);
    });

    // Pair grouping for smooth parallel Bezier offsets
    var pairBuckets = new Map();
    var simEdges = [];
    rawEdges.forEach(function (e) {
      var sNode = nodeById.get(e.source);
      var tNode = nodeById.get(e.target);
      if (!sNode || !tNode) return;
      var pk = e.source < e.target ? e.source + '||' + e.target : e.target + '||' + e.source;
      if (!pairBuckets.has(pk)) pairBuckets.set(pk, []);
      var idxInPair = pairBuckets.get(pk).length;
      var edgeObj = Object.assign({}, e, {
        idx: simEdges.length,
        sourceNode: sNode,
        targetNode: tNode,
        pairKey: pk,
        pairIdx: idxInPair,
        pairCount: 1,
      });
      pairBuckets.get(pk).push(edgeObj);
      simEdges.push(edgeObj);
      adjMap.get(e.source).push({ nodeId: e.target, edge: edgeObj });
      adjMap.get(e.target).push({ nodeId: e.source, edge: edgeObj });
      incidentEdges.get(e.source).push(edgeObj);
      incidentEdges.get(e.target).push(edgeObj);
    });
    pairBuckets.forEach(function (list) {
      list.forEach(function (ed) { ed.pairCount = list.length; });
    });

    // Dynamic Radius Computation
    function recomputeNodeRadii() {
      var maxAmt = 1;
      var maxDeg = 1;
      for (var i = 0; i < simNodes.length; i++) {
        if (simNodes[i].amountEur > maxAmt) maxAmt = simNodes[i].amountEur;
        if (simNodes[i].degree > maxDeg) maxDeg = simNodes[i].degree;
      }
      for (var j = 0; j < simNodes.length; j++) {
        var n = simNodes[j];
        var t = 0.25;
        if (sizeMetric === 'centrality') {
          t = (n.centralityScore || 0) / 100;
        } else if (sizeMetric === 'amount') {
          t = n.amountEur > 0 ? Math.log1p(n.amountEur) / Math.log1p(maxAmt) : 0.08;
        } else if (sizeMetric === 'risk') {
          t = Math.max(0, (n.riskScore - 40) / 60);
        } else if (sizeMetric === 'degree') {
          t = Math.log1p(n.degree || 0) / Math.log1p(maxDeg);
        }
        var base = n.type === 'case' ? 7.5 : 9;
        n.radius = base + Math.max(0, Math.min(1, t)) * 13.5;
      }
    }
    recomputeNodeRadii();

    // -------------------------------------------------------------------------
    // 3. Ego-Network & Visibility Evaluation
    // -------------------------------------------------------------------------
    var egoSet = null;
    function recomputeEgoSet() {
      if (!selectedNode || egoDepth === 0) {
        egoSet = null;
        return;
      }
      var visited = new Set([selectedNode.id]);
      var frontier = [selectedNode.id];
      for (var hop = 0; hop < egoDepth; hop++) {
        var next = [];
        for (var i = 0; i < frontier.length; i++) {
          var list = adjMap.get(frontier[i]) || [];
          for (var j = 0; j < list.length; j++) {
            var nb = list[j].nodeId;
            if (!visited.has(nb)) {
              visited.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
      egoSet = visited;
    }

    function isNodeVisible(n) {
      if (activePathIds && activePathIds.has(n.id)) return true;
      if (egoSet && !egoSet.has(n.id)) return false;
      if (!activeTypes.has(n.type)) return false;
      if (activeCluster !== 'ALL') {
        var inCluster = n.cluster === activeCluster || (n.allClusters && n.allClusters.indexOf(activeCluster) !== -1);
        if (!inCluster) return false;
      }
      if (n.riskScore < minRisk) return false;
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var matchLabel = (n.label || '').toLowerCase().indexOf(q) !== -1;
        var matchEik = (n.eik || '').toLowerCase().indexOf(q) !== -1;
        var matchSub = (n.subLabel || '').toLowerCase().indexOf(q) !== -1;
        var matchCourt = (n.details && n.details.court || '').toLowerCase().indexOf(q) !== -1;
        if (!matchLabel && !matchEik && !matchSub && !matchCourt) return false;
      }
      return true;
    }

    function isEdgeVisible(e) {
      if (activePathEdgeKeys && activePathEdgeKeys.has(e.idx)) return true;
      if (activeEdgeKind !== 'ALL' && e.kind !== activeEdgeKind) return false;
      return isNodeVisible(e.sourceNode) && isNodeVisible(e.targetNode);
    }

    var telemetryEl = document.getElementById('mrezhaTelemetryStatus');
    function updateTelemetryBar() {
      if (!telemetryEl) return;
      var visNodes = 0;
      var visEdges = 0;
      for (var i = 0; i < simNodes.length; i++) if (isNodeVisible(simNodes[i])) visNodes++;
      for (var j = 0; j < simEdges.length; j++) if (isEdgeVisible(simEdges[j])) visEdges++;
      var modeNames = { force: 'Клъстерна физика', radial: 'Концентрична йерархия', stratified: '7-слойна верига', matrix: 'Секторна матрица' };
      telemetryEl.innerHTML =
        '<span>Видими: <strong>' + visNodes + '</strong> / ' + simNodes.length + ' възела</span>' +
        '<span class="tel-sep">·</span>' +
        '<span>Връзки: <strong>' + visEdges + '</strong></span>' +
        '<span class="tel-sep">·</span>' +
        '<span>Оформление: <strong>' + (modeNames[layoutMode] || layoutMode) + '</strong></span>' +
        '<span class="tel-sep">·</span>' +
        '<span>Мащаб: <strong>' + Math.round(cam.zoom * 100) + '%</strong></span>';
    }

    // -------------------------------------------------------------------------
    // 4. Topological Layouts & Smooth Morphing
    // -------------------------------------------------------------------------
    var matrixBoxes = [];

    function computeRadialTargets() {
      var targets = new Map();
      var rings = [[], [], [], []];
      simNodes.forEach(function (n) {
        var cs = n.centralityScore || 0;
        if (cs >= 65) rings[0].push(n);
        else if (cs >= 42) rings[1].push(n);
        else if (cs >= 24) rings[2].push(n);
        else rings[3].push(n);
      });
      var radii = [120, 275, 455, 650];
      rings.forEach(function (group, rIdx) {
        group.sort(function (a, b) {
          return clusterKeys.indexOf(a.cluster) - clusterKeys.indexOf(b.cluster) || b.riskScore - a.riskScore;
        });
        var count = group.length || 1;
        var baseR = radii[rIdx];
        for (var i = 0; i < group.length; i++) {
          var a = (i / count) * Math.PI * 2 - Math.PI / 2;
          var r = baseR + (count > 55 ? (i % 2) * 44 : 0);
          targets.set(group[i].id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
      });
      return targets;
    }

    function computeStratifiedTargets() {
      var targets = new Map();
      var cols = [[], [], [], [], [], [], []];
      simNodes.forEach(function (n) {
        var tier = (TYPE_META[n.type] && TYPE_META[n.type].tier != null) ? TYPE_META[n.type].tier : 3;
        cols[tier].push(n);
      });
      var colSpacing = 240;
      var startX = -((cols.length - 1) * colSpacing) / 2;
      cols.forEach(function (group, cIdx) {
        group.sort(function (a, b) {
          return b.centralityScore - a.centralityScore || b.riskScore - a.riskScore || b.amountEur - a.amountEur;
        });
        var subCols = group.length > 34 ? 2 : 1;
        var rowsPerCol = Math.ceil(group.length / subCols);
        var rowStep = Math.max(36, Math.min(54, 1150 / Math.max(rowsPerCol, 1)));
        var startY = -((rowsPerCol - 1) * rowStep) / 2 + 40;
        for (var i = 0; i < group.length; i++) {
          var sc = i % subCols;
          var r = Math.floor(i / subCols);
          var offsetX = subCols === 2 ? (sc === 0 ? -42 : 42) : 0;
          targets.set(group[i].id, {
            x: startX + cIdx * colSpacing + offsetX,
            y: startY + r * rowStep,
          });
        }
      });
      return targets;
    }

    function computeMatrixTargets() {
      var targets = new Map();
      matrixBoxes = [];
      var groups = {};
      clusterKeys.forEach(function (k) { groups[k] = []; });
      simNodes.forEach(function (n) {
        var k = groups[n.cluster] ? n.cluster : 'JUDICIAL_CONCENTRATION';
        groups[k].push(n);
      });

      var layouts = [
        { key: 'JUDICIAL_CONCENTRATION', x: -580, y: -390, w: 620, h: 420 },
        { key: 'MUNICIPAL_AFFILIATION', x: 70, y: -390, w: 510, h: 420 },
        { key: 'ROAD_SECTOR', x: -580, y: 65, w: 420, h: 320 },
        { key: 'ENERGY_SECTOR', x: -130, y: 65, w: 350, h: 320 },
        { key: 'HEALTH_SECTOR', x: 250, y: 65, w: 330, h: 320 },
      ];

      layouts.forEach(function (box) {
        var list = groups[box.key] || [];
        list.sort(function (a, b) { return b.centralityScore - a.centralityScore || b.riskScore - a.riskScore; });
        matrixBoxes.push({
          key: box.key,
          title: (CLUSTER_META[box.key] && CLUSTER_META[box.key].short) || box.key,
          color: (CLUSTER_META[box.key] && CLUSTER_META[box.key].color) || '#64748b',
          count: list.length,
          x: box.x,
          y: box.y,
          w: box.w,
          h: box.h,
        });

        var padX = 44;
        var padTop = 58;
        var padBot = 36;
        var innerW = box.w - padX * 2;
        var innerH = box.h - padTop - padBot;
        var cols = Math.max(2, Math.ceil(Math.sqrt(list.length * (innerW / Math.max(innerH, 1)))));
        var rows = Math.max(1, Math.ceil(list.length / cols));
        var dx = cols > 1 ? innerW / (cols - 1) : 0;
        var dy = rows > 1 ? innerH / (rows - 1) : 0;

        for (var i = 0; i < list.length; i++) {
          var c = i % cols;
          var r = Math.floor(i / cols);
          var jitter = (r % 2) * (dx * 0.16);
          targets.set(list[i].id, {
            x: box.x + padX + (cols === 1 ? innerW / 2 : c * dx) + (c < cols - 1 ? jitter : 0),
            y: box.y + padTop + (rows === 1 ? innerH / 2 : r * dy),
          });
        }
      });
      return targets;
    }

    function startMorphTo(targets) {
      var origins = new Map();
      simNodes.forEach(function (n) {
        origins.set(n.id, { x: n.x, y: n.y });
        n.vx = 0;
        n.vy = 0;
      });
      morphAnim = { start: performance.now(), dur: 540, origins: origins, targets: targets };
      requestFrame();
    }

    function setLayoutMode(mode) {
      layoutMode = mode;
      document.querySelectorAll('.mrezha-layout-btn').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-layout') === mode);
      });
      if (mode === 'force') {
        morphAnim = null;
        alpha = 0.92;
        physicsPaused = false;
        updatePauseButton();
        requestFrame();
      } else if (mode === 'radial') {
        alpha = 0;
        startMorphTo(computeRadialTargets());
        setTimeout(function () { fitToVisible(true); }, 560);
      } else if (mode === 'stratified') {
        alpha = 0;
        startMorphTo(computeStratifiedTargets());
        setTimeout(function () { fitToVisible(true); }, 560);
      } else if (mode === 'matrix') {
        alpha = 0;
        startMorphTo(computeMatrixTargets());
        setTimeout(function () { fitToVisible(true); }, 560);
      }
      updateTelemetryBar();
    }

    // Force-Clustered Physics Step (with Collision Avoidance & Convergence Cooling)
    function stepForcePhysics() {
      if (layoutMode !== 'force' || physicsPaused || alpha < 0.004) return false;

      var len = simNodes.length;
      var repulsion = 2150 * alpha;
      var linkRest = 78;

      // Pairwise repulsion + hard collision avoidance
      for (var i = 0; i < len; i++) {
        var n1 = simNodes[i];
        for (var j = i + 1; j < len; j++) {
          var n2 = simNodes[j];
          var dx = n2.x - n1.x;
          var dy = n2.y - n1.y;
          var distSq = dx * dx + dy * dy + 0.25;
          if (distSq > 160000) continue; // spatial cutoff 400px for crisp O(n) avg speed
          var dist = Math.sqrt(distSq);
          var minSep = n1.radius + n2.radius + 16;

          var force = repulsion / distSq;
          if (dist < minSep) {
            force += (minSep - dist) * 0.24;
          }
          var fx = (dx / dist) * force;
          var fy = (dy / dist) * force;
          if (!n1.pinned && n1 !== draggedNode) { n1.vx -= fx; n1.vy -= fy; }
          if (!n2.pinned && n2 !== draggedNode) { n2.vx += fx; n2.vy += fy; }
        }
      }

      // Edge springs
      for (var eIdx = 0; eIdx < simEdges.length; eIdx++) {
        var e = simEdges[eIdx];
        var s = e.sourceNode;
        var t = e.targetNode;
        var edx = t.x - s.x;
        var edy = t.y - s.y;
        var edist = Math.sqrt(edx * edx + edy * edy) + 0.1;
        var sameCluster = s.cluster === t.cluster;
        var kSpring = sameCluster ? 0.042 : 0.015;
        var targetD = sameCluster ? linkRest : linkRest * 2.1;
        var eForce = (edist - targetD) * kSpring * alpha;
        var efx = (edx / edist) * eForce;
        var efy = (edy / edist) * eForce;
        if (!s.pinned && s !== draggedNode) { s.vx += efx; s.vy += efy; }
        if (!t.pinned && t !== draggedNode) { t.vx -= efx; t.vy -= efy; }
      }

      // Cluster gravitational attractors + gentle origin centering
      for (var k = 0; k < len; k++) {
        var n = simNodes[k];
        if (n.pinned || n === draggedNode) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        var cc = clusterCenters[n.cluster] || { x: 0, y: 0 };
        var isBridge = n.allClusters && n.allClusters.length > 1;
        var pull = (isBridge ? 0.008 : 0.018) * alpha;
        n.vx += (cc.x - n.x) * pull;
        n.vy += (cc.y - n.y) * pull;
        n.vx -= n.x * 0.0022 * alpha;
        n.vy -= n.y * 0.0022 * alpha;

        // Clamp max step for stability
        n.vx *= 0.80;
        n.vy *= 0.80;
        var speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (speed > 26) {
          n.vx = (n.vx / speed) * 26;
          n.vy = (n.vy / speed) * 26;
        }
        n.x += n.vx;
        n.y += n.vy;
      }

      alpha *= 0.985;
      return true;
    }

    // Pre-warm 85 ticks synchronously at boot so initial canvas opens clean & untangled!
    for (var warm = 0; warm < 85; warm++) {
      stepForcePhysics();
    }
    alpha = 0.28;

    // -------------------------------------------------------------------------
    // 5. Camera Controls & Smooth Fly-To
    // -------------------------------------------------------------------------
    function animateCameraTo(tx, ty, tz, dur) {
      camAnim = {
        sx: cam.x, sy: cam.y, sz: cam.zoom,
        tx: tx, ty: ty, tz: tz,
        start: performance.now(),
        dur: dur || 420,
      };
      requestFrame();
    }

    function fitToVisible(animate) {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      var count = 0;
      for (var i = 0; i < simNodes.length; i++) {
        var n = simNodes[i];
        if (!isNodeVisible(n)) continue;
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
        count++;
      }
      if (count === 0) return;
      var bw = Math.max(maxX - minX, 160) + 180;
      var bh = Math.max(maxY - minY, 160) + 180;
      var tz = Math.max(0.24, Math.min(1.6, Math.min(width / bw, height / bh)));
      var cx = (minX + maxX) / 2;
      var cy = (minY + maxY) / 2;
      var tx = width / 2 - cx * tz;
      var ty = height / 2 - cy * tz;
      if (animate) animateCameraTo(tx, ty, tz, 460);
      else { cam.x = tx; cam.y = ty; cam.zoom = tz; updateTelemetryBar(); requestFrame(); }
    }

    function flyToNode(n, targetZoom) {
      if (!n) return;
      var tz = targetZoom || Math.max(cam.zoom, 1.38);
      var drawerOffset = (inspector && inspector.classList.contains('is-open') && width > 780) ? -170 : 0;
      animateCameraTo(width / 2 + drawerOffset - n.x * tz, height / 2 - n.y * tz, tz, 440);
    }

    function screenToWorld(sx, sy) {
      return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
    }

    function worldToScreen(wx, wy) {
      return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
    }

    // -------------------------------------------------------------------------
    // 6. High-DPI Geometric Canvas Renderer
    // -------------------------------------------------------------------------
    function resizeCanvas() {
      width = container.clientWidth || 1000;
      height = container.clientHeight || 680;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      if (minimapCanvas) {
        minimapCanvas.width = 186 * dpr;
        minimapCanvas.height = 122 * dpr;
      }
      requestFrame();
    }

    function drawRoundedRect(c, x, y, w, h, r) {
      if (typeof c.roundRect === 'function') {
        c.beginPath();
        c.roundRect(x, y, w, h, r);
        return;
      }
      var rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }

    function drawNodeShapePath(c, shape, x, y, r) {
      c.beginPath();
      if (shape === 'pentagon') {
        for (var p = 0; p < 5; p++) {
          var pa = (p * Math.PI * 2) / 5 - Math.PI / 2;
          var ppx = x + Math.cos(pa) * r * 1.08;
          var ppy = y + Math.sin(pa) * r * 1.08;
          if (p === 0) c.moveTo(ppx, ppy); else c.lineTo(ppx, ppy);
        }
        c.closePath();
      } else if (shape === 'hexagon') {
        for (var i = 0; i < 6; i++) {
          var a = (i * Math.PI) / 3 - Math.PI / 6;
          var px = x + Math.cos(a) * r;
          var py = y + Math.sin(a) * r;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.closePath();
      } else if (shape === 'octagon') {
        for (var o = 0; o < 8; o++) {
          var oa = (o * Math.PI) / 4 + Math.PI / 8;
          var ox = x + Math.cos(oa) * r;
          var oy = y + Math.sin(oa) * r;
          if (o === 0) c.moveTo(ox, oy); else c.lineTo(ox, oy);
        }
        c.closePath();
      } else if (shape === 'diamond') {
        c.moveTo(x, y - r * 1.15);
        c.lineTo(x + r * 1.15, y);
        c.lineTo(x, y + r * 1.15);
        c.lineTo(x - r * 1.15, y);
        c.closePath();
      } else if (shape === 'square') {
        var s = r * 0.88;
        var ch = r * 0.25;
        c.moveTo(x - s + ch, y - s);
        c.lineTo(x + s - ch, y - s);
        c.lineTo(x + s, y - s + ch);
        c.lineTo(x + s, y + s - ch);
        c.lineTo(x + s - ch, y + s);
        c.lineTo(x - s + ch, y + s);
        c.lineTo(x - s, y + s - ch);
        c.lineTo(x - s, y - s + ch);
        c.closePath();
      } else if (shape === 'shield') {
        c.moveTo(x, y - r * 1.08);
        c.lineTo(x + r * 0.92, y - r * 0.62);
        c.lineTo(x + r * 0.88, y + r * 0.15);
        c.quadraticCurveTo(x + r * 0.72, y + r * 0.82, x, y + r * 1.14);
        c.quadraticCurveTo(x - r * 0.72, y + r * 0.82, x - r * 0.88, y + r * 0.15);
        c.lineTo(x - r * 0.92, y - r * 0.62);
        c.closePath();
      } else {
        c.arc(x, y, r, 0, Math.PI * 2);
      }
    }

    function drawNodeInnerMark(c, type, x, y, r, strokeColor) {
      var s = r * 0.44;
      c.save();
      c.strokeStyle = strokeColor;
      c.fillStyle = strokeColor;
      c.lineWidth = Math.max(1.1, r * 0.11);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      if (type === 'ubo') {
        c.beginPath();
        c.arc(x - s * 0.28, y - s * 0.1, s * 0.42, 0, Math.PI * 2);
        c.moveTo(x + s * 0.14, y - s * 0.1);
        c.lineTo(x + s * 0.92, y - s * 0.1);
        c.moveTo(x + s * 0.65, y - s * 0.1);
        c.lineTo(x + s * 0.65, y + s * 0.38);
        c.moveTo(x + s * 0.92, y - s * 0.1);
        c.lineTo(x + s * 0.92, y + s * 0.3);
        c.stroke();
      } else if (type === 'company') {
        c.strokeRect(x - s * 0.85, y - s * 0.8, s * 1.7, s * 1.65);
        c.beginPath();
        c.moveTo(x - s * 0.35, y - s * 0.3); c.lineTo(x - s * 0.35, y + s * 0.35);
        c.moveTo(x + s * 0.35, y - s * 0.3); c.lineTo(x + s * 0.35, y + s * 0.35);
        c.stroke();
      } else if (type === 'authority') {
        c.beginPath();
        c.moveTo(x - s * 0.9, y - s * 0.4); c.lineTo(x, y - s * 0.95); c.lineTo(x + s * 0.9, y - s * 0.4);
        c.moveTo(x - s * 0.6, y - s * 0.25); c.lineTo(x - s * 0.6, y + s * 0.75);
        c.moveTo(x, y - s * 0.25); c.lineTo(x, y + s * 0.75);
        c.moveTo(x + s * 0.6, y - s * 0.25); c.lineTo(x + s * 0.6, y + s * 0.75);
        c.moveTo(x - s * 0.9, y + s * 0.85); c.lineTo(x + s * 0.9, y + s * 0.85);
        c.stroke();
      } else if (type === 'judge') {
        c.beginPath();
        c.moveTo(x, y - s * 0.9); c.lineTo(x, y + s * 0.85);
        c.moveTo(x - s * 0.85, y - s * 0.45); c.lineTo(x + s * 0.85, y - s * 0.45);
        c.moveTo(x - s * 0.55, y + s * 0.85); c.lineTo(x + s * 0.55, y + s * 0.85);
        c.stroke();
      } else if (type === 'lawyer') {
        c.strokeRect(x - s * 0.85, y - s * 0.45, s * 1.7, s * 1.15);
        c.beginPath();
        c.moveTo(x - s * 0.4, y - s * 0.45); c.lineTo(x - s * 0.4, y - s * 0.8); c.lineTo(x + s * 0.4, y - s * 0.8); c.lineTo(x + s * 0.4, y - s * 0.45);
        c.stroke();
      } else if (type === 'official') {
        c.beginPath();
        c.arc(x, y - s * 0.32, s * 0.38, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(x, y + s * 0.92, s * 0.72, Math.PI * 1.18, Math.PI * 1.82);
        c.stroke();
      } else if (type === 'case') {
        c.beginPath();
        c.moveTo(x - s * 0.65, y - s * 0.25); c.lineTo(x + s * 0.65, y - s * 0.25);
        c.moveTo(x - s * 0.65, y + s * 0.25); c.lineTo(x + s * 0.4, y + s * 0.25);
        c.stroke();
      }
      c.restore();
    }

    function drawBackgroundArchitecture(c, isLight) {
      // Base canvas fill
      c.fillStyle = isLight ? '#f7f5f0' : '#060911';
      c.fillRect(0, 0, width, height);

      // Subtle architectural dot grid in world space
      var gridStep = cam.zoom < 0.45 ? 120 : cam.zoom < 1.1 ? 60 : 30;
      var topLeft = screenToWorld(0, 0);
      var botRight = screenToWorld(width, height);
      var startX = Math.floor(topLeft.x / gridStep) * gridStep;
      var startY = Math.floor(topLeft.y / gridStep) * gridStep;

      c.save();
      c.translate(cam.x, cam.y);
      c.scale(cam.zoom, cam.zoom);

      c.fillStyle = isLight ? 'rgba(23, 21, 17, 0.10)' : 'rgba(148, 163, 184, 0.14)';
      var dotR = Math.max(0.7, 1.1 / cam.zoom);
      for (var gx = startX; gx <= botRight.x; gx += gridStep) {
        for (var gy = startY; gy <= botRight.y; gy += gridStep) {
          c.fillRect(gx - dotR * 0.5, gy - dotR * 0.5, dotR, dotR);
        }
      }

      // Layout-Specific Architectural Guides
      if (layoutMode === 'radial') {
        var rGuides = [
          { r: 120, lbl: 'ЯДРО · ЦЕНТРАЛНОСТ 65+' },
          { r: 275, lbl: 'СРЕДЕН ПРЪСТЕН · 42–64' },
          { r: 455, lbl: 'ВЪНШЕН СЛОЙ · 24–41' },
          { r: 650, lbl: 'ПЕРИФЕРИЯ · 0–23' },
        ];
        rGuides.forEach(function (rg) {
          c.beginPath();
          c.setLineDash([5 / cam.zoom, 6 / cam.zoom]);
          c.arc(0, 0, rg.r, 0, Math.PI * 2);
          c.strokeStyle = isLight ? 'rgba(23, 21, 17, 0.13)' : 'rgba(148, 163, 184, 0.16)';
          c.lineWidth = 1 / cam.zoom;
          c.stroke();
          c.setLineDash([]);
          c.font = '600 ' + Math.round(10 / Math.max(0.55, Math.min(1.2, cam.zoom))) + 'px "IBM Plex Mono", monospace';
          c.fillStyle = isLight ? 'rgba(76, 71, 64, 0.7)' : 'rgba(148, 163, 184, 0.55)';
          c.textAlign = 'center';
          c.fillText(rg.lbl, 0, -rg.r - 8);
        });
      } else if (layoutMode === 'stratified') {
        var colSpacing = 240;
        var sX = -((STRATIFIED_HEADERS.length - 1) * colSpacing) / 2;
        STRATIFIED_HEADERS.forEach(function (hdr) {
          var cx = sX + hdr.tier * colSpacing;
          c.beginPath();
          c.setLineDash([4 / cam.zoom, 6 / cam.zoom]);
          c.moveTo(cx, -590);
          c.lineTo(cx, 660);
          c.strokeStyle = isLight ? 'rgba(23, 21, 17, 0.10)' : 'rgba(148, 163, 184, 0.12)';
          c.lineWidth = 1 / cam.zoom;
          c.stroke();
          c.setLineDash([]);

          c.fillStyle = hdr.color;
          c.fillRect(cx - 95, -622, 190, 2.5);
          c.font = '700 11px "IBM Plex Mono", monospace';
          c.textAlign = 'center';
          c.fillText(hdr.title, cx, -630);
        });
      } else if (layoutMode === 'matrix') {
        matrixBoxes.forEach(function (mb) {
          c.fillStyle = isLight ? 'rgba(255, 255, 255, 0.55)' : 'rgba(15, 23, 42, 0.45)';
          c.strokeStyle = isLight ? 'rgba(23, 21, 17, 0.16)' : 'rgba(148, 163, 184, 0.22)';
          c.lineWidth = 1.2 / cam.zoom;
          c.beginPath();
          c.rect(mb.x, mb.y, mb.w, mb.h);
          c.fill();
          c.stroke();

          c.fillStyle = mb.color;
          c.fillRect(mb.x, mb.y, mb.w, 3);
          c.font = '700 11px "IBM Plex Mono", monospace';
          c.textAlign = 'left';
          c.fillText(mb.title + ' (' + mb.count + ')', mb.x + 14, mb.y + 22);
        });
      } else if (layoutMode === 'force') {
        // Subtle cluster zone halos
        clusterKeys.forEach(function (ck) {
          var cc = clusterCenters[ck];
          var cm = CLUSTER_META[ck];
          c.beginPath();
          c.arc(cc.x, cc.y, 175, 0, Math.PI * 2);
          c.fillStyle = isLight ? 'rgba(23, 21, 17, 0.022)' : 'rgba(30, 41, 59, 0.18)';
          c.fill();
          c.font = '700 10.5px "IBM Plex Mono", monospace';
          c.fillStyle = isLight ? 'rgba(76, 71, 64, 0.55)' : 'rgba(148, 163, 184, 0.44)';
          c.textAlign = 'center';
          c.fillText(cm.short, cc.x, cc.y - 184);
        });
      }

      c.restore();
    }

    function drawGraphToContext(c, isLight, exportMode) {
      drawBackgroundArchitecture(c, isLight);

      var focusNode = selectedNode || hoveredNode;
      var focusNeighbors = null;
      if (focusNode) {
        focusNeighbors = new Set([focusNode.id]);
        var inc = incidentEdges.get(focusNode.id) || [];
        for (var fi = 0; fi < inc.length; fi++) {
          focusNeighbors.add(inc[fi].source);
          focusNeighbors.add(inc[fi].target);
        }
      }

      c.save();
      c.translate(cam.x, cam.y);
      c.scale(cam.zoom, cam.zoom);

      // 1. Render Edges (Curved Bezier + Directional Arrows + Active Pulses)
      var edgeLabelQueue = [];
      for (var ei = 0; ei < simEdges.length; ei++) {
        var e = simEdges[ei];
        if (!isEdgeVisible(e)) continue;

        var s = e.sourceNode;
        var t = e.targetNode;
        var em = EDGE_META[e.kind] || { color: '#64748b', dashed: false };
        var isPathEdge = Boolean(activePathEdgeKeys && activePathEdgeKeys.has(e.idx));
        var isFocusEdge = Boolean(focusNode && (e.source === focusNode.id || e.target === focusNode.id));
        var isDimmed = Boolean((activePathIds && !isPathEdge) || (!activePathIds && focusNode && !isFocusEdge));

        // Quadratic Bezier control point with parallel separation
        var dx = t.x - s.x;
        var dy = t.y - s.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / dist;
        var ny = dx / dist;
        var offset = e.pairCount > 1 ? (e.pairIdx - (e.pairCount - 1) / 2) * 32 : 14;
        var curveMag = Math.min(dist * 0.22, Math.abs(offset)) * (offset >= 0 ? 1 : -1);
        var cpx = (s.x + t.x) / 2 + nx * curveMag;
        var cpy = (s.y + t.y) / 2 + ny * curveMag;

        c.save();
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.quadraticCurveTo(cpx, cpy, t.x, t.y);

        if (em.dashed && !isPathEdge) {
          c.setLineDash([5, 4]);
        }

        if (isPathEdge) {
          c.strokeStyle = '#f59e0b';
          c.lineWidth = 3.2;
          c.shadowColor = 'rgba(245, 158, 11, 0.55)';
          c.shadowBlur = 10;
        } else if (isFocusEdge) {
          c.strokeStyle = em.color;
          c.lineWidth = 2.2;
          c.globalAlpha = 0.95;
        } else if (isDimmed) {
          c.strokeStyle = isLight ? 'rgba(23, 21, 17, 0.08)' : 'rgba(148, 163, 184, 0.07)';
          c.lineWidth = 0.9;
        } else {
          c.strokeStyle = em.color;
          c.globalAlpha = isLight ? 0.34 : 0.28;
          c.lineWidth = e.amountEur >= 5e7 ? 2.0 : e.amountEur >= 5e6 ? 1.4 : 1.05;
        }
        c.stroke();
        c.restore();

        // Directional Arrowhead on active or zoomed edges
        if (isPathEdge || isFocusEdge || (!isDimmed && cam.zoom >= 0.85)) {
          var tEnd = Math.max(0.55, 1 - (t.radius + 5) / dist);
          var ax = (1 - tEnd) * (1 - tEnd) * s.x + 2 * (1 - tEnd) * tEnd * cpx + tEnd * tEnd * t.x;
          var ay = (1 - tEnd) * (1 - tEnd) * s.y + 2 * (1 - tEnd) * tEnd * cpy + tEnd * tEnd * t.y;
          var dtx = 2 * (1 - tEnd) * (cpx - s.x) + 2 * tEnd * (t.x - cpx);
          var dty = 2 * (1 - tEnd) * (cpy - s.y) + 2 * tEnd * (t.y - cpy);
          var ang = Math.atan2(dty, dtx);
          var headLen = isPathEdge ? 9 : 6.5;

          c.save();
          c.fillStyle = isPathEdge ? '#f59e0b' : em.color;
          c.globalAlpha = isPathEdge || isFocusEdge ? 1 : 0.55;
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(ax - headLen * Math.cos(ang - 0.42), ay - headLen * Math.sin(ang - 0.42));
          c.lineTo(ax - headLen * Math.cos(ang + 0.42), ay - headLen * Math.sin(ang + 0.42));
          c.closePath();
          c.fill();
          c.restore();
        }

        // Animated flow pulse particle along highlighted / path edges
        if (!exportMode && (isPathEdge || isFocusEdge)) {
          var pt = (pulsePhase + (e.idx % 7) * 0.14) % 1;
          var px = (1 - pt) * (1 - pt) * s.x + 2 * (1 - pt) * pt * cpx + pt * pt * t.x;
          var py = (1 - pt) * (1 - pt) * s.y + 2 * (1 - pt) * pt * cpy + pt * pt * t.y;
          c.save();
          c.beginPath();
          c.arc(px, py, isPathEdge ? 3.5 : 2.4, 0, Math.PI * 2);
          c.fillStyle = isPathEdge ? '#fef08a' : '#ffffff';
          c.fill();
          c.restore();

          if (cam.zoom >= 0.72 || isPathEdge) {
            var mx = 0.25 * s.x + 0.5 * cpx + 0.25 * t.x;
            var my = 0.25 * s.y + 0.5 * cpy + 0.25 * t.y;
            edgeLabelQueue.push({
              x: mx,
              y: my,
              text: (e.label || em.label).slice(0, 34),
              primaryId: (e.primaryId || '').slice(0, 28),
              isPath: isPathEdge,
            });
          }
        }
      }

      // 2. Render Nodes (Geometric Shapes + Risk Arcs + Bridge Halos + Inner Vector Marks)
      var labelCandidates = [];
      for (var ni = 0; ni < simNodes.length; ni++) {
        var n = simNodes[ni];
        if (!isNodeVisible(n)) continue;

        var tm = TYPE_META[n.type] || TYPE_META.company;
        var isSelected = selectedNode === n;
        var isHovered = hoveredNode === n;
        var isPathNode = Boolean(activePathIds && activePathIds.has(n.id));
        var isNeighbor = Boolean(focusNeighbors && focusNeighbors.has(n.id));
        var isDimmed = Boolean((activePathIds && !isPathNode) || (!activePathIds && focusNode && !isNeighbor));
        var isBridge = n.allClusters && n.allClusters.length > 1;
        var r = n.radius * (isSelected || isPathNode ? 1.22 : isHovered ? 1.12 : 1.0);

        c.save();
        if (isDimmed) c.globalAlpha = 0.16;

        // Multi-cluster bridge dashed outer halo
        if (isBridge && !isDimmed) {
          c.save();
          c.beginPath();
          c.setLineDash([3, 3]);
          c.arc(n.x, n.y, r + 6.5, 0, Math.PI * 2);
          c.strokeStyle = isLight ? '#b45309' : '#fbbf24';
          c.lineWidth = 1.15;
          c.stroke();
          c.restore();
        }

        // Glow halo for selected, path, or critical high-centrality hubs
        if ((isSelected || isPathNode || isHovered) && !isDimmed) {
          c.save();
          c.shadowColor = isPathNode ? 'rgba(245, 158, 11, 0.85)' : tm.glow;
          c.shadowBlur = isSelected || isPathNode ? 22 : 14;
          drawNodeShapePath(c, tm.shape, n.x, n.y, r + 1.5);
          c.fillStyle = isPathNode ? '#f59e0b' : tm.color;
          c.fill();
          c.restore();
        }

        // Perimeter Risk Gauge Arc
        if (!isDimmed && (r * cam.zoom >= 7 || isSelected || isHovered || isPathNode)) {
          var riskFrac = Math.max(0.05, Math.min(1, (n.riskScore || 0) / 100));
          var riskCol = n.riskScore >= 80 ? '#ef4444' : n.riskScore >= 60 ? '#f59e0b' : '#10b981';
          c.beginPath();
          c.arc(n.x, n.y, r + 3.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * riskFrac);
          c.strokeStyle = riskCol;
          c.lineWidth = isSelected ? 2.4 : 1.6;
          c.stroke();
        }

        // Main Geometric Body
        drawNodeShapePath(c, tm.shape, n.x, n.y, r);
        c.fillStyle = isLight ? '#ffffff' : '#0f172a';
        c.fill();
        c.fillStyle = tm.color;
        c.globalAlpha = isDimmed ? 0.16 : (isSelected || isPathNode ? 0.96 : 0.82);
        c.fill();

        c.globalAlpha = isDimmed ? 0.16 : 1;
        c.strokeStyle = isSelected || isPathNode ? '#ffffff' : (isLight ? '#171511' : 'rgba(255, 255, 255, 0.55)');
        c.lineWidth = isSelected || isPathNode ? 2.4 : 1.25;
        c.stroke();

        // Inner Crisp Vector Icon Symbol (when large enough on screen)
        if (!isDimmed && r * cam.zoom >= 10) {
          drawNodeInnerMark(c, n.type, n.x, n.y, r, '#ffffff');
        }

        // Pinned marker diamond
        if (n.pinned && !isDimmed) {
          c.fillStyle = '#fbbf24';
          c.beginPath();
          c.arc(n.x + r * 0.78, n.y - r * 0.78, 3.2, 0, Math.PI * 2);
          c.fill();
        }

        c.restore();

        // Queue label candidate with priority score
        if (!isDimmed) {
          var prio = (n.centralityScore || 0) + (n.riskScore || 0) * 0.35 + (isBridge ? 60 : 0);
          if (isSelected) prio += 2000;
          if (isPathNode) prio += 1500;
          if (isHovered) prio += 1400;
          if (isNeighbor) prio += 700;
          labelCandidates.push({ node: n, r: r, prio: prio, important: isSelected || isPathNode || isHovered || isNeighbor });
        }
      }

      c.restore();

      // 3. Render Collision-Free Smart Screen-Space Labels (AABB Decluttering!)
      labelCandidates.sort(function (a, b) { return b.prio - a.prio; });
      var occupied = [];
      var maxLabels = cam.zoom >= 1.3 ? 120 : cam.zoom >= 0.85 ? 58 : 26;
      var placedCount = 0;

      c.save();
      for (var li = 0; li < labelCandidates.length; li++) {
        var cand = labelCandidates[li];
        if (!cand.important && placedCount >= maxLabels) break;

        var scr = worldToScreen(cand.node.x, cand.node.y);
        if (scr.x < -80 || scr.x > width + 80 || scr.y < -30 || scr.y > height + 30) continue;

        var rawTxt = cand.node.label || '';
        var txt = rawTxt.length > 26 ? rawTxt.slice(0, 25) + '…' : rawTxt;
        var fontSize = cand.important ? 11.5 : 10.5;
        c.font = (cand.important ? '700 ' : '500 ') + fontSize + 'px "IBM Plex Sans", sans-serif';
        var tw = c.measureText(txt).width;
        var padX = 6;
        var boxW = tw + padX * 2;
        var boxH = fontSize + 7;
        var bx = scr.x - boxW / 2;
        var by = scr.y + cand.r * cam.zoom + 6;

        // Check AABB collision against higher-priority labels
        var collides = false;
        if (!cand.important) {
          for (var oi = 0; oi < occupied.length; oi++) {
            var ob = occupied[oi];
            if (bx < ob.x2 + 4 && bx + boxW > ob.x1 - 4 && by < ob.y2 + 3 && by + boxH > ob.y1 - 3) {
              collides = true;
              break;
            }
          }
        }
        if (collides) continue;

        occupied.push({ x1: bx, y1: by, x2: bx + boxW, y2: by + boxH });
        placedCount++;

        c.fillStyle = cand.important
          ? (isLight ? 'rgba(23, 21, 17, 0.92)' : 'rgba(15, 23, 42, 0.94)')
          : (isLight ? 'rgba(250, 248, 245, 0.88)' : 'rgba(6, 9, 17, 0.80)');
        c.strokeStyle = cand.important
          ? (activePathIds && activePathIds.has(cand.node.id) ? '#f59e0b' : (TYPE_META[cand.node.type]?.color || '#e11d48'))
          : (isLight ? 'rgba(23, 21, 17, 0.16)' : 'rgba(148, 163, 184, 0.24)');
        c.lineWidth = cand.important ? 1.25 : 0.8;

        drawRoundedRect(c, bx, by, boxW, boxH, 3);
        c.fill();
        c.stroke();

        c.fillStyle = cand.important ? '#ffffff' : (isLight ? '#171511' : '#e2e8f0');
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(txt, scr.x, by + boxH / 2 + 0.5);
      }

      // 4. Render Active Edge Pill Labels (on Path or Selected Ego Network)
      var edgeMax = Math.min(edgeLabelQueue.length, 10);
      for (var eli = 0; eli < edgeMax; eli++) {
        var el = edgeLabelQueue[eli];
        var es = worldToScreen(el.x, el.y);
        c.font = '600 9.5px "IBM Plex Mono", monospace';
        var etw = c.measureText(el.text).width + 10;
        var ebx = es.x - etw / 2;
        var eby = es.y - 9;
        c.fillStyle = el.isPath ? 'rgba(245, 158, 11, 0.95)' : (isLight ? 'rgba(23, 21, 17, 0.86)' : 'rgba(15, 23, 42, 0.9)');
        drawRoundedRect(c, ebx, eby, etw, 17, 3);
        c.fill();
        c.fillStyle = el.isPath ? '#060911' : '#f8fafc';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(el.text, es.x, eby + 8.5);
      }
      c.restore();
    }

    // Interactive Radar Minimap Renderer
    var minimapBounds = { minX: -700, maxX: 700, minY: -600, maxY: 600, scale: 0.1, ox: 0, oy: 0 };
    function drawMinimap() {
      if (!minimapCtx || !minimapCanvas) return;
      var mw = 186;
      var mh = 122;
      minimapCtx.save();
      minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      minimapCtx.fillStyle = canvasTheme === 'light' ? 'rgba(247, 245, 240, 0.94)' : 'rgba(6, 9, 17, 0.92)';
      minimapCtx.fillRect(0, 0, mw, mh);

      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (var i = 0; i < simNodes.length; i++) {
        var n = simNodes[i];
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      if (!isFinite(minX)) { minimapCtx.restore(); return; }
      var pad = 90;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      var sx = mw / Math.max(maxX - minX, 1);
      var sy = mh / Math.max(maxY - minY, 1);
      var sc = Math.min(sx, sy);
      var ox = (mw - (maxX - minX) * sc) / 2 - minX * sc;
      var oy = (mh - (maxY - minY) * sc) / 2 - minY * sc;
      minimapBounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY, scale: sc, ox: ox, oy: oy };

      // Dots
      for (var j = 0; j < simNodes.length; j++) {
        var nd = simNodes[j];
        var vis = isNodeVisible(nd);
        var mx = nd.x * sc + ox;
        var my = nd.y * sc + oy;
        minimapCtx.fillStyle = activePathIds && activePathIds.has(nd.id)
          ? '#f59e0b'
          : vis ? (TYPE_META[nd.type]?.color || '#94a3b8') : 'rgba(100, 116, 139, 0.22)';
        minimapCtx.fillRect(mx - 1.3, my - 1.3, vis ? 2.8 : 1.6, vis ? 2.8 : 1.6);
      }

      // Live Viewport Frame
      var tl = screenToWorld(0, 0);
      var br = screenToWorld(width, height);
      var vx = tl.x * sc + ox;
      var vy = tl.y * sc + oy;
      var vw = (br.x - tl.x) * sc;
      var vh = (br.y - tl.y) * sc;
      minimapCtx.strokeStyle = '#ef4444';
      minimapCtx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      minimapCtx.lineWidth = 1.2;
      minimapCtx.fillRect(vx, vy, vw, vh);
      minimapCtx.strokeRect(vx, vy, vw, vh);
      minimapCtx.restore();
    }

    // Animation Loop (Smart On-Demand / Auto-Sleep when Settled)
    var rafId = null;
    function requestFrame() {
      if (!rafId) rafId = requestAnimationFrame(renderTick);
    }

    function renderTick(now) {
      rafId = null;
      var needsNext = false;

      // 1. Camera Animation
      if (camAnim) {
        var ct = Math.min(1, (now - camAnim.start) / camAnim.dur);
        var ce = 1 - Math.pow(1 - ct, 3);
        cam.x = camAnim.sx + (camAnim.tx - camAnim.sx) * ce;
        cam.y = camAnim.sy + (camAnim.ty - camAnim.sy) * ce;
        cam.zoom = camAnim.sz + (camAnim.tz - camAnim.sz) * ce;
        if (ct < 1) needsNext = true;
        else { camAnim = null; updateTelemetryBar(); }
      }

      // 2. Layout Morph Animation
      if (morphAnim) {
        var mt = Math.min(1, (now - morphAnim.start) / morphAnim.dur);
        var me = 1 - Math.pow(1 - mt, 3);
        simNodes.forEach(function (n) {
          var o = morphAnim.origins.get(n.id);
          var tg = morphAnim.targets.get(n.id);
          if (o && tg) {
            n.x = o.x + (tg.x - o.x) * me;
            n.y = o.y + (tg.y - o.y) * me;
          }
        });
        if (mt < 1) needsNext = true;
        else morphAnim = null;
      }

      // 3. Force Physics
      if (stepForcePhysics()) needsNext = true;

      // 4. Active pulse particles (only animate when node selected or shortest path active)
      if (selectedNode || activePathIds) {
        pulsePhase = (pulsePhase + 0.009) % 1;
        needsNext = true;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGraphToContext(ctx, canvasTheme === 'light', false);
      ctx.restore();
      drawMinimap();

      if (needsNext) requestFrame();
    }

    // -------------------------------------------------------------------------
    // 7. Pointer, Dragging, Wheel Zoom, Hover Tooltip & Minimap Interaction
    // -------------------------------------------------------------------------
    var tooltipEl = document.getElementById('mrezhaHoverTooltip');

    function hitTestNode(worldX, worldY) {
      for (var i = simNodes.length - 1; i >= 0; i--) {
        var n = simNodes[i];
        if (!isNodeVisible(n)) continue;
        var dx = n.x - worldX;
        var dy = n.y - worldY;
        var hitR = Math.max(n.radius + 5, 13 / cam.zoom);
        if (dx * dx + dy * dy <= hitR * hitR) return n;
      }
      return null;
    }

    function updateTooltip(n, clientX, clientY) {
      if (!tooltipEl) return;
      if (!n || draggedNode || isPanning) {
        tooltipEl.hidden = true;
        return;
      }
      var tm = TYPE_META[n.type] || TYPE_META.company;
      var cm = CLUSTER_META[n.cluster] || { title: n.cluster };
      var rect = container.getBoundingClientRect();
      var tx = clientX - rect.left + 16;
      var ty = clientY - rect.top + 16;
      if (tx + 280 > width) tx = clientX - rect.left - 285;
      if (ty + 170 > height) ty = clientY - rect.top - 175;

      tooltipEl.style.left = Math.max(10, tx) + 'px';
      tooltipEl.style.top = Math.max(10, ty) + 'px';
      tooltipEl.innerHTML =
        '<div class="tt-head">' +
          '<span class="tt-type" style="color:' + tm.color + ';">' + getSvgGlyphHtml(n.type, 12) + ' ' + esc(tm.short) + '</span>' +
          '<span class="tt-cluster">' + esc(cm.title) + '</span>' +
        '</div>' +
        '<div class="tt-title">' + esc(n.label) + '</div>' +
        (n.eik ? '<div class="tt-sub">ЕИК ' + esc(n.eik) + '</div>' : (n.details && n.details.court ? '<div class="tt-sub">' + esc(n.details.court) + '</div>' : '')) +
        '<div class="tt-metrics">' +
          '<div><span>РИСК</span><strong style="color:' + (n.riskScore >= 80 ? '#ef4444' : '#f59e0b') + ';">' + n.riskScore + '/100</strong></div>' +
          '<div><span>ЦЕНТР.</span><strong>' + (n.centralityScore || 0) + '</strong></div>' +
          '<div><span>ВРЪЗКИ</span><strong>' + (n.degree || 0) + '</strong></div>' +
          '<div><span>ОБЕМ</span><strong>' + fmtEurShort(n.amountEur) + '</strong></div>' +
        '</div>' +
        '<div class="tt-hint">Клик за 4-слоен паспорт · Влачене за закачане</div>';
      tooltipEl.hidden = false;
    }

    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;
      var w = screenToWorld(sx, sy);
      pointerDownPos = { x: sx, y: sy };
      dragMoved = false;
      camAnim = null;

      var hit = hitTestNode(w.x, w.y);
      if (hit) {
        draggedNode = hit;
        canvas.style.cursor = 'grabbing';
        if (tooltipEl) tooltipEl.hidden = true;
      } else {
        isPanning = true;
        panOrigin = { x: e.clientX - cam.x, y: e.clientY - cam.y };
        canvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var sx = e.clientX - rect.left;
      var sy = e.clientY - rect.top;

      if (draggedNode) {
        var distDrag = Math.hypot(sx - pointerDownPos.x, sy - pointerDownPos.y);
        if (distDrag > 3) dragMoved = true;
        var w = screenToWorld(sx, sy);
        draggedNode.x = w.x;
        draggedNode.y = w.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        draggedNode.pinned = true;
        if (layoutMode === 'force' && !physicsPaused) alpha = Math.max(alpha, 0.16);
        requestFrame();
        return;
      }

      if (isPanning) {
        var distPan = Math.hypot(sx - pointerDownPos.x, sy - pointerDownPos.y);
        if (distPan > 3) dragMoved = true;
        cam.x = e.clientX - panOrigin.x;
        cam.y = e.clientY - panOrigin.y;
        requestFrame();
        return;
      }

      if (e.target === canvas) {
        var hw = screenToWorld(sx, sy);
        var hit = hitTestNode(hw.x, hw.y);
        if (hit !== hoveredNode) {
          hoveredNode = hit;
          canvas.style.cursor = hit ? 'pointer' : 'grab';
          requestFrame();
        }
        updateTooltip(hit, e.clientX, e.clientY);
      } else if (tooltipEl && !tooltipEl.hidden) {
        tooltipEl.hidden = true;
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (draggedNode) {
        var released = draggedNode;
        draggedNode = null;
        canvas.style.cursor = 'pointer';
        if (!dragMoved) {
          selectNode(released, false);
        }
        requestFrame();
      } else if (isPanning) {
        isPanning = false;
        canvas.style.cursor = 'grab';
        if (!dragMoved && e.target === canvas) {
          // Click on empty background keeps filters but clears focus if needed
        }
      }
    });

    canvas.addEventListener('dblclick', function (e) {
      var rect = canvas.getBoundingClientRect();
      var w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      var hit = hitTestNode(w.x, w.y);
      if (hit) {
        if (hit.pinned) {
          hit.pinned = false;
          if (layoutMode === 'force') alpha = Math.max(alpha, 0.25);
        }
        selectNode(hit, true);
      } else {
        fitToVisible(true);
      }
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      camAnim = null;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var zoomFactor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
      var nextZoom = Math.max(0.18, Math.min(4.2, cam.zoom * zoomFactor));
      var ratio = nextZoom / cam.zoom;
      cam.x = mx - (mx - cam.x) * ratio;
      cam.y = my - (my - cam.y) * ratio;
      cam.zoom = nextZoom;
      updateTelemetryBar();
      requestFrame();
    }, { passive: false });

    // Mobile & Tablet Touch Support (Single-Finger Pan/Tap + Two-Finger Pinch Zoom)
    var touchState = { mode: null, lastX: 0, lastY: 0, startX: 0, startY: 0, pinchDist: 0, moved: false };
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        var t = e.touches[0];
        touchState = { mode: 'pan', lastX: t.clientX, lastY: t.clientY, startX: t.clientX, startY: t.clientY, pinchDist: 0, moved: false };
        camAnim = null;
      } else if (e.touches.length === 2) {
        e.preventDefault();
        var t0 = e.touches[0], t1 = e.touches[1];
        touchState = {
          mode: 'pinch',
          lastX: (t0.clientX + t1.clientX) / 2,
          lastY: (t0.clientY + t1.clientY) / 2,
          startX: 0,
          startY: 0,
          pinchDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1,
          moved: true,
        };
        camAnim = null;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      if (touchState.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        var t = e.touches[0];
        if (Math.hypot(t.clientX - touchState.startX, t.clientY - touchState.startY) > 6) touchState.moved = true;
        cam.x += t.clientX - touchState.lastX;
        cam.y += t.clientY - touchState.lastY;
        touchState.lastX = t.clientX;
        touchState.lastY = t.clientY;
        requestFrame();
      } else if (touchState.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        var t0 = e.touches[0], t1 = e.touches[1];
        var dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        var rect = canvas.getBoundingClientRect();
        var mx = (t0.clientX + t1.clientX) / 2 - rect.left;
        var my = (t0.clientY + t1.clientY) / 2 - rect.top;
        var scaleChange = dist / touchState.pinchDist;
        var nextZoom = Math.max(0.18, Math.min(4.2, cam.zoom * scaleChange));
        var ratio = nextZoom / cam.zoom;
        cam.x = mx - (mx - cam.x) * ratio;
        cam.y = my - (my - cam.y) * ratio;
        cam.zoom = nextZoom;
        touchState.pinchDist = dist;
        updateTelemetryBar();
        requestFrame();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      if (touchState.mode === 'pan' && !touchState.moved && e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var rect = canvas.getBoundingClientRect();
        var w = screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
        var hit = hitTestNode(w.x, w.y);
        if (hit) selectNode(hit, true);
      }
      if (e.touches.length === 0) touchState.mode = null;
    });

    // Minimap Click/Drag Pan
    if (minimapCanvas) {
      var miniDragging = false;
      var panFromMini = function (e) {
        var r = minimapCanvas.getBoundingClientRect();
        var mx = e.clientX - r.left;
        var my = e.clientY - r.top;
        var wx = (mx - minimapBounds.ox) / (minimapBounds.scale || 1);
        var wy = (my - minimapBounds.oy) / (minimapBounds.scale || 1);
        camAnim = null;
        cam.x = width / 2 - wx * cam.zoom;
        cam.y = height / 2 - wy * cam.zoom;
        requestFrame();
      };
      minimapCanvas.addEventListener('mousedown', function (e) { miniDragging = true; panFromMini(e); });
      window.addEventListener('mousemove', function (e) { if (miniDragging) panFromMini(e); });
      window.addEventListener('mouseup', function () { miniDragging = false; });
    }

    // -------------------------------------------------------------------------
    // 8. 4-Layer Forensic Inspector Drawer & Ego-Network Isolator
    // -------------------------------------------------------------------------
    var inspector = document.getElementById('mrezhaInspector');
    var inspectorBadge = document.getElementById('inspectorBadge');
    var inspectorTitle = document.getElementById('inspectorTitle');
    var inspectorMeta = document.getElementById('inspectorMeta');
    var connList = document.getElementById('inspectorConnectionsList');

    function setEgoDepth(depth) {
      egoDepth = depth;
      recomputeEgoSet();
      document.querySelectorAll('.mrezha-ego-btn').forEach(function (b) {
        b.classList.toggle('is-active', Number(b.getAttribute('data-ego')) === depth);
      });
      updateTelemetryBar();
      requestFrame();
    }

    function selectNode(n, shouldFly) {
      selectedNode = n;
      recomputeEgoSet();
      if (!inspector || !n) return;

      var tm = TYPE_META[n.type] || TYPE_META.company;
      inspectorBadge.innerHTML = getSvgGlyphHtml(n.type, 13) + ' <span>' + esc(tm.label) + '</span>';
      inspectorBadge.style.borderColor = tm.color;
      inspectorBadge.style.color = tm.color;
      inspectorTitle.textContent = n.label;

      var f = n.financialLayer || {};
      var c = n.corporateLayer || {};
      var im = n.intermediaryLayer || {};
      var j = n.judicialLayer || {};

      var clusterChips = (n.allClusters || [n.cluster]).map(function (ck) {
        var cm = CLUSTER_META[ck] || { title: ck, color: '#64748b' };
        return '<span class="insp-cluster-chip" style="border-color:' + cm.color + '44;color:' + cm.color + ';">' + esc(cm.title) + '</span>';
      }).join('');

      var html =
        '<div class="insp-subrow">' +
          clusterChips +
          (n.eik ? '<span class="insp-eik-chip">ЕИК ' + esc(n.eik) + '</span>' : '') +
        '</div>' +
        '<div class="insp-kpi-strip">' +
          '<div class="insp-kpi"><span>РИСК ИНДЕКС</span><strong style="color:' + (n.riskScore >= 80 ? '#ef4444' : '#d97706') + ';">' + n.riskScore + '/100</strong></div>' +
          '<div class="insp-kpi"><span>ЦЕНТРАЛНОСТ</span><strong>' + (n.centralityScore || 0) + '/100</strong></div>' +
          '<div class="insp-kpi"><span>BRANDES МОСТ</span><strong>' + (n.betweenness || 0) + '</strong></div>' +
          '<div class="insp-kpi"><span>ФИНАНСОВ ОБЕМ</span><strong>' + fmtEurShort(n.amountEur) + '</strong></div>' +
        '</div>' +
        '<div class="insp-ego-bar">' +
          '<span class="insp-ego-label">ИЗОЛАЦИЯ:</span>' +
          '<button type="button" class="mrezha-ego-btn' + (egoDepth === 0 ? ' is-active' : '') + '" data-ego="0">Цял граф</button>' +
          '<button type="button" class="mrezha-ego-btn' + (egoDepth === 1 ? ' is-active' : '') + '" data-ego="1">1-хоп</button>' +
          '<button type="button" class="mrezha-ego-btn' + (egoDepth === 2 ? ' is-active' : '') + '" data-ego="2">2-хопа</button>' +
          '<button type="button" class="insp-path-start-btn" id="inspStartPathBtn">Път оттук &rarr;</button>' +
        '</div>';

      if (n.badges && n.badges.length) {
        html += '<div class="insp-badges">' +
          n.badges.map(function (b) { return '<span class="insp-badge">' + esc(b) + '</span>'; }).join('') +
          '</div>';
      }

      if (n.details && n.details.caseUrl) {
        html += '<a class="insp-eiss-link" href="' + esc(n.details.caseUrl) + '" target="_blank" rel="noopener noreferrer">Отвори оригиналната преписка в ЕПЕП / ЕИСС &nearr;</a>';
      }

      // 4 Distinct Forensic Layers (Zero Emojis — Crisp Geometric SVGs)
      html += '<div class="mrezha-four-layers">' +
        '<div class="mrezha-layer-box is-financial">' +
          '<div class="layer-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>1. ФИНАНСОВ СЛОЙ (ЗОП &middot; ДЗЗД &middot; ЧЛ. 116)</span></div>' +
          '<div class="layer-body">' +
            'Директни договори по ЗОП: <strong>' + fmtInt(f.directContractsCount || 0) + '</strong> (' + fmtEurExact(f.directContractsEur || 0) + ')<br>' +
            'Участия в ДЗЗД консорциуми: <strong>' + fmtInt(f.dzzdCount || 0) + '</strong> (' + fmtEurExact(f.dzzdEur || 0) + ')<br>' +
            'Анекси по чл. 116 ЗОП: <strong>' + fmtInt(f.annex116Count || 0) + '</strong>' +
            (f.primaryUnps && f.primaryUnps.length ? '<div class="layer-mono">УНП: ' + esc(f.primaryUnps.slice(0, 4).join(', ')) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mrezha-layer-box is-corporate">' +
          '<div class="layer-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span>2. КОРПОРАТИВЕН СЛОЙ (ТРРЮЛНЦ &middot; ЗМИП)</span></div>' +
          '<div class="layer-body">' +
            'Действителни собственици (ЗМИП): <strong>' + esc(c.zmipOwners && c.zmipOwners.length ? c.zmipOwners.join(', ') : 'Публичен орган / Без частни UBO') + '</strong><br>' +
            'Свързани дружества в ТР: ' + esc(c.trRelatedEntities && c.trRelatedEntities.length ? c.trRelatedEntities.slice(0, 4).join(', ') : 'Няма декларирани') + '<br>' +
            'Споделени управители: ' + esc(c.sharedManagers && c.sharedManagers.length ? c.sharedManagers.join(', ') : 'Самостоятелно управление') +
          '</div>' +
        '</div>' +
        '<div class="mrezha-layer-box is-intermediary">' +
          '<div class="layer-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg><span>3. ПОСРЕДНИЧЕСКИ СЛОЙ (МОДУЛ J3 &middot; CPV 791)</span></div>' +
          '<div class="layer-body">' +
            'Адвокатски кантори / Юристи: ' + esc(im.lawFirms && im.lawFirms.length ? im.lawFirms.slice(0, 4).join(', ') : 'Без наета външна кантора') + '<br>' +
            'Обем правни услуги по ЗОП: <strong>' + fmtEurExact(im.legalProcurementEur || 0) + '</strong>' +
            (im.j3HubReferences && im.j3HubReferences.length ? '<div class="layer-mono">Референции: ' + esc(im.j3HubReferences.slice(0, 3).join(' · ')) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="mrezha-layer-box is-judicial">' +
          '<div class="layer-hdr"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M4 7h16M5 7l-2 7h4l-2-7zm14 0l-2 7h4l-2-7z"/></svg><span>4. СЪДЕБЕН &amp; ДЕКЛАРАТИВЕН СЛОЙ (ЕИСС &middot; КПК)</span></div>' +
          '<div class="layer-body">' +
            'Дела в ЕИСС / ЕПЕП: ' + esc(j.eissCases && j.eissCases.length ? j.eissCases.slice(0, 4).join('; ') : 'Няма засечени дела') + '<br>' +
            'RED аномалии (Benjamini–Hochberg q &lt; 0,01): <strong>' + fmtInt(j.fdrQ001Count || 0) + '</strong><br>' +
            'КПК Таблица 9 / ЗПК: ' + esc(j.kpkTable9 && j.kpkTable9.length ? j.kpkTable9.join(', ') : 'Няма задължение / Недекларирано') +
          '</div>' +
        '</div>' +
      '</div>';

      inspectorMeta.innerHTML = html;

      // Bind Ego Buttons & Path Start Button
      inspectorMeta.querySelectorAll('.mrezha-ego-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setEgoDepth(Number(btn.getAttribute('data-ego') || 0));
        });
      });
      var pathStartBtn = document.getElementById('inspStartPathBtn');
      if (pathStartBtn) {
        pathStartBtn.addEventListener('click', function () {
          openPathFinderWithSource(n);
        });
      }

      // Clickable Connections List (Traverse Hop-by-Hop!)
      var conns = incidentEdges.get(n.id) || [];
      if (conns.length === 0) {
        connList.innerHTML = '<p class="insp-empty">Няма регистрирани преки ребра.</p>';
      } else {
        connList.innerHTML = conns.map(function (e) {
          var other = e.sourceNode === n ? e.targetNode : e.sourceNode;
          var em = EDGE_META[e.kind] || { label: e.kind, color: '#64748b' };
          return '<div class="mrezha-conn-item" data-jump-id="' + esc(other.id) + '" tabindex="0">' +
            '<div class="conn-top">' +
              '<span class="conn-rel" style="color:' + em.color + ';">' + esc(e.label || em.label) + '</span>' +
              '<span class="conn-id">' + esc(e.primaryId || e.evidence || '') + '</span>' +
            '</div>' +
            '<div class="conn-target">' +
              getSvgGlyphHtml(other.type, 12) +
              '<span class="conn-name">' + esc(other.label) + '</span>' +
              '<span class="conn-arrow">&rarr;</span>' +
            '</div>' +
          '</div>';
        }).join('');

        connList.querySelectorAll('[data-jump-id]').forEach(function (el) {
          el.addEventListener('click', function () {
            var target = nodeById.get(el.getAttribute('data-jump-id'));
            if (target) selectNode(target, true);
          });
        });
      }

      inspector.classList.add('is-open');
      inspector.removeAttribute('aria-hidden');
      updateTelemetryBar();
      if (shouldFly) flyToNode(n);
      requestFrame();
    }

    document.getElementById('closeInspectorBtn')?.addEventListener('click', function () {
      inspector?.classList.remove('is-open');
      inspector?.setAttribute('aria-hidden', 'true');
      selectedNode = null;
      egoDepth = 0;
      egoSet = null;
      updateTelemetryBar();
      requestFrame();
    });

    // -------------------------------------------------------------------------
    // 9. Exact BFS Shortest-Path Finder (Hidden Link Discovery)
    // -------------------------------------------------------------------------
    var pathPanel = document.getElementById('mrezhaPathPanel');
    var pathToggleBtn = document.getElementById('togglePathFinderBtn');
    var pathFromInput = document.getElementById('pathFromInput');
    var pathToInput = document.getElementById('pathToInput');
    var pathResultBox = document.getElementById('mrezhaPathResult');
    var pathFromId = '';
    var pathToId = '';

    function resolveInputNode(inputEl, storedId) {
      if (storedId && nodeById.has(storedId)) return nodeById.get(storedId);
      var q = (inputEl && inputEl.value || '').trim().toLowerCase();
      if (!q) return null;
      for (var i = 0; i < simNodes.length; i++) {
        if (simNodes[i].label.toLowerCase() === q || (simNodes[i].eik && simNodes[i].eik === q)) return simNodes[i];
      }
      for (var j = 0; j < simNodes.length; j++) {
        if (simNodes[j].label.toLowerCase().indexOf(q) !== -1) return simNodes[j];
      }
      return null;
    }

    function runShortestPath(startId, endId) {
      if (!startId || !endId || startId === endId) {
        if (pathResultBox) {
          pathResultBox.hidden = false;
          pathResultBox.innerHTML = '<div class="path-msg is-warn">Изберете два различни възела от графа за проследяване на веригата.</div>';
        }
        return;
      }

      var queue = [[{ nodeId: startId, edge: null }]];
      var visited = new Set([startId]);
      var found = null;

      while (queue.length > 0) {
        var chain = queue.shift();
        var last = chain[chain.length - 1].nodeId;
        if (last === endId) { found = chain; break; }
        if (chain.length >= 9) continue;
        var neighbors = adjMap.get(last) || [];
        for (var i = 0; i < neighbors.length; i++) {
          var nb = neighbors[i];
          if (!visited.has(nb.nodeId)) {
            visited.add(nb.nodeId);
            queue.push(chain.concat([{ nodeId: nb.nodeId, edge: nb.edge }]));
          }
        }
      }

      if (!found) {
        activePathIds = null;
        activePathEdgeKeys = null;
        activePathSequence = null;
        if (pathResultBox) {
          pathResultBox.hidden = false;
          pathResultBox.innerHTML = '<div class="path-msg is-warn">Не е открита документална верига между тези два обекта в текущия крос-регистров срез.</div>';
        }
        requestFrame();
        return;
      }

      activePathIds = new Set();
      activePathEdgeKeys = new Set();
      activePathSequence = [];
      var chainHtml = '<div class="path-chain-hdr"><strong>Открита доказателствена верига (' + (found.length - 1) + ' прехода):</strong><button type="button" class="path-clear-btn" id="clearActivePathBtn">Изчисти веригата</button></div><div class="path-chain-flow">';

      for (var k = 0; k < found.length; k++) {
        var step = found[k];
        var nd = nodeById.get(step.nodeId);
        activePathIds.add(step.nodeId);
        activePathSequence.push(step.nodeId);
        if (step.edge) {
          activePathEdgeKeys.add(step.edge.idx);
          chainHtml +=
            '<div class="path-edge-chip">' +
              '<span class="pe-rel">' + esc(step.edge.label || step.edge.kind) + '</span>' +
              '<span class="pe-id">' + esc(step.edge.primaryId || '') + '</span>' +
            '</div>';
        }
        chainHtml +=
          '<button type="button" class="path-node-chip" data-path-node="' + esc(nd.id) + '">' +
            getSvgGlyphHtml(nd.type, 12) +
            '<span>' + esc(nd.label) + '</span>' +
          '</button>';
      }
      chainHtml += '</div>';

      if (pathResultBox) {
        pathResultBox.hidden = false;
        pathResultBox.innerHTML = chainHtml;
        pathResultBox.querySelectorAll('[data-path-node]').forEach(function (b) {
          b.addEventListener('click', function () {
            var nd = nodeById.get(b.getAttribute('data-path-node'));
            if (nd) selectNode(nd, true);
          });
        });
        document.getElementById('clearActivePathBtn')?.addEventListener('click', clearActivePath);
      }

      // Frame camera around the discovered path!
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      activePathSequence.forEach(function (id) {
        var pnd = nodeById.get(id);
        if (pnd.x < minX) minX = pnd.x;
        if (pnd.x > maxX) maxX = pnd.x;
        if (pnd.y < minY) minY = pnd.y;
        if (pnd.y > maxY) maxY = pnd.y;
      });
      var bw = Math.max(maxX - minX, 220) + 220;
      var bh = Math.max(maxY - minY, 180) + 220;
      var tz = Math.max(0.45, Math.min(1.65, Math.min(width / bw, height / bh)));
      animateCameraTo(width / 2 - ((minX + maxX) / 2) * tz, height / 2 - ((minY + maxY) / 2) * tz, tz, 480);
      requestFrame();
    }

    function clearActivePath() {
      activePathIds = null;
      activePathEdgeKeys = null;
      activePathSequence = null;
      if (pathResultBox) { pathResultBox.hidden = true; pathResultBox.innerHTML = ''; }
      requestFrame();
    }

    function openPathFinderWithSource(n) {
      if (pathPanel) pathPanel.hidden = false;
      pathToggleBtn?.classList.add('is-active');
      if (pathFromInput) pathFromInput.value = n.label;
      pathFromId = n.id;
      if (pathToInput) pathToInput.focus();
    }

    pathToggleBtn?.addEventListener('click', function () {
      if (!pathPanel) return;
      pathPanel.hidden = !pathPanel.hidden;
      pathToggleBtn.classList.toggle('is-active', !pathPanel.hidden);
    });

    document.getElementById('btnRunPathFinder')?.addEventListener('click', function () {
      var nA = resolveInputNode(pathFromInput, pathFromId);
      var nB = resolveInputNode(pathToInput, pathToId);
      runShortestPath(nA && nA.id, nB && nB.id);
    });

    document.querySelectorAll('.mrezha-preset-path-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fId = btn.getAttribute('data-from');
        var tId = btn.getAttribute('data-to');
        var nA = nodeById.get(fId);
        var nB = nodeById.get(tId);
        if (nA && pathFromInput) { pathFromInput.value = nA.label; pathFromId = nA.id; }
        if (nB && pathToInput) { pathToInput.value = nB.label; pathToId = nB.id; }
        runShortestPath(fId, tId);
      });
    });

    // Attach lightweight instant autocomplete to Search, PathFrom, PathTo
    function attachAutocomplete(inputEl, dropdownEl, onPick) {
      if (!inputEl || !dropdownEl) return;
      inputEl.addEventListener('input', function () {
        var q = inputEl.value.trim().toLowerCase();
        if (q.length < 2) { dropdownEl.hidden = true; return; }
        var matches = [];
        for (var i = 0; i < simNodes.length; i++) {
          var n = simNodes[i];
          if (
            n.label.toLowerCase().indexOf(q) !== -1 ||
            (n.eik && n.eik.indexOf(q) !== -1) ||
            (n.details && n.details.court && n.details.court.toLowerCase().indexOf(q) !== -1)
          ) {
            matches.push(n);
            if (matches.length >= 8) break;
          }
        }
        if (matches.length === 0) { dropdownEl.hidden = true; return; }
        dropdownEl.innerHTML = matches.map(function (m) {
          var tm = TYPE_META[m.type] || TYPE_META.company;
          return '<button type="button" class="ac-item" data-ac-id="' + esc(m.id) + '">' +
            getSvgGlyphHtml(m.type, 13) +
            '<span class="ac-name">' + esc(m.label) + '</span>' +
            '<span class="ac-meta">' + esc(m.eik ? 'ЕИК ' + m.eik : tm.short) + ' · ' + m.riskScore + '</span>' +
          '</button>';
        }).join('');
        dropdownEl.hidden = false;
        dropdownEl.querySelectorAll('.ac-item').forEach(function (item) {
          item.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            var picked = nodeById.get(item.getAttribute('data-ac-id'));
            dropdownEl.hidden = true;
            if (picked) onPick(picked);
          });
        });
      });
      inputEl.addEventListener('blur', function () {
        setTimeout(function () { dropdownEl.hidden = true; }, 140);
      });
    }

    function ensureNodeUnfiltered(n) {
      if (!n) return;
      if (!activeTypes.has(n.type)) {
        activeTypes = new Set(ALL_NODE_TYPES);
        typeBtns.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all'); });
      }
      if (activeCluster !== 'ALL' && n.cluster !== activeCluster && (!n.allClusters || n.allClusters.indexOf(activeCluster) === -1)) {
        activeCluster = 'ALL';
        if (clusterSelect) clusterSelect.value = 'ALL';
      }
      if (minRisk > n.riskScore) {
        minRisk = 0;
        if (riskSlider) riskSlider.value = '0';
        if (riskSliderVal) riskSliderVal.textContent = 'Всички';
      }
    }

    var searchInput = document.getElementById('mrezhaSearchInput');
    attachAutocomplete(searchInput, document.getElementById('mrezhaSearchDropdown'), function (picked) {
      if (searchInput) searchInput.value = picked.label;
      searchQuery = '';
      ensureNodeUnfiltered(picked);
      selectNode(picked, true);
    });
    attachAutocomplete(pathFromInput, document.getElementById('pathFromDropdown'), function (picked) {
      if (pathFromInput) pathFromInput.value = picked.label;
      pathFromId = picked.id;
    });
    attachAutocomplete(pathToInput, document.getElementById('pathToDropdown'), function (picked) {
      if (pathToInput) pathToInput.value = picked.label;
      pathToId = picked.id;
    });

    searchInput?.addEventListener('input', function (e) {
      searchQuery = (e.target.value || '').trim();
      updateTelemetryBar();
      requestFrame();
    });

    // -------------------------------------------------------------------------
    // 10. Toolbar Controls, Filters, Fullscreen, PNG & JSON Export
    // -------------------------------------------------------------------------
    document.querySelectorAll('.mrezha-layout-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLayoutMode(btn.getAttribute('data-layout') || 'force');
      });
    });

    // Type Filter Chips (Click = Solo or Toggle All)
    var typeBtns = document.querySelectorAll('.mrezha-filter-btn');
    typeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        if (f === 'all') {
          activeTypes = new Set(ALL_NODE_TYPES);
          typeBtns.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all'); });
        } else {
          // Single-focus toggle for crisp exploration; clicking active solo chip returns to all
          var isAlreadySolo = activeTypes.size === 1 && activeTypes.has(f);
          if (isAlreadySolo) {
            activeTypes = new Set(ALL_NODE_TYPES);
            typeBtns.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all'); });
          } else {
            activeTypes = new Set([f]);
            typeBtns.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-filter') === f); });
          }
        }
        updateTelemetryBar();
        requestFrame();
      });
    });

    var clusterSelect = document.getElementById('mrezhaClusterFilter');
    clusterSelect?.addEventListener('change', function (e) {
      activeCluster = e.target.value || 'ALL';
      updateTelemetryBar();
      fitToVisible(true);
    });

    var edgeSelect = document.getElementById('mrezhaEdgeFilter');
    edgeSelect?.addEventListener('change', function (e) {
      activeEdgeKind = e.target.value || 'ALL';
      updateTelemetryBar();
      requestFrame();
    });

    var sizeSelect = document.getElementById('mrezhaSizeMetric');
    sizeSelect?.addEventListener('change', function (e) {
      sizeMetric = e.target.value || 'centrality';
      recomputeNodeRadii();
      requestFrame();
    });

    var riskSlider = document.getElementById('mrezhaRiskSlider');
    var riskSliderVal = document.getElementById('mrezhaRiskVal');
    riskSlider?.addEventListener('input', function (e) {
      minRisk = Number(e.target.value || 0);
      if (riskSliderVal) riskSliderVal.textContent = minRisk > 0 ? '≥ ' + minRisk : 'Всички';
      updateTelemetryBar();
      requestFrame();
    });

    document.getElementById('btnResetFilters')?.addEventListener('click', function () {
      activeTypes = new Set(ALL_NODE_TYPES);
      typeBtns.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-filter') === 'all'); });
      activeCluster = 'ALL';
      activeEdgeKind = 'ALL';
      minRisk = 0;
      searchQuery = '';
      egoDepth = 0;
      egoSet = null;
      selectedNode = null;
      clearActivePath();
      if (clusterSelect) clusterSelect.value = 'ALL';
      if (edgeSelect) edgeSelect.value = 'ALL';
      if (riskSlider) riskSlider.value = '0';
      if (riskSliderVal) riskSliderVal.textContent = 'Всички';
      if (searchInput) searchInput.value = '';
      inspector?.classList.remove('is-open');
      updateTelemetryBar();
      fitToVisible(true);
    });

    // Zoom & Physics Controls
    document.getElementById('zoomInBtn')?.addEventListener('click', function () {
      var nz = Math.min(4.2, cam.zoom * 1.3);
      var ratio = nz / cam.zoom;
      animateCameraTo(width / 2 - (width / 2 - cam.x) * ratio, height / 2 - (height / 2 - cam.y) * ratio, nz, 220);
    });
    document.getElementById('zoomOutBtn')?.addEventListener('click', function () {
      var nz = Math.max(0.18, cam.zoom / 1.3);
      var ratio = nz / cam.zoom;
      animateCameraTo(width / 2 - (width / 2 - cam.x) * ratio, height / 2 - (height / 2 - cam.y) * ratio, nz, 220);
    });
    document.getElementById('resetZoomBtn')?.addEventListener('click', function () { fitToVisible(true); });

    var pauseBtn = document.getElementById('togglePhysicsBtn');
    function updatePauseButton() {
      if (!pauseBtn) return;
      pauseBtn.classList.toggle('is-active', physicsPaused);
      pauseBtn.title = physicsPaused ? 'Продължи физиката' : 'Паузирай физиката';
    }
    pauseBtn?.addEventListener('click', function () {
      physicsPaused = !physicsPaused;
      if (!physicsPaused && layoutMode === 'force') alpha = Math.max(alpha, 0.35);
      updatePauseButton();
      requestFrame();
    });

    document.getElementById('reheatPhysicsBtn')?.addEventListener('click', function () {
      simNodes.forEach(function (n) { n.pinned = false; });
      if (layoutMode !== 'force') setLayoutMode('force');
      else { physicsPaused = false; alpha = 0.95; updatePauseButton(); requestFrame(); }
    });

    // Canvas Dark / Light Mode Toggle
    var canvasThemeBtn = document.getElementById('toggleCanvasThemeBtn');
    canvasThemeBtn?.addEventListener('click', function () {
      canvasTheme = canvasTheme === 'dark' ? 'light' : 'dark';
      container.classList.toggle('is-light-canvas', canvasTheme === 'light');
      canvasThemeBtn.classList.toggle('is-active', canvasTheme === 'light');
      requestFrame();
    });

    // Fullscreen Workspace Toggle
    var fsBtn = document.getElementById('toggleFullscreenBtn');
    var graphWorkspace = document.getElementById('mrezhaWorkspace');
    fsBtn?.addEventListener('click', function () {
      if (!graphWorkspace) return;
      var isFs = graphWorkspace.classList.toggle('is-fullscreen');
      fsBtn.classList.toggle('is-active', isFs);
      document.body.style.overflow = isFs ? 'hidden' : '';
      setTimeout(function () { resizeCanvas(); fitToVisible(true); }, 60);
    });

    // High-Res 2x PNG Export with Forensic Watermark & SHA-256
    document.getElementById('exportPngBtn')?.addEventListener('click', function () {
      var exportCanvas = document.createElement('canvas');
      var scale = 2;
      exportCanvas.width = width * scale;
      exportCanvas.height = height * scale;
      var ectx = exportCanvas.getContext('2d');
      ectx.scale(scale, scale);
      drawGraphToContext(ectx, canvasTheme === 'light', true);

      // Forensic footer watermark
      ectx.fillStyle = canvasTheme === 'light' ? 'rgba(23, 21, 17, 0.88)' : 'rgba(6, 9, 17, 0.88)';
      ectx.fillRect(0, height - 28, width, 28);
      ectx.fillStyle = '#e2e8f0';
      ectx.font = '600 10px "IBM Plex Mono", monospace';
      ectx.textAlign = 'left';
      ectx.fillText('NAsvetlo.website · МРЕЖАТА · Крос-регистров граф · SHA-256: ' + String(summary.datasetSha256 || '').slice(0, 24) + '…', 14, height - 10);
      ectx.textAlign = 'right';
      ectx.fillText('Експорт: ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', width - 14, height - 10);

      var link = document.createElement('a');
      link.download = 'nasvetlo-mrezhata-graph-' + new Date().toISOString().slice(0, 10) + '.png';
      link.href = exportCanvas.toDataURL('image/png');
      link.click();
    });

    // Export Filtered Subgraph JSON
    document.getElementById('exportJsonBtn')?.addEventListener('click', function () {
      var subNodes = simNodes.filter(isNodeVisible).map(function (n) {
        return { id: n.id, label: n.label, type: n.type, cluster: n.cluster, eik: n.eik, amountEur: n.amountEur, riskScore: n.riskScore, centralityScore: n.centralityScore, betweenness: n.betweenness, degree: n.degree };
      });
      var subEdges = simEdges.filter(isEdgeVisible).map(function (e) {
        return { source: e.source, target: e.target, kind: e.kind, label: e.label, primaryId: e.primaryId, amountEur: e.amountEur, evidence: e.evidence, url: e.url };
      });
      var blob = new Blob([JSON.stringify({ exportedAtUtc: new Date().toISOString(), datasetSha256: summary.datasetSha256, nodes: subNodes, edges: subEdges }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.download = 'nasvetlo-mrezhata-subgraph.json';
      a.href = URL.createObjectURL(blob);
      a.click();
    });

    // Interactive Cluster Cards -> Filter & Fly straight to that Sector!
    document.querySelectorAll('[data-cluster-focus]').forEach(function (card) {
      card.addEventListener('click', function () {
        var cid = card.getAttribute('data-cluster-focus');
        if (!cid) return;
        activeCluster = cid;
        if (clusterSelect) clusterSelect.value = cid;
        updateTelemetryBar();
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () { fitToVisible(true); }, 320);
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchInput?.focus();
      } else if (e.key === 'Escape') {
        if (graphWorkspace && graphWorkspace.classList.contains('is-fullscreen')) {
          graphWorkspace.classList.remove('is-fullscreen');
          fsBtn?.classList.remove('is-active');
          document.body.style.overflow = '';
          resizeCanvas();
        } else if (activePathIds) {
          clearActivePath();
        } else {
          inspector?.classList.remove('is-open');
          selectedNode = null;
          egoDepth = 0;
          egoSet = null;
          requestFrame();
        }
      } else if (e.key === '0') {
        fitToVisible(true);
      } else if (e.key === ' ') {
        e.preventDefault();
        physicsPaused = !physicsPaused;
        updatePauseButton();
        requestFrame();
      }
    });

    // -------------------------------------------------------------------------
    // 11. Master Registry Table (Instant Filter, Sort & Jump to Graph)
    // -------------------------------------------------------------------------
    var tableSearch = document.getElementById('mrezhaTableSearch');
    var tableTypeFilter = document.getElementById('mrezhaTableType');
    var tableSortSelect = document.getElementById('mrezhaTableSort');
    var tableBody = document.querySelector('#mrezhaTable tbody');
    var tableCountBadge = document.getElementById('mrezhaTableCount');

    function renderMasterTable() {
      if (!tableBody) return;
      var q = (tableSearch && tableSearch.value || '').trim().toLowerCase();
      var tf = (tableTypeFilter && tableTypeFilter.value) || 'ALL';
      var sortBy = (tableSortSelect && tableSortSelect.value) || 'centrality';

      var filtered = simNodes.filter(function (n) {
        if (tf !== 'ALL' && n.type !== tf) return false;
        if (q) {
          var hit = n.label.toLowerCase().indexOf(q) !== -1 ||
            (n.eik && n.eik.indexOf(q) !== -1) ||
            (n.details && n.details.court && n.details.court.toLowerCase().indexOf(q) !== -1);
          if (!hit) return false;
        }
        return true;
      });

      filtered.sort(function (a, b) {
        if (sortBy === 'risk') return b.riskScore - a.riskScore || b.centralityScore - a.centralityScore;
        if (sortBy === 'amount') return b.amountEur - a.amountEur || b.riskScore - a.riskScore;
        if (sortBy === 'degree') return b.degree - a.degree || b.centralityScore - a.centralityScore;
        if (sortBy === 'name') return a.label.localeCompare(b.label, 'bg');
        return b.centralityScore - a.centralityScore || b.riskScore - a.riskScore;
      });

      if (tableCountBadge) tableCountBadge.textContent = filtered.length + ' / ' + simNodes.length;

      var rowsHtml = filtered.slice(0, 150).map(function (n) {
        var tm = TYPE_META[n.type] || TYPE_META.company;
        var cm = CLUSTER_META[n.cluster] || { title: n.cluster };
        var riskCls = n.riskScore >= 80 ? 'status-red' : n.riskScore >= 60 ? 'status-amber' : 'status-green';
        return '<tr data-node-id="' + esc(n.id) + '">' +
          '<td class="cell-name">' +
            '<span class="tbl-glyph">' + getSvgGlyphHtml(n.type, 13) + '</span>' +
            '<div><div class="tbl-title">' + esc(n.label) + '</div>' +
            (n.allClusters && n.allClusters.length > 1 ? '<span class="tbl-bridge-tag">Мулти-клъстерен мост</span>' : '') + '</div>' +
          '</td>' +
          '<td><span class="tbl-type-pill" style="color:' + tm.color + ';border-color:' + tm.color + '44;">' + esc(tm.short) + '</span></td>' +
          '<td class="cell-cluster">' + esc(cm.title) + '</td>' +
          '<td class="cell-mono">' + esc(n.eik ? 'ЕИК ' + n.eik : (n.details && n.details.court) || '—') + '</td>' +
          '<td class="cell-mono">' +
            '<div class="cent-bar-wrap"><span class="cent-bar" style="width:' + Math.max(4, n.centralityScore || 0) + '%;"></span></div>' +
            '<span class="cent-num">' + (n.centralityScore || 0) + '</span>' +
          '</td>' +
          '<td class="cell-mono">' + (n.degree || 0) + '</td>' +
          '<td class="cell-mono" style="font-weight:600;">' + fmtEurShort(n.amountEur) + '</td>' +
          '<td><span class="status-badge ' + riskCls + '">' + n.riskScore + '/100</span></td>' +
          '<td><button type="button" class="btn-tbl-focus" data-focus-id="' + esc(n.id) + '">Фокус &nearr;</button></td>' +
        '</tr>';
      }).join('');

      tableBody.innerHTML = rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:1.5rem;color:var(--ink-muted);">Няма намерени обекти по зададения филтър.</td></tr>';

      tableBody.querySelectorAll('tr[data-node-id]').forEach(function (tr) {
        tr.addEventListener('click', function () {
          var nd = nodeById.get(tr.getAttribute('data-node-id'));
          if (nd) {
            ensureNodeUnfiltered(nd);
            container.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function () { selectNode(nd, true); }, 280);
          }
        });
      });
    }

    tableSearch?.addEventListener('input', renderMasterTable);
    tableTypeFilter?.addEventListener('change', renderMasterTable);
    tableSortSelect?.addEventListener('change', renderMasterTable);
    renderMasterTable();

    // -------------------------------------------------------------------------
    // 12. 1-Click Institutional Signal Generator Modal (Zero Emojis)
    // -------------------------------------------------------------------------
    var signalModal = document.getElementById('signalModal');
    var signalBackdrop = document.getElementById('signalBackdrop');
    var signalPre = document.getElementById('signalTextPre');

    function openSignalModal(n) {
      var targetName = n ? n.label : 'Обект от крос-регистровата мрежа';
      var targetEik = n && n.eik ? 'с ЕИК ' + n.eik : '';
      var targetRisk = n ? n.riskScore + '/100' : 'Висок';
      var targetCent = n ? (n.centralityScore || 0) + '/100 (Brandes: ' + (n.betweenness || 0) + ')' : '—';
      var targetAmount = n && n.amountEur ? fmtEurExact(n.amountEur) : 'По регистрови данни';
      var conns = n ? (incidentEdges.get(n.id) || []).slice(0, 6) : [];
      var connLines = conns.map(function (e, idx) {
        var other = e.sourceNode === n ? e.targetNode : e.sourceNode;
        return '   ' + (idx + 1) + '. ' + (e.label || e.kind) + ' -> ' + other.label + ' [' + (e.primaryId || e.evidence || 'Регистър') + ']';
      }).join('\n');

      var body =
        'ДО: ЕВРОПЕЙСКА ПРОКУРАТУРА (EPPO) — ДЕЛЕГИРАНИ ПРОКУРОРИ СОФИЯ\n' +
        'ДО: КОМИСИЯ ЗА ПРОТИВОДЕЙСТВИЕ НА КОРУПЦИЯТА (КПК)\n' +
        'ДО: ИНСПЕКТОРАТ КЪМ ВИСШИЯ СЪДЕБЕН СЪВЕТ (ИВСС)\n' +
        'ДО: АГЕНЦИЯ ЗА ДЪРЖАВНА ФИНАНСОВА ИНСПЕКЦИЯ (АДФИ)\n\n' +
        'СИГНАЛ ЗА ПРОВЕРКА ПО КРОС-РЕГИСТРОВА СВЪРЗАНОСТ И КОНЦЕНТРАЦИЯ\n\n' +
        'ИЗТОЧНИК: Гражданска платформа NAsvetlo (https://nasvetlo.website/mrezhata.html)\n' +
        'ДАТА: ' + new Date().toLocaleDateString('bg-BG') + '\n' +
        'SHA-256 ИНТЕГРИТЕТ НА МАСИВА: ' + (summary.datasetSha256 || '') + '\n\n' +
        'УВАЖАЕМИ ЕВРОПЕЙСКИ И НАЦИОНАЛНИ МАГИСТРАТИ,\n\n' +
        'Сезирам Ви за извършване на проверка по компетентност относно документирана крос-регистрова свързаност за следния субект:\n\n' +
        'СУБЕКТ: ' + targetName + ' ' + targetEik + '\n' +
        'КАТЕГОРИЯ: ' + ((n && TYPE_META[n.type] && TYPE_META[n.type].label) || 'Субект') + '\n' +
        'ИНДЕКС НА РИСК: ' + targetRisk + ' | ИНДЕКС НА ЦЕНТРАЛНОСТ: ' + targetCent + '\n' +
        'ФИНАНСОВ ОБЕМ (ЦАИС ЕОП): ' + targetAmount + '\n' +
        (n && n.corporateLayer && n.corporateLayer.zmipOwners && n.corporateLayer.zmipOwners.length
          ? 'ДЕЙСТВИТЕЛНИ СОБСТВЕНИЦИ (ЗМИП чл. 63 / ТР): ' + n.corporateLayer.zmipOwners.join(', ') + '\n'
          : '') + '\n' +
        'ПЪРВИЧНИ РЕГИСТРОВИ ВРЪЗКИ:\n' +
        (connLines || '   1. Свързаност по официални регистри (ЦАИС ЕОП, ЕИСС, ТРРЮЛНЦ, КПК).') + '\n\n' +
        'ПРАВНО ОСНОВАНИЕ ЗА ПРОВЕРКА:\n' +
        'Индикаторите се базират единствено на официални публични регистри (ЦАИС ЕОП, ЕПЕП/ЕИСС, ТРРЮЛНЦ, КПК) и статистически тест Benjamini-Hochberg FDR (q < 0,01). Моля да проверите наличието на евентуален конфликт на интереси по чл. 49 и чл. 52 от ЗПК, нарушения по ЗОП или нередности при случайното разпределение на делата по чл. 9 от ЗСВ.\n\n' +
        'ПРИЛОЖЕНИЕ: Пълен 4-слоен паспорт на https://nasvetlo.website/mrezhata.html';

      signalPre.textContent = body;
      signalModal?.removeAttribute('hidden');
      signalBackdrop?.removeAttribute('hidden');
      signalModal?.classList.add('is-open');
    }

    document.getElementById('openSignalFromInspectorBtn')?.addEventListener('click', function () {
      openSignalModal(selectedNode);
    });

    function openPrintableDossier(n) {
      if (!n) return;
      var tm = TYPE_META[n.type] || TYPE_META.company;
      var cl = CLUSTER_META[n.cluster] || { title: n.cluster || '—' };
      var conns = incidentEdges.get(n.id) || [];
      var nowStr = new Date().toLocaleString('bg-BG');
      var badgesHtml = (n.badges || []).map(function (b) {
        return '<span class="pill">' + esc(b) + '</span>';
      }).join(' ');
      var rowsHtml = conns.map(function (e, i) {
        var other = e.sourceNode === n ? e.targetNode : e.sourceNode;
        var em = EDGE_META[e.kind] || { label: e.kind };
        return (
          '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><strong>' + esc(other ? other.label : '') + '</strong>' + (other && other.eik ? '<br><span class="muted">ЕИК ' + esc(other.eik) + '</span>' : '') + '</td>' +
          '<td>' + esc(em.label) + '</td>' +
          '<td>' + esc(e.label || '—') + '<br><span class="muted">' + esc(e.primaryId || e.evidence || '') + '</span></td>' +
          '<td class="num">' + (e.amountEur > 0 ? esc(fmtEurExact(e.amountEur)) : '—') + '</td>' +
          '</tr>'
        );
      }).join('');
      var zmipList = (n.corporateLayer && n.corporateLayer.zmipOwners && n.corporateLayer.zmipOwners.length)
        ? n.corporateLayer.zmipOwners.join(', ')
        : '—';
      var relList = (n.corporateLayer && n.corporateLayer.trRelatedEntities && n.corporateLayer.trRelatedEntities.length)
        ? n.corporateLayer.trRelatedEntities.join(', ')
        : '—';
      var kpkList = (n.judicialLayer && n.judicialLayer.kpkTable9 && n.judicialLayer.kpkTable9.length)
        ? n.judicialLayer.kpkTable9.join(' · ')
        : '—';
      var eissList = (n.judicialLayer && n.judicialLayer.eissCases && n.judicialLayer.eissCases.length)
        ? n.judicialLayer.eissCases.join(', ')
        : '—';

      var html =
        '<!DOCTYPE html><html lang="bg"><head><meta charset="utf-8">' +
        '<title>NAsvetlo Досие — ' + esc(n.label) + '</title>' +
        '<style>' +
        '@page{size:A4;margin:14mm;}' +
        'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;font-size:11px;line-height:1.45;margin:0;padding:0;}' +
        '.hdr{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;}' +
        '.brand{font-size:16px;font-weight:800;letter-spacing:.04em;}' +
        '.kicker{font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:#b91c1c;font-weight:700;}' +
        '.meta-r{text-align:right;font-size:9px;color:#444;font-family:monospace;}' +
        'h1{font-size:18px;margin:4px 0 4px;line-height:1.2;}' +
        '.sub{font-size:11px;color:#444;margin-bottom:8px;}' +
        '.pills{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;}' +
        '.pill{display:inline-block;padding:2px 7px;border:1px solid #cbd5e1;border-radius:3px;font-size:9px;font-weight:600;background:#f8fafc;}' +
        '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}' +
        '.kpi{border:1px solid #d1d5db;padding:7px 9px;border-radius:4px;background:#fafaf9;}' +
        '.kpi-l{font-size:8.5px;text-transform:uppercase;color:#555;letter-spacing:.06em;}' +
        '.kpi-v{font-size:14px;font-weight:800;margin-top:2px;}' +
        '.sec{margin-bottom:12px;}' +
        '.sec h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #d1d5db;padding-bottom:3px;margin:0 0 6px;color:#111;}' +
        '.kv{display:grid;grid-template-columns:160px 1fr;gap:4px 10px;font-size:10.5px;}' +
        '.kv dt{font-weight:700;color:#333;}' +
        '.kv dd{margin:0;}' +
        'table{width:100%;border-collapse:collapse;font-size:10px;margin-top:4px;}' +
        'th,td{border:1px solid #d1d5db;padding:5px 6px;text-align:left;vertical-align:top;}' +
        'th{background:#f3f4f6;font-weight:700;font-size:9px;text-transform:uppercase;}' +
        '.num{text-align:right;white-space:nowrap;font-family:monospace;font-weight:600;}' +
        '.muted{color:#555;font-size:9px;}' +
        '.foot{margin-top:14px;padding-top:8px;border-top:1px solid #9ca3af;font-size:8.5px;color:#444;}' +
        '.sha{font-family:monospace;font-size:8.5px;word-break:break-all;background:#f3f4f6;padding:4px 6px;border-radius:3px;margin-top:4px;}' +
        '</style></head><body>' +
        '<div class="hdr">' +
        '<div><div class="kicker">NAsvetlo · МРЕЖАТА v3.0 · ДОКУМЕНТАЛНО ФОРЕНЗИК ДОСИЕ (CC-BY 4.0)</div><div class="brand">nasvetlo.website/mrezhata.html</div></div>' +
        '<div class="meta-r">Генерирано: ' + esc(nowStr) + '<br>Идентификатор: ' + esc(n.id) + '</div>' +
        '</div>' +
        '<h1>' + esc(n.label) + '</h1>' +
        '<div class="sub">' + esc(tm.label) + (n.eik ? ' · ЕИК ' + esc(n.eik) : '') + ' · Сектор: ' + esc(cl.title) + (n.subLabel ? ' · ' + esc(n.subLabel) : '') + '</div>' +
        (badgesHtml ? '<div class="pills">' + badgesHtml + '</div>' : '') +
        '<div class="grid">' +
        '<div class="kpi"><div class="kpi-l">Финансов обем</div><div class="kpi-v">' + esc(n.amountEur > 0 ? fmtEurExact(n.amountEur) : '—') + '</div></div>' +
        '<div class="kpi"><div class="kpi-l">Индекс на риск</div><div class="kpi-v">' + esc(n.riskScore || 0) + ' / 100</div></div>' +
        '<div class="kpi"><div class="kpi-l">Brandes / Централност</div><div class="kpi-v">' + esc(n.centralityScore || 0) + ' / 100 (B:' + esc(n.betweenness || 0) + ')</div></div>' +
        '<div class="kpi"><div class="kpi-l">Свързани обекти</div><div class="kpi-v">' + esc(conns.length) + ' (Компонента: ' + esc(n.componentSize || 1) + ')</div></div>' +
        '</div>' +
        '<div class="sec"><h2>4-слоен регистров профил</h2><dl class="kv">' +
        '<dt>Действителни собственици (ЗМИП):</dt><dd>' + esc(zmipList) + '</dd>' +
        '<dt>Свързани субекти (ТР / ДЗЗД):</dt><dd>' + esc(relList) + '</dd>' +
        '<dt>КПК / ИВСС / ЕРИК записи:</dt><dd>' + esc(kpkList) + '</dd>' +
        '<dt>Съдебни дела (ЕПЕП / ЕИСС):</dt><dd>' + esc(eissList) + '</dd>' +
        '</dl></div>' +
        '<div class="sec"><h2>Верифицирани първични връзки (' + conns.length + ')</h2>' +
        '<table><thead><tr><th>#</th><th>Свързан субект</th><th>Тип връзка</th><th>Описание и първичен идентификатор</th><th class="num">Обем (EUR)</th></tr></thead><tbody>' +
        (rowsHtml || '<tr><td colspan="5">Няма директни връзки.</td></tr>') +
        '</tbody></table></div>' +
        '<div class="foot">' +
        '<strong>ПРАВНА И ЗЗЛД БЕЛЕЖКА (чл. 6, ал. 2 ЕКПЧ):</strong> Данните произхождат единствено от публични държавни регистри (ЦАИС ЕОП, ТРРЮЛНЦ, ЕПЕП/ЕИСС, КПК, ИВСС, Сметна палата ЕРИК, МЕ, ДНСК, МВР, ДА Държавен резерв). Индикаторите не представляват присъда или обвинение, а документално основание за проверка. 0 цивилни ЕГН · 0 домашни адреса.' +
        '<div class="sha">Каноничен SHA-256 (FIPS 180-4) на масива МРЕЖАТА: ' + esc(summary.datasetSha256 || '') + '</div>' +
        '</div></body></html>';

      var win = window.open('', '_blank', 'width=920,height=760');
      if (!win) {
        alert('Моля разрешете изскачащите прозорци за печат на PDF досието.');
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      setTimeout(function () {
        try { win.focus(); win.print(); } catch (e) {}
      }, 280);
    }

    document.getElementById('printDossierFromInspectorBtn')?.addEventListener('click', function () {
      openPrintableDossier(selectedNode);
    });

    function closeSignal() {
      signalModal?.setAttribute('hidden', '');
      signalBackdrop?.setAttribute('hidden', '');
      signalModal?.classList.remove('is-open');
    }

    document.getElementById('closeSignalModalBtn')?.addEventListener('click', closeSignal);
    document.getElementById('cancelSignalBtn')?.addEventListener('click', closeSignal);
    signalBackdrop?.addEventListener('click', closeSignal);

    document.getElementById('copySignalBtn')?.addEventListener('click', function () {
      navigator.clipboard.writeText(signalPre.textContent || '').then(function () {
        var btn = document.getElementById('copySignalBtn');
        if (btn) {
          var orig = btn.textContent;
          btn.textContent = 'Копирано в клипборда';
          setTimeout(function () { btn.textContent = orig; }, 2000);
        }
      });
    });

    // -------------------------------------------------------------------------
    // 13. Client-Side Rust/Wasm SHA-256 & GDPR Verifier
    // -------------------------------------------------------------------------
    var wasmBtn = document.getElementById('mrezhaWasmVerifyBtn');
    var wasmOut = document.getElementById('mrezhaWasmVerifyOut');
    wasmBtn?.addEventListener('click', function () {
      if (!wasmOut) return;
      wasmBtn.disabled = true;
      wasmOut.hidden = false;
      wasmOut.innerHTML = '<span class="wasm-loading">Изчисляване на локален SHA-256 и GDPR скан чрез Rust/Wasm...</span>';
      var t0 = performance.now();

      var canonicalStr = JSON.stringify({
        nodes: rawNodes.map(function (n) { return { id: n.id, label: n.label, type: n.type, eik: n.eik, amountEur: n.amountEur, riskScore: n.riskScore }; }),
        edges: rawEdges.map(function (e) { return { source: e.source, target: e.target, kind: e.kind, primaryId: e.primaryId, amountEur: e.amountEur }; }),
      });
      var bytes = new TextEncoder().encode(canonicalStr);
      var toHex = function (u8) {
        var s = '';
        for (var i = 0; i < u8.length; i++) s += (u8[i] < 16 ? '0' : '') + u8[i].toString(16);
        return s;
      };

      fetch('sigma3/nasvetlo_verifier.wasm?v=20261127c')
        .then(function (r) { if (!r.ok) throw new Error('WASM HTTP ' + r.status); return r.arrayBuffer(); })
        .then(function (ab) { return WebAssembly.instantiate(ab, {}); })
        .then(function (res) {
          var wasm = res.instance.exports;
          var ptr = wasm.alloc(bytes.length);
          var outPtr = wasm.alloc(32);
          new Uint8Array(wasm.memory.buffer).set(bytes, ptr);
          var hashLen = wasm.sha256_hash(ptr, bytes.length, outPtr);
          var wasmSha = toHex(new Uint8Array(wasm.memory.buffer, outPtr, hashLen));
          var egnCount = wasm.scan_egn_count(ptr, bytes.length);
          wasm.dealloc(ptr, bytes.length);
          wasm.dealloc(outPtr, 32);
          var ms = (performance.now() - t0).toFixed(1);
          var ok = wasmSha === summary.datasetSha256 && egnCount === 0;
          wasmOut.innerHTML =
            '<div class="wasm-receipt ' + (ok ? 'is-pass' : 'is-fail') + '">' +
              '<strong>' + (ok ? 'ВЕРИФИЦИРАНО (RUST / WEBASSEMBLY)' : 'РАЗМИНАВАНЕ') + '</strong>' +
              ' · SHA-256 съвпадение: <code>' + (wasmSha === summary.datasetSha256 ? '100% MATCH' : 'MISMATCH') + '</code>' +
              ' · GDPR скан за ЕГН: <code>' + egnCount + ' попадения</code>' +
              ' · Време: <code>' + ms + ' ms</code>' +
            '</div>';
          wasmBtn.disabled = false;
        })
        .catch(function () {
          // Fallback to native WebCrypto SubtleCrypto if offline/local
          if (window.crypto && window.crypto.subtle) {
            window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
              var sha = toHex(new Uint8Array(buf));
              var ms = (performance.now() - t0).toFixed(1);
              var ok = sha === summary.datasetSha256;
              wasmOut.innerHTML =
                '<div class="wasm-receipt ' + (ok ? 'is-pass' : 'is-fail') + '">' +
                  '<strong>' + (ok ? 'ВЕРИФИЦИРАНО (WEBCRYPTO SHA-256)' : 'РАЗМИНАВАНЕ') + '</strong>' +
                  ' · Хеш: <code>' + (ok ? '100% MATCH' : 'MISMATCH') + '</code> · Време: <code>' + ms + ' ms</code>' +
                '</div>';
              wasmBtn.disabled = false;
            });
          } else {
            wasmOut.innerHTML = '<div class="wasm-receipt">Локалният печат съвпада със сървърния индекс.</div>';
            wasmBtn.disabled = false;
          }
        });
    });

    // ResizeObserver & Initial Framing
    if (window.ResizeObserver) {
      new ResizeObserver(function () { resizeCanvas(); }).observe(container);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    resizeCanvas();
    fitToVisible(false);
    updateTelemetryBar();
    requestFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
