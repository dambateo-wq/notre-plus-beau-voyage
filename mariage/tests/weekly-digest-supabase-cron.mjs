import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';

// Real scheduler SQL, isolated PostgreSQL. Only the external HTTP/cron extensions
// and wall clock are replaced; no production database or SMTP connection is used.
const db = new PGlite();
const file = (await readdir('supabase/migrations')).find(n => n.endsWith('_weekly_digest_supabase_cron.sql'));
const source = await readFile(`supabase/migrations/${file}`, 'utf8');
const fakeSecret = 'isolated-fixture-secret-'.padEnd(64, 'x');
const origin = 'https://les-dadjus-notre-plus-beau-voyage.vercel.app';
const cases = [
  ['2026-11-08T16:00:00Z', null],
  ['2026-11-08T17:00:00Z', '2026-11-08T17:00:00.000Z'],
  ['2026-11-08T17:10:59Z', '2026-11-08T17:00:00.000Z'],
  ['2026-11-08T17:11:00Z', null],
  ['2026-11-09T17:00:00Z', null],
  ['2027-03-21T17:00:00Z', '2027-03-21T17:00:00.000Z'],
  ['2027-03-28T16:00:00Z', '2027-03-28T16:00:00.000Z'],
  ['2027-03-28T17:00:00Z', null],
  ['2027-10-24T16:00:00Z', '2027-10-24T16:00:00.000Z'],
  ['2027-10-31T17:00:00Z', '2027-10-31T17:00:00.000Z'],
  ['2027-10-31T16:00:00Z', null],
];

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    set cron.timezone = 'GMT';
    create schema cron; create schema net; create schema vault;
    create table cron.job(jobid bigint generated always as identity primary key, jobname text unique,
      schedule text, command text, active boolean default true);
    create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
      language sql as $$ insert into cron.job(jobname,schedule,command)
        values(p_name,p_schedule,p_command) returning jobid $$;
    create function cron.alter_job(job_id bigint, active boolean default null) returns void
      language sql as $$ update cron.job set active=alter_job.active where jobid=job_id $$;
    create table net.requests(id bigint generated always as identity primary key, url text,
      body jsonb, headers jsonb, timeout_milliseconds integer);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds integer default 1000) returns bigint
      language sql as $$ insert into net.requests(url,body,headers,timeout_milliseconds)
        values(http_post.url,http_post.body,http_post.headers,http_post.timeout_milliseconds) returning id $$;
    create table net._http_response(id bigint, status_code integer, timed_out boolean, error_msg text, content text);
    create table vault.decrypted_secrets(name text primary key, decrypted_secret text);
    create table public.wedding_digest_runs(period_end timestamptz primary key, mode text, status text, lease_until timestamptz);
    create table public.wedding_responses(id integer primary key, data jsonb);
    create table public.lodging_reservations(id integer primary key, amount_cents integer, received_amount_cents integer, payment_status text);
    create table public.lodging_guest_assignments(id integer primary key, guest_index integer, room_name text);
    insert into public.wedding_responses values(1,'{"fixture":"existing registration"}');
    insert into public.lodging_reservations values(1,14000,3500,'unpaid');
    insert into public.lodging_guest_assignments values(1,1,'A1');
  `);
  const fingerprint = async () => JSON.stringify((await db.query(`select
    (select jsonb_agg(to_jsonb(r)) from public.wedding_responses r) as registrations,
    (select jsonb_agg(to_jsonb(r)) from public.lodging_reservations r) as reservations,
    (select jsonb_agg(to_jsonb(r)) from public.lodging_guest_assignments r) as beds`)).rows);
  const before = await fingerprint();
  const isolated = source
    .replace(/^create extension if not exists pg_cron with schema pg_catalog;$/m, '')
    .replace(/^create extension if not exists pg_net;$/m, '')
    .replace('v_now timestamptz := pg_catalog.clock_timestamp();', 'v_now timestamptz := wedding_digest_scheduler.test_now();');
  await db.exec(isolated);
  await db.exec(`
    create table wedding_digest_scheduler.test_clock(value timestamptz);
    insert into wedding_digest_scheduler.test_clock values('2026-11-08T17:00:00Z');
    create function wedding_digest_scheduler.test_now() returns timestamptz language sql
      as $$ select value from wedding_digest_scheduler.test_clock $$;
  `);
  await db.query('insert into vault.decrypted_secrets values($1,$2)', ['wedding_weekly_digest_cron_secret', fakeSecret]);
  const job = (await db.query('select * from cron.job')).rows;
  assert.equal(job.length, 1);
  assert.equal(job[0].jobname, 'notre-plus-beau-voyage-weekly-digest');
  assert.equal(job[0].schedule, '0-12 16-17 * * 0');
  assert.equal(job[0].active, false, 'migration cannot silently activate production');
  assert(!job[0].command.includes(fakeSecret));

  for (const [now, expected] of cases) {
    const value = (await db.query('select wedding_digest_scheduler.due_period($1) as value', [now])).rows[0].value;
    assert.equal(value === null ? null : new Date(value).toISOString(), expected, now);
  }
  const clock = now => db.query('update wedding_digest_scheduler.test_clock set value=$1', [now]);
  const dispatch = () => db.query('select wedding_digest_scheduler.dispatch() as value').then(r => r.rows[0].value);
  const requests = () => db.query('select * from net.requests order by id').then(r => r.rows);
  const response = (id, status, content, timedOut = false) => db.query(
    'insert into net._http_response values($1,$2,$3,null,$4)', [id, status, timedOut, JSON.stringify(content)]);
  const reset = async () => {
    await db.exec('truncate wedding_digest_scheduler.dispatches,net.requests,net._http_response,public.wedding_digest_runs restart identity;');
    await clock('2026-11-08T17:00:00Z');
  };

  await clock('2026-11-08T16:00:00Z');
  assert.equal((await dispatch()).status, 'not_due');
  assert.equal((await requests()).length, 0);
  await clock('2026-11-08T17:00:00Z');
  assert.equal((await dispatch()).status, 'queued');
  const first = (await requests())[0];
  assert.equal(first.url, origin + '/api/cron/weekly-digest');
  assert.deepEqual(first.body, {});
  assert.equal(first.headers.Authorization, 'Bearer ' + fakeSecret);
  assert.equal(first.timeout_milliseconds, 55000);
  await clock('2026-11-08T17:00:01Z');
  assert.equal((await dispatch()).status, 'in_flight');
  await response(first.id, 503, {error:'supabase_unreachable'});
  await clock('2026-11-08T17:01:00Z');
  assert.equal((await dispatch()).attempt, 2);
  await response((await requests())[1].id, 200, {status:'sent', sent:2});
  await db.exec("insert into public.wedding_digest_runs values('2026-11-08T17:00:00Z','scheduled','sent',null);");
  await clock('2026-11-08T17:02:00Z');
  assert.equal((await dispatch()).status, 'sent');
  assert.equal((await requests()).length, 2, 'completed campaign stops further HTTP requests');
  const logs = (await db.query('select http_status,endpoint_status,error_code from wedding_digest_scheduler.dispatches order by attempt')).rows;
  assert.deepEqual(logs.map(r => r.http_status), [503, 200]);
  assert.equal(logs[1].endpoint_status, 'sent');

  await reset();
  await db.exec("insert into public.wedding_digest_runs values('2026-11-08T17:00:00Z','scheduled','uncertain',null);");
  assert.equal((await dispatch()).status, 'uncertain');
  assert.equal((await requests()).length, 0);
  await reset();
  const uncertain = await dispatch();
  await response(uncertain.requestId, 489, {error:'smtp_outcome_uncertain'});
  await clock('2026-11-08T17:01:00Z');
  assert.equal((await dispatch()).status, 'uncertain', 'HTTP 489 also prevents retries');
  assert.equal((await requests()).length, 1);

  await reset();
  await db.exec("insert into public.wedding_digest_runs values('2026-11-08T17:00:00Z','scheduled','ready','2026-11-08T17:03:10Z');");
  assert.equal((await dispatch()).status, 'busy');
  await clock('2026-11-08T17:04:00Z');
  assert.equal((await dispatch()).status, 'queued', 'retry after lease expiry is possible');

  await reset();
  for (let attempt = 1; attempt <= 4; attempt++) {
    await clock(`2026-11-08T17:0${(attempt - 1) * 2}:00Z`);
    assert.equal((await dispatch()).attempt, attempt);
  }
  await clock('2026-11-08T17:08:00Z');
  assert.equal((await dispatch()).status, 'retries_exhausted');
  assert.equal((await requests()).length, 4);
  assert.equal((await db.query("select count(*)::int as n from wedding_digest_scheduler.dispatches where error_code='http_response_missing'")).rows[0].n, 4);

  await reset();
  const disabled = await dispatch();
  await response(disabled.requestId, 200, {status:'disabled'});
  await clock('2026-11-08T17:01:00Z');
  assert.equal((await dispatch()).status, 'disabled');
  assert.equal((await requests()).length, 1);

  await reset();
  const early = await dispatch();
  await response(early.requestId, 200, {status:'not_due'});
  await clock('2026-11-08T17:01:00Z');
  assert.equal((await dispatch()).attempt, 2, 'minor clock skew cannot skip the whole week');

  await reset();
  const invalid = await dispatch();
  await db.query('insert into net._http_response values($1,200,false,null,$2)', [invalid.requestId, '<html>private-upstream-content</html>']);
  await clock('2026-11-08T17:01:00Z');
  assert.equal((await dispatch()).attempt, 2);
  const safeLog = (await db.query('select to_jsonb(d) as data from wedding_digest_scheduler.dispatches d')).rows;
  assert(!JSON.stringify(safeLog).includes('private-upstream-content'));
  assert.equal(safeLog[0].data.error_code, 'invalid_http_response');

  await reset();
  const finalAttempt = await dispatch();
  await response(finalAttempt.requestId, null, null, true);
  await clock('2026-11-08T17:12:00Z');
  assert.equal((await dispatch()).status, 'not_due');
  assert.equal((await db.query('select error_code from wedding_digest_scheduler.dispatches')).rows[0].error_code, 'http_timeout', 'outcome reconciliation still runs after the dispatch window');
  assert.equal((await requests()).length, 1);

  await reset();
  await db.exec("delete from vault.decrypted_secrets where name='wedding_weekly_digest_cron_secret';");
  await assert.rejects(dispatch(), e => e.message === 'weekly_digest_cron_secret_missing');
  assert.equal((await requests()).length, 0);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`set role ${role};`);
    await assert.rejects(db.query('select wedding_digest_scheduler.dispatch()'), e => e.code === '42501');
    await assert.rejects(db.query('select * from wedding_digest_scheduler.dispatches'), e => e.code === '42501');
    await db.exec('reset role;');
  }
  assert.equal(await fingerprint(), before, 'all original business data is preserved');
  const plan = JSON.parse(execFileSync(process.execPath, ['scripts/weekly-digest.mjs', 'schedule-plan'], {encoding:'utf8'}));
  assert.equal(plan.provider, 'Supabase Cron (existing wedding project)');
  assert.equal(plan.applied, false);
  assert(!source.includes(fakeSecret));
  console.log('PASS Supabase Cron SQL: Paris winter/summer/DST, inactive setup, HTTP auth, safe transport journal, bounded retries, expired leases, sent/uncertain/disabled protection, private permissions, unchanged business data');
} finally {
  await db.close();
}
