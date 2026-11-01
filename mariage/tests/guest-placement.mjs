import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { moduleUrl, dataModule } from './weekly-digest-loader.mjs';

const db = new PGlite();
const originalFetch = globalThis.fetch;
let calls = 0, authenticated = true, transportFailure = false;
const migrations = await readdir('supabase/migrations');
const migration = await readFile('supabase/migrations/' + migrations.find(n => n.endsWith('_guest_placement_without_payment.sql')), 'utf8');
const originalSql = await readFile('supabase/lodging_guest_assignments_migration.sql', 'utf8');
const config = dataModule("export function getPrivateSupabaseConfig(){return {url:'https://fixture.invalid',headers:{apikey:'fixture-only-key'}};}");
const rooms = await moduleUrl('lib/lodging-rooms.ts');
const writer = await moduleUrl('lib/admin-lodging-placement.ts', [['"@/lib/admin-data"', config], ['"@/lib/lodging-rooms"', rooms]]);
const { placementCoversNights } = await import(await moduleUrl('lib/lodging-placement.ts'));
const auth = dataModule('export async function isAdminAuthenticated(){return globalThis.__placementAuthenticated();} export function createAdminSession(){} export function deleteAdminSession(){} export function isValidAdminPassword(){}');
const unused = dataModule(['deleteCarpoolOffer','deleteWeddingResponse','getWeddingResponses','assertWeddingEmailHistoryAvailable','deliverGuestMessage',
  'deliverPaymentReminder','getAttendingEmailRecipients','isPaymentReminderReservation','mapWithConcurrency','recordWeddingEmailDelivery',
  'deleteLodgingReservation','getLodgingAssignments','getLodgingReservations','saveLodgingAssignment','updateLodgingReservation','reviewLodgingChange',
  'revalidatePath','headers','redirect'].map(name=>`export function ${name}(){throw new Error('Unexpected unrelated call: ${name}');}`).join('\n'));
const actions = await import(await moduleUrl('app/admin/actions.ts', [
  ['"@/lib/admin-auth"',auth], ['"@/lib/admin-data"',unused], ['"@/lib/admin-email"',unused], ['"@/lib/lodging"',unused],
  ['"@/lib/lodging-rooms"',rooms], ['"@/lib/admin-lodging-placement"',writer], ['"@/lib/registration"',unused],
  ['"next/cache"',unused], ['"next/headers"',unused], ['"next/navigation"',unused],
]));
globalThis.__placementAuthenticated = () => authenticated;
const ids = Array.from({length:9},(_,i)=>`${i+1}1111111-1111-4111-8111-111111111111`);
const nights = ['2027-05-28','2027-05-29'];
const names = ['Alex fictif','Camille fictive','Robin fictif'];
const form = (id,index,room) => { const f=new FormData();f.set('reservationId',id);if(index!==undefined)f.set('guestIndex',String(index));if(room)f.set('roomName',room);return f; };
const move = (id,index,room) => actions.saveGuestLodgingPlacement(form(id,index,room));
const remove = (id,index) => actions.removeGuestLodgingPlacement(form(id,index));
const finalize = id => actions.finalizeLodgingPlacement(form(id));
const reopen = id => actions.reopenLodgingPlacement(form(id));
const snapshot = async () => JSON.stringify((await db.query(`select jsonb_build_object(
  'reservations',(select jsonb_agg(to_jsonb(r) order by id) from lodging_reservations r),
  'assignments',(select jsonb_agg(to_jsonb(a) order by id) from lodging_guest_assignments a)) as data`)).rows);
