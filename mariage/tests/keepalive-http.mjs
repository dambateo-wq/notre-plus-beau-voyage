import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';

// All database calls go to this local PostgREST stand-in, never to production.
const secret = 'local-keepalive-test-secret';
const anonKey = 'local-supabase-test-key';
const rows = [{ id: 'private-fixture-id', untouched: true }];
const originalRows = structuredClone(rows);
const calls = [];
let reply = 'row';
const upstream = createServer((request, response) => {
  calls.push({ method: request.method, url: request.url, headers: request.headers });
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  if (reply === 'timeout') return;
  if (Number.isInteger(reply)) {
    response.writeHead(reply).end('Private upstream error: ' + anonKey);
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json', 'sb-request-id': 'test-upstream-request' });
  response.end(reply === 'invalid' ? '<html>Unexpected gateway</html>' : JSON.stringify(
    reply === 'empty' ? [] : reply === 'too-many' ? [{ id: 'a' }, { id: 'b' }] : [{ id: rows[0].id }],
  ));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

function startNext(port, overrides) {
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    env: { ...process.env, SUPABASE_URL: upstreamUrl, SUPABASE_ANON_KEY: anonKey,
      CRON_SECRET: secret, KEEPALIVE_HEALTHCHECK_URL: '', ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next.js startup timeout')), 15000);
    server.stdout.on('data', chunk => {
      logs += chunk;
      if (logs.includes('Ready')) { clearTimeout(timer); resolve(); }
    });
    server.stderr.on('data', chunk => { logs += chunk; });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Next.js exited: ${code}`)); });
  });
  return { server, ready, logs: () => logs };
}

try {
  for (const [index, mode] of ['configured', 'missing-secret', 'missing-supabase'].entries()) {
    const port = 3341 + index;
    const run = startNext(port, mode === 'missing-secret' ? { CRON_SECRET: '' }
      : mode === 'missing-supabase' ? { SUPABASE_ANON_KEY: '' } : {});
    const endpoint = `http://127.0.0.1:${port}/api/cron/supabase-keepalive`;
    const runIds = new Set();
    async function invoke(authorization, expectedStatus, method = 'GET') {
      const response = await fetch(endpoint, {
        method, ...(authorization ? { headers: { Authorization: authorization } } : {}),
      });
      assert.equal(response.status, expectedStatus);
      const body = await response.text();
      assert(!body.includes(secret) && !body.includes(anonKey) && !body.includes(rows[0].id));
      if (method === 'GET') {
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
        assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
        const runId = response.headers.get('x-keepalive-run-id');
        assert.match(runId, /^[a-f0-9-]{36}$/);
        assert(!runIds.has(runId), 'each invocation has its own execution ID');
        runIds.add(runId);
      }
      if (expectedStatus === 200) assert.deepEqual(JSON.parse(body), { ok: true });
      if (expectedStatus === 500) assert.deepEqual(JSON.parse(body), { ok: false });
    }
    try {
      await run.ready;
      const before = calls.length;
      await invoke(undefined, 401);
      await invoke('Bearer wrong', 401);
      await invoke('Bearer ' + secret, 405, 'POST');
      assert.equal(calls.length, before, 'unauthorized and unsupported methods never reach Supabase');
      if (mode !== 'configured') {
        await invoke('Bearer ' + secret, mode === 'missing-secret' ? 401 : 500);
        assert.equal(calls.length, before, 'missing configuration never makes a database call');
      } else {
        for (const variant of ['row', 'row', 'empty', 401, 403, 503, 'invalid', 'too-many', 'timeout']) {
          reply = variant;
          const count = calls.length;
          const started = Date.now();
          await invoke('Bearer ' + secret, ['row', 'empty'].includes(variant) ? 200 : 500);
          assert.equal(calls.length, count + 1, 'exactly one real request per authorized invocation, no cached result or retry');
          const call = calls.at(-1);
          assert.equal(call.method, 'GET');
          assert.equal(call.url, '/rest/v1/guest_routes?select=id&limit=1');
          assert.equal(call.headers.apikey, anonKey);
          assert.equal(call.headers.authorization, 'Bearer ' + anonKey);
          assert.equal(call.headers['cache-control'], 'no-cache');
          if (variant === 'timeout') {
            assert(Date.now() - started >= 7500 && Date.now() - started < 12000, 'upstream is bounded by its 8s timeout');
          }
        }
      }
    } finally {
      if (run.server.pid && run.server.exitCode === null && run.server.signalCode === null) {
        const exit = once(run.server, 'exit');
        run.server.kill('SIGTERM');
        await exit;
      }
    }
    const logs = run.logs();
    assert(!logs.includes(secret) && !logs.includes(anonKey) && !logs.includes(rows[0].id), 'logs never contain keys or records');
    assert(logs.includes('supabase.keepalive.unauthorized'));
    if (mode === 'configured') {
      assert(logs.includes('supabase.keepalive.succeeded'));
      assert(logs.includes('test-upstream-request'));
      assert(logs.includes('supabase.keepalive.failed'));
      assert(logs.includes('"reason":"upstream_timeout"'));
      assert(logs.includes('"status":"disabled"'), 'unconfigured monitoring is visible');
    }
    console.log(`PASS ${mode}: production HTTP route, authentication, safe logging and configuration`);
  }
  assert.deepEqual(rows, originalRows, 'database fixture is unchanged');
  assert(calls.every(call => call.method === 'GET'), 'no database writes');
  console.log('PASS read-only LIMIT 1, fresh requests, empty table, upstream errors, malformed responses and timeout');
} finally {
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
}
