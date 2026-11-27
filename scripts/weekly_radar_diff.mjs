import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const EXCLUDED_RE = /росица.*велкова|велкова-желева|поля.*занева|занева-димитрова/i;
const FORBIDDEN_RE = /20\.Д-72|94-00-322|Вх\.\s*№|\b\d{10}\b/gi;

const INDEXNOW_HOST = 'nasvetlo.website';
const INDEXNOW_KEY = '7f4a9c2e8b1d4063a5f2e9c18d7b3a40';
const ALL_URLS = [
  'https://nasvetlo.website/',
  'https://nasvetlo.website/ot-mrak-kam-svetlina.html',
  'https://nasvetlo.website/en/',
  'https://nasvetlo.website/razsledvaniya.html',
  'https://nasvetlo.website/telk-skener.html',
  'https://nasvetlo.website/ezdrave-telk.html',
  'https://nasvetlo.website/reports/NASVETLO_EPPO_DG_JUST_EXECUTIVE_BRIEF_2026_EN.pdf',
  'https://nasvetlo.website/sitemap.xml',
  'https://nasvetlo.website/feed.xml',
  'https://nasvetlo.website/data/nasvetlo_weekly_bulletin.json',
];

function sanitizeText(s) {
  return String(s ?? '').replace(FORBIDDEN_RE, '').trim();
}

export function flagKey(rf) {
  return [
    String(rf.courtName || '').trim(),
    String(rf.caseKind || '').trim(),
    String(rf.year || ''),
    String(rf.party || '').trim(),
    String(rf.judge || '').trim(),
  ].join('|');
}

function compactFlag(rf) {
  return {
    key: flagKey(rf),
    courtName: sanitizeText(rf.courtName),
    caseKind: sanitizeText(rf.caseKind),
    year: Number(rf.year || 0),
    party: sanitizeText(rf.party),
    partyEik: sanitizeText(rf.partyEik),
    judge: sanitizeText(rf.judge),
    k: Number(rf.k || 0),
    nParty: Number(rf.nParty || 0),
    ratio: Number(Number(rf.ratio || 0).toFixed(2)),
    q: Number(rf.q || 0),
    explanationTier: String(rf.explanationTier || ''),
    procurementEurM: Number(Number(rf.procurementEurM || 0).toFixed(2)),
    caseUrl: rf.sampleCases && rf.sampleCases[0] ? String(rf.sampleCases[0].caseUrl || '') : String(rf.caseUrl || ''),
  };
}

export function computeWeeklyDiff(prevBaseline, currentAudit) {
  const currentFlags = (currentAudit?.redFlags || [])
    .filter((r) => !EXCLUDED_RE.test(String(r.judge || '')) && !EXCLUDED_RE.test(String(r.party || '')))
    .map(compactFlag);

  const u = currentAudit?.universe || {};
  const hasPrev = Boolean(prevBaseline && Array.isArray(prevBaseline.flags) && prevBaseline.flags.length > 0);

  if (!hasPrev) {
    return {
      addedRedFlags: [],
      escalatedRedFlags: [],
      resolvedRedFlags: [],
      deltas: {
        casesUnique: 0,
        redFlagsTotal: 0,
        unexplainedRedTotal: 0,
      },
      currentCompactFlags: currentFlags,
    };
  }

  const prevMap = new Map();
  for (const pf of prevBaseline.flags) {
    prevMap.set(pf.key || flagKey(pf), pf);
  }

  const currMap = new Map();
  for (const cf of currentFlags) {
    currMap.set(cf.key, cf);
  }

  const addedRedFlags = [];
  const escalatedRedFlags = [];
  const resolvedRedFlags = [];

  for (const cf of currentFlags) {
    const prev = prevMap.get(cf.key);
    if (!prev) {
      addedRedFlags.push(cf);
    } else if (cf.k > Number(prev.k || 0) || cf.ratio >= Number(prev.ratio || 0) + 0.25) {
      escalatedRedFlags.push({
        ...cf,
        prevK: Number(prev.k || 0),
        prevRatio: Number(prev.ratio || 0),
      });
    }
  }

  for (const [k, pf] of prevMap.entries()) {
    if (!currMap.has(k)) {
      resolvedRedFlags.push(pf);
    }
  }

  const prevU = prevBaseline.universe || {};
  return {
    addedRedFlags,
    escalatedRedFlags,
    resolvedRedFlags,
    deltas: {
      casesUnique: Number(u.casesUnique || 0) - Number(prevU.casesUnique || 0),
      redFlagsTotal: Number(u.redFlagsTotal || 0) - Number(prevU.redFlagsTotal || 0),
      unexplainedRedTotal: Number(u.unexplainedRedTotal || 0) - Number(prevU.unexplainedRedTotal || 0),
    },
    currentCompactFlags: currentFlags,
  };
}