const finances = async () => (await db.query('select id,amount_cents,received_amount_cents,payment_status,payment_method,booking_status,financial_review_status from lodging_reservations order by id')).rows;
const assignment = async (id,index) => (await db.query('select * from lodging_guest_assignments where reservation_id=$1 and guest_index=$2',[id,index])).rows[0];
const newReservation = async (id,guests=names,requestedNights=nights,extra={}) => {
  const r={id,reference:'FIXTURE-'+id,booker_name:guests[0],guest_names:guests,guests_count:guests.length,nights:requestedNights,
    amount_cents:guests.length*requestedNights.length*3500,received_amount_cents:0,payment_status:'unpaid',payment_method:'bank_transfer',
    booking_status:'active',financial_review_status:'none',placement_status:'pending',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',...extra};
  await db.query('insert into lodging_reservations select * from jsonb_populate_record(null::lodging_reservations,$1::jsonb)',[JSON.stringify(r)]);
};

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to service_role,anon,authenticated;
    create table lodging_reservations(id uuid primary key,reference text,booker_name text,guest_names text[],guests_count smallint,nights date[],
      amount_cents int,received_amount_cents int,payment_status text,payment_method text,booking_status text,financial_review_status text,
      placement_status text,created_at timestamptz,updated_at timestamptz,
      check(reference<>'ROLLBACK' or placement_status<>'in_progress'));
    create table lodging_assignments(reservation_id uuid,room_name text);
    create table lodging_change_requests(reservation_id uuid,status text);
    grant all on lodging_reservations,lodging_assignments,lodging_change_requests to service_role;`);
  await db.exec(originalSql);
  await db.exec('alter table lodging_guest_assignments add column assigned_nights date[]; grant select,insert,update,delete on lodging_guest_assignments to service_role;');
  await newReservation(ids[0],names,nights,{received_amount_cents:7000});
  await newReservation(ids[1],['Autre 1','Autre 2']);
  await newReservation(ids[2],['Déclaré'],[nights[1]],{payment_status:'declared'});
  await newReservation(ids[3],['Annulé'],nights,{booking_status:'cancelled',payment_status:'confirmed',received_amount_cents:7000});
  await newReservation(ids[4],['En attente'],nights,{financial_review_status:'pending'});
  await newReservation(ids[5],['Demande à traiter']);
  await db.query("insert into lodging_change_requests values($1,'pending')",[ids[5]]);
  await db.query("insert into lodging_guest_assignments(reservation_id,guest_index,guest_name,room_name) values($1,1,$2,'B1')",[ids[0],names[0]]);
  const preexistingAssignmentId=(await assignment(ids[0],1)).id;
  const beforeMigration=await snapshot();
  await assert.rejects(db.query('select place_lodging_guest($1,1::smallint,\'A1\')',[ids[0]]),/RESERVATION_NOT_PLACEABLE/);
  // Refuse de remplacer une fonction qui aurait évolué depuis l'audit.
  await db.exec(originalSql.replace("reservation.payment_status <> 'confirmed'", "reservation.payment_status <> 'declared'"));
  await assert.rejects(db.exec(migration),/PLACEMENT_SCHEMA_CHANGED_REVIEW_REQUIRED/);await db.exec('rollback');
  await db.exec(originalSql);
  await db.exec(migration);
  assert.equal(await snapshot(),beforeMigration,'installing the migration never rewrites existing data');
  assert.equal((await assignment(ids[0],1)).id,preexistingAssignmentId,'an existing bed is preserved by installation');
  const privileges=(await db.query("select bool_and(not prosecdef) as invoker from pg_proc where oid in ('public.place_lodging_guest(uuid,smallint,text)'::regprocedure,'public.admin_lodging_placement(text,uuid,smallint,text)'::regprocedure)")).rows[0];
  assert(privileges.invoker);
  await db.exec('set role anon');
  await assert.rejects(db.query("select admin_lodging_placement('place',$1,1::smallint,'A1')",[ids[0]]),e=>e.code==='42501');
  await assert.rejects(db.query('select place_lodging_guest($1,1::smallint,\'A1\')',[ids[0]]),e=>e.code==='42501');
  await db.exec('reset role;set role service_role');
  globalThis.fetch = async (url,init) => {
    calls++;assert.equal(url,'https://fixture.invalid/rest/v1/rpc/admin_lodging_placement');
    assert.equal(init.cache,'no-store');assert.equal(init.headers.apikey,'fixture-only-key');assert(init.signal);
    if(transportFailure)throw new TypeError('Private transport details must not leave server');
    const p=JSON.parse(init.body);
    try {
      const result=await db.query('select admin_lodging_placement($1,$2,$3,$4) as data',[p.p_operation,p.p_reservation_id,p.p_guest_index,p.p_room_name]);
      return Response.json(result.rows[0].data);
    } catch(error) { return Response.json({code:error.code,message:error.message},{status:400}); }
  };
  authenticated=false;assert.equal((await move(ids[0],1,'A1')).ok,false);assert.equal(calls,0);authenticated=true;
  assert.equal((await move('bad-id',1,'A1')).ok,false);assert.equal((await remove(ids[0],0)).ok,false);assert.equal(calls,0);
  const originalFinances=await finances();
  assert((await move(ids[0],1,'A1')).ok,'unpaid partial receipt may be placed');
  assert((await move(ids[0],2,'A1')).ok);assert((await move(ids[0],3,'A3')).ok,'one group may use several rooms');
  assert((await move(ids[2],1,'A4')).ok,'declared payment also may be placed');
  assert((await finalize(ids[0])).ok);assert((await reopen(ids[0])).ok);
  assert((await move(ids[1],1,'A2')).ok);assert((await move(ids[1],2,'A2')).ok);
  const old=await assignment(ids[0],2), beforeFull=await snapshot();
  const full=await move(ids[0],2,'A2');assert.equal(full.ok,false);assert.match(full.error,/complète/);
  assert.equal(await snapshot(),beforeFull,'failed move preserves old room and reservation status');
  assert((await remove(ids[1],2)).ok);assert((await move(ids[0],2,'A2')).ok);
  assert.equal((await assignment(ids[0],2)).id,old.id,'moving a guest preserves assignment identity');
  assert((await remove(ids[0],3)).ok);
  const incomplete=await snapshot();assert.equal((await finalize(ids[0])).ok,false);assert.equal(await snapshot(),incomplete);
  assert((await move(ids[0],3,'A3')).ok);
  await db.query('update lodging_guest_assignments set assigned_nights=$2::date[] where reservation_id=$1 and guest_index=3',[ids[0],[nights[0]]]);
  const partial=await assignment(ids[0],3);
  assert(!placementCoversNights(partial,nights));assert(placementCoversNights({...partial,assigned_nights:null},nights));
  assert.equal((await finalize(ids[0])).ok,false,'a Friday-only bed cannot finalize a two-night booking');
  assert((await move(ids[0],3,'A3')).ok);assert((await finalize(ids[0])).ok);
  for(const id of [ids[3],ids[4],ids[5]]) {
    const before=await snapshot();
    for(const operation of [()=>move(id,1,'B1'),()=>remove(id,1),()=>finalize(id),()=>reopen(id)]) assert.equal((await operation()).ok,false);
    assert.equal(await snapshot(),before,'cancelled and pending financial review remain protected for every admin action');
  }
  const invalidGuest=await move(ids[0],4,'B1');assert.equal(invalidGuest.ok,false);assert.match(invalidGuest.error,/voyageur/);
  await assert.rejects(db.query("select admin_lodging_placement('place',$1,1::smallint,'PALMIER')",[ids[0]]),/INVALID_ROOM/);
  // Prise en compte des lits réellement attribués, nuit par nuit.
  await db.query('update lodging_guest_assignments set assigned_nights=$2::date[] where reservation_id=$1',[ids[1],[nights[0]]]);
  await newReservation(ids[6],['Samedi uniquement'],[nights[1]]);
  assert((await move(ids[6],1,'A2')).ok,'a Friday-only assignment does not consume a Saturday bed');
  await newReservation(ids[7],['Vendredi uniquement'],[nights[0]]);
  assert.equal((await move(ids[7],1,'A2')).ok,false,'Friday capacity is still enforced');
  assert.deepEqual((await finances()).filter(r=>!ids.slice(6).includes(r.id)),originalFinances);
  // Deux demandes simultanées de la dernière place : PGlite les sérialise sur
  // son unique connexion. Le test vérifie le résultat, pas une charge multi-session.
  const competing=['a1111111-1111-4111-8111-111111111111','b1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111'];
  for(const candidate of competing)await newReservation(candidate,['Candidat fictif'],[nights[1]]);
  assert((await move(competing[0],1,'A6')).ok);
  const competingFinances=await finances();
  const results=await Promise.all(competing.slice(1).map(candidate=>move(candidate,1,'A6')));
  assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.filter(result=>!result.ok).length,1);
  assert.equal((await db.query("select count(*)::int as n from lodging_guest_assignments where room_name='A6'")).rows[0].n,2);
  assert.deepEqual(await finances(),competingFinances);
  // Une erreur après l'upsert doit annuler aussi cette attribution.
  await newReservation(ids[8],['Rollback'],nights,{reference:'ROLLBACK'});
  const rollbackState=await snapshot();assert.equal((await move(ids[8],1,'B1')).ok,false);assert.equal(await snapshot(),rollbackState);
  transportFailure=true;const unknown=await move(ids[0],1,'A1');
  assert.equal(unknown.ok,false);assert(unknown.refreshRequired);assert(!unknown.error.includes('Private transport'));
  assert.equal(await snapshot(),rollbackState);
  console.log('PASS placement: reproduced original unpaid rejection; guarded data-free migration, all nine requested scenarios, price/receipts/payment states unchanged, atomic rollback, partial nights, cancelled/review-pending protections, private grants, safe Server Action results and no failure revalidation');
} finally { globalThis.fetch=originalFetch;delete globalThis.__placementAuthenticated;await db.close(); }
