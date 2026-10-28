import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadDigestModules, fixture, dataModule, moduleUrl } from './weekly-digest-loader.mjs';

const emailMock = dataModule(`export function isEmailConfigured(){return true;} export async function sendWeddingEmail(message){throw new Error('unit tests must never send mail');}`);
const { time, model, render, server, cron, manual } = await loadDigestModules(emailMock);
const window = time.windowEndingAt('2026-10-25T17:00:00.000Z');
assert.equal(window.start, '2026-10-18T16:00:00.000Z');
assert.equal((Date.parse(window.end) - Date.parse(window.start)) / 3600000, 169);
const spring = time.windowEndingAt('2027-03-28T16:00:00.000Z');
assert.equal((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000, 167);
for (const end of ['2026-11-01T17:00:00Z', '2027-05-23T16:00:00Z', '2027-05-30T16:00:00Z']) {
  assert.equal(time.latestDigestWindow(new Date(end)).end, new Date(end).toISOString());
}
assert.equal(time.latestDigestWindow(new Date('2026-10-25T16:59:59Z')).end, '2026-10-18T16:00:00.000Z');
assert.equal(time.withinScheduledWindow(new Date('2026-10-26T16:59:59Z'), window), true);
assert.equal(time.withinScheduledWindow(new Date('2026-10-26T17:00:00Z'), window), false);
assert.throws(() => time.windowEndingAt('2026-10-25T18:00:00Z'));
assert.throws(() => time.windowEndingAt('2026-10-24T16:00:00Z'));

const source = fixture();
const original = structuredClone(source);
const report = model.buildWeeklyDigest(source, window, 3500, ['2027-05-28', '2027-05-29']);
assert.equal(report.newFormCount, 1);
assert.equal(report.newPeopleCount, 3, 'namesakes are not deduplicated');
assert.equal(report.totalPeopleCount, 3);
assert.deepEqual(report.placementByNight, { '2027-05-28': 2, '2027-05-29': 3 });
assert.deepEqual(report.unplaced[0].nights, ['2027-05-29']);
assert.equal(report.unplaced.length, 3, 'same person unplaced twice counts once in the summary');
assert.equal(report.outstandingCents, 14000);
assert.deepEqual(source, original);
model.assertDigestSendable(report);

const boundaries = fixture();
boundaries.registrations = [
  { ...source.registrations[0], id: 'old', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-24T10:00:00Z' },
  { ...source.registrations[0], id: 'start', created_at: window.start },
  { ...source.registrations[0], id: 'end', created_at: window.end },
  { ...source.registrations[0], id: 'absent', not_attending: true, lodging_nights: [], lodging_guest_names: [] },
];
const bounded = model.buildWeeklyDigest(boundaries, window, 3500, report.nights);
assert.equal(bounded.newFormCount, 2);
assert.equal(bounded.newPeopleCount, 3);
assert.equal(bounded.newDeclinedCount, 1);

const unknown = fixture(); unknown.reservations[0].received_amount_cents = null;
const unknownReport = model.buildWeeklyDigest(unknown, window, 3500, report.nights);
assert.equal(unknownReport.outstandingCents, null);
assert.throws(() => model.assertDigestSendable(unknownReport), e => e.code === 'unverified_receipts');
const misleading = fixture(); misleading.reservations[0].payment_status = 'confirmed';
assert.equal(model.buildWeeklyDigest(misleading, window, 3500, report.nights).outstandingCents, 14000, 'status never overrides real partial amount');
const paid = fixture(); paid.reservations[0].received_amount_cents = 22000;
assert.equal(model.buildWeeklyDigest(paid, window, 3500, report.nights).outstandingCents, 0, 'overpayment never creates negative debt');
const proposed = fixture(); proposed.reservations[0].financial_review_status = 'pending'; proposed.reservations[0].proposed_amount_cents = 35000;
assert.equal(model.buildWeeklyDigest(proposed, window, 3500, report.nights).outstandingCents, 14000);
const inherited = fixture(); inherited.assignments[0].assigned_nights = null;
assert.deepEqual(model.buildWeeklyDigest(inherited, window, 3500, report.nights).unplaced.map(p => p.name), ['Camille', 'Camille']);
const legacy = fixture(); legacy.assignments = []; legacy.legacy_assignments = [{ reservation_id: legacy.reservations[0].id, room_name: 'A1', friday_adults: 3, friday_children: 0, friday_babies: 0, saturday_adults: 0, saturday_children: 0, saturday_babies: 0 }];
assert.equal(model.buildWeeklyDigest(legacy, window, 3500, report.nights).placementByNight['2027-05-28'], 0);
legacy.legacy_assignments[0].friday_adults = 1;
assert.throws(() => model.buildWeeklyDigest(legacy, window, 3500, report.nights), e => e.code === 'ambiguous_legacy_assignment');
const orphan = fixture(); orphan.reservations = [];
assert.throws(() => model.buildWeeklyDigest(orphan, window, 3500, report.nights), e => e.code === 'lodging_request_without_reservation');
const stale = fixture(); stale.assignments[0].guest_name = 'Different person';
assert.throws(() => model.buildWeeklyDigest(stale, window, 3500, report.nights), e => e.code === 'stale_assignment');

const email = render.renderWeeklyDigest(report, true);
assert(email.subject.includes('18/10/2026 au 25/10/2026'));
assert(email.html.includes('https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin'));
assert(email.html.includes('Alex &amp; Morgan'));
assert(!email.html.includes('<script>unsafe</script>'));
assert(email.html.includes('&lt;script&gt;'));
assert(email.text.includes('Camille, Camille'));
assert(!email.html.includes('access_token'));
assert(email.html.indexOf('Accéder à l’espace administrateur') < email.html.indexOf('Nouvelles inscriptions'), 'admin access remains visible near the beginning of long reports');
assert.deepEqual(render.DIGEST_RECIPIENT_KEYS, ['damien', 'julie']);
const { planLodgingPlacementReconciliation } = await import(await moduleUrl('lib/lodging-placement.ts'));
const moved = planLodgingPlacementReconciliation([
  {guest_index:1,guest_name:'Alex',room_name:'A1',assigned_nights:['2027-05-28']},
  {guest_index:2,guest_name:'Camille',room_name:'A2',assigned_nights:null},
], ['Camille', 'Alex']);
assert.deepEqual(moved.upserts, [
  {fromGuestIndex:1,toGuestIndex:2,roomName:'A1',assignedNights:['2027-05-28']},
  {fromGuestIndex:2,toGuestIndex:1,roomName:'A2',assignedNights:null},
], 'reindexing guests preserves their individual night coverage');
assert(server.definiteSmtpRejection({ code: 'EAUTH' }));
assert(server.definiteSmtpRejection({ code: 'EENVELOPE' }));
assert(!server.definiteSmtpRejection({ code: 'ETIMEDOUT' }));

const originalFetch = globalThis.fetch;
const originalError = console.error;
const keys = ['WEEKLY_DIGEST_CRON_SECRET', 'WEEKLY_DIGEST_TEST_SECRET', 'WEEKLY_DIGEST_ENABLED', 'VERCEL_ENV'];
const env = Object.fromEntries(keys.map(k => [k, process.env[k]]));
let calls = 0;
try {
  globalThis.fetch = async () => { calls++; return new Response('private upstream error', {status:503}); };
  console.error = () => {};
  process.env.WEEKLY_DIGEST_CRON_SECRET = 'cron-secret-at-least-32-characters-long';
  process.env.WEEKLY_DIGEST_TEST_SECRET = 'test-secret-at-least-32-characters-long';
  assert.equal((await cron.POST(new Request('https://site.example/api/cron/weekly-digest', {method:'POST'}))).status, 401);
  assert.equal((await manual.GET(new Request('https://site.example/api/admin/weekly-digest'))).status, 401);
  assert.equal(calls, 0, 'unauthorized requests never read Supabase');
  const auth = {Authorization:'Bearer '+process.env.WEEKLY_DIGEST_CRON_SECRET};
  process.env.WEEKLY_DIGEST_ENABLED = 'false';
  assert.equal((await (await cron.POST(new Request('https://site.example/api/cron/weekly-digest', {method:'POST',headers:auth}))).json()).status, 'disabled');
  process.env.WEEKLY_DIGEST_ENABLED = 'true'; process.env.VERCEL_ENV = 'preview';
  assert.equal((await (await cron.POST(new Request('https://site.example/api/cron/weekly-digest', {method:'POST',headers:auth}))).json()).status, 'disabled');
  assert.equal(calls, 0);
  const failure = await manual.GET(new Request('https://site.example/api/admin/weekly-digest', {headers:{Authorization:'Bearer '+process.env.WEEKLY_DIGEST_TEST_SECRET}}));
  assert.equal(failure.status, 503);
  const json = JSON.stringify(await failure.json());
  assert(!json.includes('private upstream error') && !json.includes('newPeopleCount'), 'no fake zeros or private errors');
  globalThis.__weeklyDigestAdmin = true;
  assert.equal((await manual.POST(new Request('https://site.example/api/admin/weekly-digest', {method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);
} finally {
  globalThis.fetch = originalFetch; console.error = originalError; delete globalThis.__weeklyDigestAdmin;
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
}

await mkdir('.next/weekly-digest-qa', {recursive:true});
await writeFile('.next/weekly-digest-qa/preview.html', email.html, {mode:0o600});
assert.equal(await readFile('lib/email.ts','utf8'), await (await import('node:child_process')).execFileSync('git',['show','origin/main:mariage/lib/email.ts'],{encoding:'utf8'}), 'existing Gmail sender stays unchanged');
console.log('PASS Paris DST (167/169 hours), time boundaries, people/forms, partial nights/payments, unchanged source data, HTML safety, private preview, auth/flags/CSRF and Supabase error handling');