function getIsoWeekLabel(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateFeedsIfChanged(bulletin) {
  if (bulletin.addedCount === 0 && bulletin.escalatedCount === 0) return;

  const feedPath = path.join(root, 'docs', 'feed.xml');
  if (fs.existsSync(feedPath)) {
    let feed = fs.readFileSync(feedPath, 'utf8');
    const guid = `https://nasvetlo.website/ot-mrak-kam-svetlina.html#weekly-${bulletin.weekIso}`;
    const nowRfc = new Date().toUTCString().replace('GMT', '+0000');
    feed = feed.replace(/<lastBuildDate>[^<]+<\/lastBuildDate>/, `<lastBuildDate>${nowRfc}</lastBuildDate>`);
    if (!feed.includes(guid)) {
      const topExamples = [...bulletin.addedRedFlags, ...bulletin.escalatedRedFlags]
        .slice(0, 3)
        .map((f) => `${f.courtName}: ${f.party} -> ${f.judge} (x${f.ratio})`)
        .join('; ');
      const itemXml =
        `    <item>\n` +
        `      <title>Седмичен ЕИСС радар ${bulletin.weekIso}: +${bulletin.addedCount} нови RED, ${bulletin.escalatedCount} ескалирали (${bulletin.totals.casesUnique.toLocaleString('en-US')} дела)</title>\n` +
        `      <link>https://nasvetlo.website/ot-mrak-kam-svetlina.html</link>\n` +
        `      <guid isPermaLink="false">${guid}</guid>\n` +
        `      <pubDate>${nowRfc}</pubDate>\n` +
        `      <description>${escapeXml(topExamples || 'Автоматичен седмичен срез на ЕПЕП/ЕИСС и ЦАИС ЕОП.')}</description>\n` +
        `    </item>\n`;
      feed = feed.replace(/(<atom:link[^>]*\/>\s*\n)/, `$1${itemXml}`);
    }
    fs.writeFileSync(feedPath, feed, 'utf8');
  }

  const sitemapPath = path.join(root, 'docs', 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    const today = new Date().toISOString().slice(0, 10);
    let sm = fs.readFileSync(sitemapPath, 'utf8');
    sm = sm.replace(
      /(<loc>https:\/\/nasvetlo\.website\/ot-mrak-kam-svetlina\.html<\/loc>\s*<lastmod>)[^<]+(<\/lastmod>)/,
      `$1${today}$2`
    );
    fs.writeFileSync(sitemapPath, sm, 'utf8');
  }
}

export async function pingIndexNow() {
  const resp = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
      urlList: ALL_URLS,
    }),
  });
  console.log(`INDEXNOW_STATUS=${resp.status}`);
  return resp.status;
}

async function runCli() {
  const args = new Set(process.argv.slice(2));
  const auditPath = path.join(root, 'docs', 'data', 'nasvetlo_eiss_audit.json');
  const baselinePath = path.join(root, 'docs', 'data', 'eiss_weekly_baseline.json');
  const bulletinPath = path.join(root, 'docs', 'data', 'nasvetlo_weekly_bulletin.json');

  const rawBytes = fs.readFileSync(auditPath);
  const rawFileSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');
  const currentAudit = JSON.parse(rawBytes.toString('utf8'));
  const prevBaseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;

  const diff = computeWeeklyDiff(prevBaseline, currentAudit);
  const u = currentAudit.universe || {};
  const weekIso = getIsoWeekLabel();
  const generatedAtUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const bulletin = {
    weekIso,
    generatedAtUtc,
    rawFileSha256,
    datasetSha256: String(u.datasetSha256 || ''),
    zenodoDoi: '10.5281/zenodo.24580253',
    totals: {
      casesUnique: Number(u.casesUnique || 0),
      courts: Number(u.courts || 0),
      judges: Number(u.judges || 0),
      redFlagsTotal: Number(u.redFlagsTotal || 0),
      unexplainedRedTotal: Number(u.unexplainedRedTotal || 0),
      multiYearPersistentTotal: Number(u.multiYearPersistentTotal || 0),
    },
    deltas: diff.deltas,
    addedCount: diff.addedRedFlags.length,
    escalatedCount: diff.escalatedRedFlags.length,
    resolvedCount: diff.resolvedRedFlags.length,
    addedRedFlags: diff.addedRedFlags.slice(0, 25),
    escalatedRedFlags: diff.escalatedRedFlags.slice(0, 25),
  };

  fs.writeFileSync(bulletinPath, JSON.stringify(bulletin, null, 2) + '\n', 'utf8');

  if (!prevBaseline || args.has('--update-baseline') || diff.addedRedFlags.length > 0 || diff.escalatedRedFlags.length > 0) {
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({
        weekIso,
        updatedAtUtc: generatedAtUtc,
        rawFileSha256,
        universe: bulletin.totals,
        flags: diff.currentCompactFlags,
      }) + '\n',
      'utf8'
    );
  }

  updateFeedsIfChanged(bulletin);
  console.log(
    `WEEKLY_RADAR week=${weekIso} flags=${diff.currentCompactFlags.length} added=${bulletin.addedCount} escalated=${bulletin.escalatedCount} resolved=${bulletin.resolvedCount}`
  );

  if (args.has('--ping-indexnow')) {
    await pingIndexNow();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
