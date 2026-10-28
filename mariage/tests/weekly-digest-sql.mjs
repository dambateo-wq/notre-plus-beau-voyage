import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { fixture, dataModule, loadDigestModules } from './weekly-digest-loader.mjs';

const db = new PGlite();
const migration = (await readdir('supabase/migrations')).find(name => name.endsWith('_weekly_wedding_digest.sql'));
const source = fixture();
const savedRecipients=[process.env.WEEKLY_DIGEST_DAMIEN_EMAIL,process.env.WEEKLY_DIGEST_JULIE_EMAIL];
process.env.WEEKLY_DIGEST_DAMIEN_EMAIL='damien@example.invalid';process.env.WEEKLY_DIGEST_JULIE_EMAIL='julie@example.invalid';
const window = { start:'2026-10-18T16:00:00.000Z', end:'2026-10-25T17:00:00.000Z' };
const originalFetch = globalThis.fetch;
const originalInfo = console.info, originalError = console.error;
const accepted = [], attempts = [], logs = [];
let secondReject = false, ambiguousSmtp = false, snapshotFailure = false, finishFailure = false;

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create table public.wedding_responses (
      id uuid primary key, respondent_name text, companions text[], attendance_days text[], not_attending boolean,
      created_at timestamptz, lodging_guest_names text[], lodging_nights date[], roommate_wishes text,
      lodging_reservation_id uuid, respondent_email text, management_token_hash text
    );
    create table public.lodging_reservations (
      id uuid primary key, reference text, booker_name text, guest_names text[], guests_count integer,
      nights date[], amount_cents integer, payment_method text, payment_status text, booking_status text,
      roommate_wishes text, wedding_response_id uuid, financial_review_status text, proposed_amount_cents integer,
      email text, phone text, access_token uuid
    );
    create table public.lodging_guest_assignments (
      id uuid default gen_random_uuid(), reservation_id uuid, guest_index integer, guest_name text, room_name text
    );
    create table public.lodging_assignments (
      reservation_id uuid, room_name text, friday_adults integer, friday_children integer, friday_babies integer,
      saturday_adults integer, saturday_children integer, saturday_babies integer
    );
    grant select on public.wedding_responses, public.lodging_reservations, public.lodging_guest_assignments, public.lodging_assignments to service_role;
  `);
  await db.query('insert into public.wedding_responses select * from jsonb_populate_record(null::public.wedding_responses,$1::jsonb)', [JSON.stringify({...source.registrations[0],respondent_email:'private@example.invalid',management_token_hash:'private-token'})]);
  await db.query('insert into public.lodging_reservations select * from jsonb_populate_record(null::public.lodging_reservations,$1::jsonb)', [JSON.stringify(source.reservations[0])]);
  const before = (await db.query('select id, amount_cents, payment_status, booking_status from public.lodging_reservations')).rows;
  await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  assert.deepEqual((await db.query('select id, amount_cents, payment_status, booking_status from public.lodging_reservations')).rows, before);
  assert.equal((await db.query('select received_amount_cents from public.lodging_reservations')).rows[0].received_amount_cents,null,'historical money is unknown, never backfilled from status');
  await db.query('update public.lodging_reservations set received_amount_cents=$1 where id=$2',[7000,source.reservations[0].id]);
  const fingerprint = JSON.stringify((await db.query('select to_jsonb(r) as data from public.lodging_reservations r')).rows);
  await db.exec('set role service_role;');
  const snapshot = (await db.query('select public.weekly_digest_snapshot() as data')).rows[0].data;
  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes('private@example.invalid') && !serialized.includes('private-token') && !serialized.includes('access_token'));
  assert.equal(snapshot.reservations[0].received_amount_cents,7000);
  await db.exec('reset role; set role anon;');
  await assert.rejects(db.query('select public.weekly_digest_snapshot()'), e=>e.code==='42501');
  await assert.rejects(db.query('select * from public.wedding_digest_runs'), e=>e.code==='42501');
  await db.exec('reset role; set role service_role;');

  globalThis.__weeklyDigestSend = async message => {
    attempts.push(message);
    if(secondReject && message.to==='julie@example.invalid') {secondReject=false;throw Object.assign(new Error('fixture only'),{code:'EAUTH'});}
    accepted.push(message);
    if(ambiguousSmtp){ambiguousSmtp=false;throw Object.assign(new Error('ack lost'),{code:'ETIMEDOUT'});}
    return {sent:true};
  };
  const emailMock = dataModule('export function isEmailConfigured(){return true;} export async function sendWeddingEmail(message){return globalThis.__weeklyDigestSend(message);}');
  const { server, model } = await loadDigestModules(emailMock);
  const real = model.buildWeeklyDigest(snapshot, window, 3500, ['2027-05-28','2027-05-29']);
  assert.equal(real.outstandingCents,14000);
  globalThis.fetch = async (input, init) => {
    const name = new URL(input).pathname.split('/').at(-1);
    assert.equal(new URL(input).origin,'https://database.example');
    assert.equal(init.headers.apikey,'test-service-key');
    assert.equal(init.cache,'no-store');
    if(name==='weekly_digest_snapshot') {
      if(snapshotFailure) return new Response('private database failure',{status:503});
      return Response.json((await db.query('select public.weekly_digest_snapshot() as data')).rows[0].data);
    }
    assert.equal(name,'weekly_digest_journal','the reporting job only calls snapshot and journal functions');
    const b=JSON.parse(init.body);
    if(finishFailure && b.p_action==='finish_delivery'){finishFailure=false;throw new Error('journal network failure');}
    const rows=await db.query('select public.weekly_digest_journal($1,$2,$3::uuid,$4::jsonb) as data',[b.p_action,b.p_key,b.p_token,JSON.stringify(b.p_data)]);
    return Response.json(rows.rows[0].data);
  };
  console.info=console.error=message=>logs.push(String(message));
  const parallel=await Promise.all([server.runWeeklyDigest(window,'test','parallel-test-001'),server.runWeeklyDigest(window,'test','parallel-test-001')]);
  assert.equal(accepted.length,2);
  assert(parallel.some(r=>r.status==='sent'));
  assert(parallel.some(r=>r.status==='busy'));
  assert.equal(accepted[0].text,accepted[1].text);
  assert.equal((await server.runWeeklyDigest(window,'test','parallel-test-001')).status,'sent');
  assert.equal(accepted.length,2,'same run never resends');

  secondReject=true;
  await assert.rejects(server.runWeeklyDigest(window,'test','retry-known-failure'), e=>e.code==='smtp_rejected_before_delivery');
  const firstHalf=accepted.at(-1);
  assert.equal(firstHalf.to,'damien@example.invalid');
  const countBeforeRetry=accepted.length;
  const retry=await server.runWeeklyDigest(window,'test','retry-known-failure');
  assert.equal(retry.status,'sent');
  assert.equal(accepted.length,countBeforeRetry+1,'only the pending second recipient retries');
  assert.equal(accepted.at(-1).to,'julie@example.invalid');
  assert.equal(accepted.at(-1).html,firstHalf.html);

  snapshotFailure=true;
  const countBeforeFailure=accepted.length;
  await assert.rejects(server.runWeeklyDigest(window,'test','retry-database-failure'));
  assert.equal(accepted.length,countBeforeFailure,'Supabase failure sends no zero-filled digest');
  snapshotFailure=false;
  assert.equal((await server.runWeeklyDigest(window,'test','retry-database-failure')).status,'sent');

  ambiguousSmtp=true;
  const ambiguous=await server.runWeeklyDigest(window,'test','ambiguous-smtp-test');
  assert.equal(ambiguous.status,'uncertain');
  const afterAmbiguous=accepted.length;
  assert.equal((await server.runWeeklyDigest(window,'test','ambiguous-smtp-test')).status,'uncertain');
  assert.equal(accepted.length,afterAmbiguous,'an ambiguous Gmail outcome is never blindly resent');

  finishFailure=true;
  await assert.rejects(server.runWeeklyDigest(window,'test','journal-after-smtp-failure'));
  const afterJournalFailure=accepted.length;
  assert.equal((await server.runWeeklyDigest(window,'test','journal-after-smtp-failure')).status,'uncertain');
  assert.equal(accepted.length,afterJournalFailure);

  // Simulate a process killed after starting SMTP, before any final journal write.
  const data=JSON.stringify({...window,mode:'test'});
  const journal=(action,key,token=null,details={})=>db.query('select public.weekly_digest_journal($1,$2,$3::uuid,$4::jsonb) as data',[action,key,token,JSON.stringify(details)]).then(r=>r.rows[0].data);
  const claim=await journal('claim','test:crashed-process',null,JSON.parse(data));
  await journal('prepare','test:crashed-process',claim.run.lease_token,{subject:'test',html:'test',text:'test'});
  await journal('begin_delivery','test:crashed-process',claim.run.lease_token,{recipient:'damien'});
  await db.query("update public.wedding_digest_runs set lease_until=now()-interval '1 minute' where key='test:crashed-process'");
  assert.equal((await journal('claim','test:crashed-process',null,JSON.parse(data))).reason,'uncertain');
  assert.equal(JSON.stringify((await db.query('select to_jsonb(r) as data from public.lodging_reservations r')).rows),fingerprint,'reporting never writes reservations/payments');
  assert(logs.every(log=>!log.includes('private@example.invalid')&&!log.includes('test-service-key')&&!log.includes('Alex & Morgan')&&!log.includes('private database failure')));
  console.info=originalInfo; console.error=originalError;
  console.log('PASS isolated PostgreSQL migration, no historical backfill, private grants, coherent snapshot, concurrent claims, per-recipient retry, stable content, no fake zeros and conservative SMTP uncertainty recovery');
} finally {
  globalThis.fetch=originalFetch;console.info=originalInfo;console.error=originalError;delete globalThis.__weeklyDigestSend;
  for(const [index,key] of ['WEEKLY_DIGEST_DAMIEN_EMAIL','WEEKLY_DIGEST_JULIE_EMAIL'].entries()) {
    if(savedRecipients[index]===undefined) delete process.env[key];
    else process.env[key]=savedRecipients[index];
  }
  await db.close();
}
