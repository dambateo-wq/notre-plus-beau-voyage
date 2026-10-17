import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import ts from 'typescript';

// Real aggregation module; all HTTP/database fixtures stay local and read-only.
const source = await readFile('lib/guest-route-travelers.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} });
const { addRouteTravelers } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const routes = [{ id: 'public-route', display_name: 'Gustridson', city: 'Nivelles', country: 'Belgique',
  latitude: 50.5976885, longitude: 4.3235854, created_at: '2026-08-17T21:02:07Z' }];
const registration = { respondent_name: 'Gustridson', companions: ['Tonton Gus', 'Nelson'],
  departure_city: 'Nivelles', departure_country: 'Belgique', not_attending: false,
  lodging_guest_names: ['Gustridson'], lodging_payment_method: 'later',
  respondent_email: 'private-test@example.invalid', management_token_hash: 'private-test-token' };
let registrations = [registration];
const original = structuredClone({ routes, registration });
const expectedNames = ['Gustridson', 'Tonton Gus', 'Nelson'];
assert.deepEqual(addRouteTravelers(routes, registrations)[0].traveler_names, expectedNames);

const duplicateRoute = { ...routes[0], id: 'another-public-route', city: ' NIVELLES ', country: 'BELGIQUE',
  display_name: 'Autre inscription', latitude: 50.6 };
const extra = { ...registration, respondent_name: 'Autre inscription', companions: ['Nelson', 'Sixième', 'Septième'],
  departure_city: ' nivelles ', departure_country: ' belgique ', lodging_guest_names: [], lodging_payment_method: 'bank_transfer' };
const multiple = [registration, extra, { ...registration, respondent_name: 'Absent', not_attending: true },
  { ...registration, departure_country: 'Autre pays', respondent_name: 'Autre ville' }];
const grouped = addRouteTravelers([...routes, duplicateRoute], multiple);
assert.deepEqual(grouped.map(route => route.traveler_names), [
  [...expectedNames, 'Autre inscription', 'Nelson', 'Sixième', 'Septième'],
  [...expectedNames, 'Autre inscription', 'Nelson', 'Sixième', 'Septième'],
], 'all registrations and companions count, including namesakes, regardless of lodging/payment');
assert.deepEqual(grouped.map(({ traveler_names, ...route }) => { assert(traveler_names); return route; }), [...routes, duplicateRoute],
  'geometry, route IDs, order and existing fields stay identical');
assert.deepEqual(addRouteTravelers(routes, [])[0].traveler_names, ['Gustridson'], 'retain legacy departures with no matching registration');
assert.deepEqual(addRouteTravelers(routes, [{ ...registration, companions: null }])[0].traveler_names, ['Gustridson']);
assert.deepEqual(addRouteTravelers(routes, [{ ...registration, not_attending: true }])[0].traveler_names, []);
assert.deepEqual(addRouteTravelers([{ ...routes[0], city: null }], registrations)[0].traveler_names, []);
assert.deepEqual({ routes, registration }, original, 'aggregation never mutates records');
console.log('PASS aggregation: Nivelles, companions, multiple registrations, namesakes, legacy data and unchanged geometry');

const calls = [];
let failure = null;
const publicKey = 'local-public-key', privateKey = 'local-service-key';
const fields = 'respondent_name,companions,departure_city,departure_country,not_attending';
const upstream = createServer((request, response) => {
  calls.push({ method: request.method, url: request.url, key: request.headers.apikey });
  const url = new URL(request.url, 'http://local.invalid');
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  if (url.pathname === failure) { response.writeHead(503).end(privateKey); return; }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(url.pathname === '/rest/v1/guest_routes' ? routes : registrations));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3451'], {
  env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    SUPABASE_ANON_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: privateKey }, stdio: ['ignore', 'pipe', 'pipe'],
});
const endpoint = 'http://127.0.0.1:3451/api/routes';
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next.js startup timeout')), 15000);
    server.stdout.on('data', data => { if (String(data).includes('Ready')) { clearTimeout(timer); resolve(); } });
    server.stderr.resume();
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Next.js exited: ' + code)); });
  });
  for (const records of [[registration], multiple, []]) {
    registrations = records;
    const before = calls.length;
    const response = await fetch(endpoint);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const json = await response.json();
    assert.deepEqual(json, addRouteTravelers(routes, records));
    const payload = JSON.stringify(json);
    for (const secret of [privateKey, publicKey, registration.respondent_email, registration.management_token_hash,
      'lodging_guest_names', 'lodging_payment_method', 'respondent_email', 'management_token_hash']) assert(!payload.includes(secret));
    assert.equal(calls.length, before + 2, 'each request performs fresh database reads');
    const recent = calls.slice(before);
    assert(recent.some(call => call.url === '/rest/v1/guest_routes?select=*&order=created_at.asc' && call.key === publicKey));
    assert(recent.some(call => call.url === '/rest/v1/wedding_responses?select=' + fields + '&order=created_at.asc' && call.key === privateKey));
  }
  for (failure of ['/rest/v1/guest_routes', '/rest/v1/wedding_responses']) {
    const response = await fetch(endpoint);
    assert.equal(response.status, 503);
    assert(!JSON.stringify(await response.json()).includes(privateKey));
  }
  const before = calls.length;
  assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405);
  assert.equal(calls.length, before);
  assert(calls.every(call => call.method === 'GET'), 'no write or notification endpoint was called');
  assert.deepEqual({ routes, registration }, original);
  console.log('PASS production API: exact public fields, fresh reads only, no private fields, no writes and safe failures');
} finally {
  if (server.pid && server.exitCode === null && server.signalCode === null) {
    const exit = once(server, 'exit'); server.kill('SIGTERM'); await exit;
  }
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
}
