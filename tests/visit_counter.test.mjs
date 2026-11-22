import assert from 'node:assert/strict';
import worker from '../workers/visit-counter/worker.js';

function createMockD1() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let bindings = [];
      const stmt = {
        bind(...args) {
          bindings = args;
          return stmt;
        },
        async run() {
          if (/INSERT OR IGNORE INTO visit_counters/i.test(sql)) {
            const siteId = bindings[0];
            if (!rows.has(siteId)) {
              const now = new Date().toISOString();
              rows.set(siteId, { site_id: siteId, total_visits: 0, created_at: now, updated_at: now });
            }
          }
          return { success: true };
        },
        async first() {
          const siteId = bindings[0];
          if (/UPDATE visit_counters\s+SET total_visits = total_visits \+ 1/i.test(sql)) {
            const cur = rows.get(siteId);
            if (!cur) return null;
            cur.total_visits += 1;
            cur.updated_at = new Date().toISOString();
            return { ...cur };
          }
          if (/SELECT total_visits/i.test(sql)) {
            const cur = rows.get(siteId);
            return cur ? { ...cur } : null;
          }
          return null;
        },
      };
      return stmt;
    },
  };
}

async function runTests() {
  const env = { DB: createMockD1() };

  // 1. Initial stats = 0, counted = false
  let res = await worker.fetch(new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/stats'), env);
  assert.equal(res.status, 200);
  let body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.total, 0);
  assert.equal(body.counted, false);

  // 2. Bot User-Agent on /hit must NOT increment
  res = await worker.fetch(
    new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/hit', {
      method: 'POST',
      headers: { 'User-Agent': 'Googlebot/2.1', Origin: 'https://nasvetlo.website' },
    }),
    env
  );
  body = await res.json();
  assert.equal(body.total, 0);
  assert.equal(body.counted, false);

  // 3. Foreign origin on /hit must NOT increment
  res = await worker.fetch(
    new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/hit', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
        Origin: 'https://evil.example.com',
      },
    }),
    env
  );
  body = await res.json();
  assert.equal(body.total, 0);
  assert.equal(body.counted, false);

  // 4. Genuine browser visit from nasvetlo.website increments monotonically
  for (let expected = 1; expected <= 5; expected += 1) {
    res = await worker.fetch(
      new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/hit', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
          Origin: 'https://nasvetlo.website',
        },
      }),
      env
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://nasvetlo.website');
    body = await res.json();
    assert.equal(body.total, expected);
    assert.equal(body.counted, true);
  }

  // 5. DELETE / PUT / reset routes are strictly rejected (never resets!)
  res = await worker.fetch(
    new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/hit', { method: 'DELETE' }),
    env
  );
  assert.equal(res.status, 405);

  res = await worker.fetch(
    new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/reset', { method: 'POST' }),
    env
  );
  assert.equal(res.status, 404);

  // 6. Final stats unchanged at 5
  res = await worker.fetch(new Request('https://nasvetlo-visits.anchialo-v2.workers.dev/stats'), env);
  body = await res.json();
  assert.equal(body.total, 5);

  console.log('ALL 6 VISIT COUNTER INVARIANT TESTS PASSED!');
}

runTests();
