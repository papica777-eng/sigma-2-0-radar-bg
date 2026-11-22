/**
 * NAsvetlo Sovereign Visit Counter (Cloudflare Worker + D1 SQLite)
 * -----------------------------------------------------------------
 * - Strictly monotonic global counter: NEVER resets, NEVER decrements.
 * - Enforced at BOTH Worker logic (no reset/delete endpoints) AND D1 SQLite triggers.
 * - Zero cookies, zero IP storage, zero personal data (100% GDPR / ЗЗЛД compliant).
 * - Filters automated crawlers & foreign-origin direct pings on /hit so only real
 *   human browser visits to nasvetlo.website increment the counter.
 */

const SITE_ID = 'nasvetlo.website';

const ALLOWED_ORIGINS = new Set([
  'https://nasvetlo.website',
  'https://www.nasvetlo.website',
  'https://papica777-eng.github.io',
  'https://paas.website',
  'https://www.paas.website',
]);

const BOT_UA_RE = /(bot|crawl|spider|slurp|headless|lighthouse|pagespeed|curl|wget|python|powershell|httpie|postman|insomnia|uptime|monitor|pingdom|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|applebot|yandex|bingpreview|googlebot|duckduckbot|semrush|ahrefs|mj12bot|bytespider)/i;

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  return 'https://nasvetlo.website';
}

function isTrustedBrowserVisit(request) {
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || ua.length < 12 || BOT_UA_RE.test(ua)) return false;

  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.has(origin)) return true;

  const referer = request.headers.get('Referer') || '';
  for (const allowed of ALLOWED_ORIGINS) {
    if (referer.startsWith(allowed + '/') || referer === allowed) return true;
  }
  return false;
}

function jsonResponse(body, status, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Origin': getCorsOrigin(request),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readCounter(env) {
  const row = await env.DB.prepare(
    'SELECT total_visits, created_at, updated_at FROM visit_counters WHERE site_id = ?'
  )
    .bind(SITE_ID)
    .first();
  if (!row) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO visit_counters (site_id, total_visits, created_at, updated_at) VALUES (?, 0, datetime('now'), datetime('now'))"
    )
      .bind(SITE_ID)
      .run();
    return { total_visits: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }
  return row;
}

async function incrementCounter(env) {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO visit_counters (site_id, total_visits, created_at, updated_at) VALUES (?, 0, datetime('now'), datetime('now'))"
  )
    .bind(SITE_ID)
    .run();

  const row = await env.DB.prepare(
    "UPDATE visit_counters SET total_visits = total_visits + 1, updated_at = datetime('now') WHERE site_id = ? RETURNING total_visits, created_at, updated_at"
  )
    .bind(SITE_ID)
    .first();

  return row || (await readCounter(env));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': getCorsOrigin(request),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method !== 'GET' && request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, request);
    }

    try {
      if (path === '/hit') {
        const shouldCount = isTrustedBrowserVisit(request);
        const row = shouldCount ? await incrementCounter(env) : await readCounter(env);
        return jsonResponse(
          {
            ok: true,
            site: SITE_ID,
            total: Number(row.total_visits) || 0,
            counted: shouldCount,
            since: row.created_at,
            updatedAt: row.updated_at,
          },
          200,
          request
        );
      }

      if (path === '/stats' || path === '/') {
        const row = await readCounter(env);
        return jsonResponse(
          {
            ok: true,
            site: SITE_ID,
            total: Number(row.total_visits) || 0,
            counted: false,
            since: row.created_at,
            updatedAt: row.updated_at,
          },
          200,
          request
        );
      }

      return jsonResponse({ ok: false, error: 'not_found' }, 404, request);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'storage_error' }, 503, request);
    }
  },
};
