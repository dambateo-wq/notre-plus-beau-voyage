import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Load the real server modules with only the framework marker/imports adapted
// for Node. No external requests or production credentials are used.
async function moduleUrl(path, replacements = []) {
  let source = await readFile(path, 'utf8');
  source = source.replace('import "server-only";', '');
  for (const [from, to] of replacements) source = source.replace(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}
const monitorUrl = await moduleUrl('lib/keepalive-monitor.ts');
const configUrl = await moduleUrl('lib/supabase.ts');
const routeUrl = await moduleUrl('app/api/cron/supabase-keepalive/route.ts', [
  ['"@/lib/supabase"', JSON.stringify(configUrl)],
  ['"@/lib/keepalive-monitor"', JSON.stringify(monitorUrl)],
]);
const { reportKeepalive } = await import(monitorUrl);
const { GET } = await import(routeUrl);
const ping = 'https://hc-ping.com/11111111-2222-3333-4444-555555555555';
const originalFetch = globalThis.fetch;
const originalInfo = console.info;
const originalError = console.error;
const envNames = ['KEEPALIVE_HEALTHCHECK_URL', 'CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const originalEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
const calls = [];
const logs = [];
let upstreamStatus = 200;
let monitorStatus = 200;
let networkError = false;

try {
  console.info = console.error = record => logs.push(record);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith('https://database.example/')) {
      return new Response(upstreamStatus === 200 ? '[]' : 'private database failure', { status: upstreamStatus });
    }
    assert(url === ping || url === ping + '/fail', 'only the configured monitoring destination is contacted');
    assert.equal(init.method, 'GET');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert(init.signal instanceof AbortSignal);
    assert.equal(init.headers, undefined, 'no database credentials or bearer token leave for the monitor');
    assert.equal(init.body, undefined, 'no records or logs leave for the monitor');
    if (networkError) throw new Error('private failure with ' + ping);
    return new Response('', { status: monitorStatus });
  };
  delete process.env.KEEPALIVE_HEALTHCHECK_URL;
  assert.deepEqual(await reportKeepalive(true), { status: 'disabled' });
  for (const value of ['not-a-url', ping.replace('https:', 'http:'), ping.replace('hc-ping.com', 'evil.example'),
    'https://secret@hc-ping.com/11111111-2222-3333-4444-555555555555', ping + '?secret=yes', ping + '#x', ping + '/fail']) {
    process.env.KEEPALIVE_HEALTHCHECK_URL = value;
    assert.deepEqual(await reportKeepalive(true), { status: 'failed', reason: 'invalid_url' });
  }
  assert.equal(calls.length, 0, 'invalid or missing configuration never sends a ping');
  process.env.KEEPALIVE_HEALTHCHECK_URL = ping;
  assert.deepEqual(await reportKeepalive(true), { status: 'sent' });
  assert.equal(calls.at(-1).url, ping);
  assert.deepEqual(await reportKeepalive(false), { status: 'sent' });
  assert.equal(calls.at(-1).url, ping + '/fail');
  monitorStatus = 503;
  assert.deepEqual(await reportKeepalive(true), { status: 'failed', reason: 'http_error' });
  monitorStatus = 200;
  networkError = true;
  assert.deepEqual(await reportKeepalive(true), { status: 'failed', reason: 'network_or_timeout' });
  networkError = false;

  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_ANON_KEY = 'test-private-anon-key';
  process.env.CRON_SECRET = 'test-private-cron-secret';
  const request = token => new Request('https://site.example/api/cron/supabase-keepalive', {
    ...(token ? { headers: { Authorization: 'Bearer ' + token } } : {}),
  });
  calls.length = 0;
  assert.equal((await GET(request())).status, 401);
  assert.equal((await GET(request('wrong'))).status, 401);
  assert.equal(calls.length, 0, 'unauthorized callers cannot create monitoring spam');
  const good = await GET(request(process.env.CRON_SECRET));
  assert.equal(good.status, 200);
  assert.deepEqual(calls.map(call => call.url), ['https://database.example/rest/v1/guest_routes?select=id&limit=1', ping],
    'success heartbeat follows the real SELECT, including an empty table');
  calls.length = 0;
  upstreamStatus = 503;
  assert.equal((await GET(request(process.env.CRON_SECRET))).status, 500);
  assert.deepEqual(calls.map(call => call.url), ['https://database.example/rest/v1/guest_routes?select=id&limit=1', ping + '/fail']);
  calls.length = 0;
  upstreamStatus = 200;
  monitorStatus = 503;
  assert.equal((await GET(request(process.env.CRON_SECRET))).status, 200, 'monitor outage does not hide a successful database read');
  assert(logs.some(log => log.includes('"reason":"http_error"')));
  assert(logs.every(log => !log.includes(ping) && !log.includes(process.env.CRON_SECRET)
    && !log.includes(process.env.SUPABASE_ANON_KEY) && !log.includes('private database failure')));
} finally {
  globalThis.fetch = originalFetch;
  console.info = originalInfo;
  console.error = originalError;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
  }
}
console.log('PASS watchdog: destination validation, success after SELECT, explicit failures, outages and no secret/data transmission');
