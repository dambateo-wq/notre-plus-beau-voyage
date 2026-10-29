import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {moduleUrl,dataModule,fixture} from './weekly-digest-loader.mjs';

const db=new PGlite(), source=fixture(), originalFetch=globalThis.fetch;
let calls=0;
const config=dataModule("export function getPrivateSupabaseConfig(){return {url:'https://database.example',headers:{apikey:'fixture-key'}};}");
const attendance=await moduleUrl('lib/attendance.ts'), dietary=await moduleUrl('lib/dietary.ts');
const placement=await moduleUrl('lib/lodging-placement.ts');
const lodging=await moduleUrl('lib/lodging.ts', [['"@/lib/admin-data"',config]]);
const registration=await moduleUrl('lib/registration.ts',[
  ['"@/lib/admin-data"',config],['"@/lib/attendance"',attendance],['"@/lib/dietary"',dietary],
  ['"@/lib/lodging"',lodging],['"@/lib/lodging-placement"',placement],
]);
const editUrl=await moduleUrl('lib/admin-reservation-edit.ts',[
  ['"@/lib/admin-data"',config],['"@/lib/lodging"',lodging],['"@/lib/lodging-placement"',placement],['"@/lib/registration"',registration],
]);
const {readAdminReservation,saveAdminReservation,prepareAdminReservationEdit,adminRegistrationData}=await import(editUrl);
const auth=dataModule('export async function isAdminAuthenticated(){return Boolean(globalThis.__adminEditAuthenticated);}');
const cache=dataModule('export function revalidatePath(){}');
const route=await import(await moduleUrl('app/api/admin/reservations/[id]/route.ts',[
  ['"@/lib/admin-auth"',auth],['"@/lib/admin-reservation-edit"',editUrl],['"@/lib/registration"',registration],['"next/cache"',cache],
]));
const id=source.reservations[0].id;
const migrationNames=await readdir('supabase/migrations');
const journal=(await migrationNames.find(n=>n.endsWith('_weekly_wedding_digest.sql')));
const editing=(await migrationNames.find(n=>n.endsWith('_admin_reservation_edit.sql')));

try{
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table wedding_responses(
      id uuid primary key,respondent_name text check(respondent_name<>'ROLLBACK'),respondent_email text,companions text[],attendance_days text[],
      not_attending boolean,departure_city text,departure_country text,latitude float8,longitude float8,
      friday_sleepers int,saturday_sleepers int,roommate_wishes text,songs text[],phone text,lodging_guest_names text[],
      lodging_nights date[],lodging_payment_method text,dietary_requirements jsonb,lodging_reservation_id uuid,
      management_token_hash text,created_at timestamptz default now(),updated_at timestamptz default now()
    );
    create table lodging_reservations(
      id uuid primary key default gen_random_uuid(),reference text unique,access_token uuid default gen_random_uuid(),booker_name text,
      phone text,email text,guest_names text[],guests_count smallint check(guests_count between 1 and 20),nights date[],amount_cents int check(amount_cents>0),
      roommate_wishes text,payment_method text,payment_status text default 'unpaid',booking_status text default 'active',
      placement_status text default 'pending',wedding_response_id uuid,financial_review_status text default 'none',
      previous_amount_cents int,proposed_amount_cents int,created_at timestamptz default now(),updated_at timestamptz default now()
    );
    create table lodging_guest_assignments(id uuid primary key default gen_random_uuid(),reservation_id uuid,guest_index smallint,
      guest_name text,room_name text,updated_at timestamptz default now(),unique(reservation_id,guest_index));
    create table lodging_assignments(id uuid primary key default gen_random_uuid(),reservation_id uuid,room_name text,
      friday_adults int,friday_children int,friday_babies int,saturday_adults int,saturday_children int,saturday_babies int,updated_at timestamptz default now());
    create table lodging_change_requests(reservation_id uuid,status text);
    create function lodging_room_capacity(room text) returns int language sql as $$select case when room='A1' then 4 else 0 end$$;
    grant all on wedding_responses,lodging_reservations,lodging_guest_assignments,lodging_assignments,lodging_change_requests to service_role;
  `);
  await db.exec(await readFile('supabase/migrations/'+journal,'utf8'));
  await db.exec(await readFile('supabase/migrations/'+editing,'utf8'));
  const respondent={...source.registrations[0],respondent_email:'fixture@example.invalid',phone:'0600000000',
    departure_city:'Ville fictive',departure_country:'France',latitude:43,longitude:6,friday_sleepers:3,saturday_sleepers:3,
    songs:[],lodging_payment_method:'wero',dietary_requirements:null,management_token_hash:'SECRET-MUST-STAY-SERVER',
    updated_at:'2026-10-28T10:00:00Z'};
  const reservation={...source.reservations[0],phone:respondent.phone,email:respondent.respondent_email,
    access_token:'33333333-3333-4333-8333-333333333333',created_at:'2026-10-22T10:00:00Z',updated_at:'2026-10-28T10:00:00Z',placement_status:'in_progress'};
  await db.query('insert into wedding_responses select * from jsonb_populate_record(null::wedding_responses,$1::jsonb)',[JSON.stringify(respondent)]);
  await db.query('insert into lodging_reservations select * from jsonb_populate_record(null::lodging_reservations,$1::jsonb)',[JSON.stringify(reservation)]);
  await db.query('insert into lodging_guest_assignments(reservation_id,guest_index,guest_name,room_name,assigned_nights) values($1,1,$2,\'A1\',$3::date[])',[id,respondent.respondent_name,['2027-05-28']]);
  const originalIds=(await db.query('select id,reference,access_token,created_at from lodging_reservations')).rows;
  const originalResponse=(await db.query('select id,management_token_hash,created_at from wedding_responses')).rows;
  await db.exec('set role anon;');
  await assert.rejects(db.query('select admin_reservation_snapshot($1)',[id]),e=>e.code==='42501');
  await assert.rejects(db.query('select * from lodging_admin_edit_history'),e=>e.code==='42501');
  await db.exec('reset role;set role service_role;');
  globalThis.fetch=async(input,init)=>{
    calls++;
    assert.equal(new URL(input).origin,'https://database.example');
    assert.equal(init.cache,'no-store');
    const body=JSON.parse(init.body),name=new URL(input).pathname.split('/').at(-1);
    try{
      if(name==='admin_reservation_snapshot') return Response.json((await db.query('select admin_reservation_snapshot($1) as data',[body.p_id])).rows[0].data);
      assert.equal(name,'admin_update_reservation');
      const {p_id,p_expected_reservation_updated_at,p_expected_response_updated_at,p_expected_assignments,p_expected_legacy,p_reservation,p_response,p_assignments,p_placement_changed}=body;
      const result=await db.query('select admin_update_reservation($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9) as data',[
        p_id,p_expected_reservation_updated_at,p_expected_response_updated_at,JSON.stringify(p_expected_assignments),JSON.stringify(p_expected_legacy),
        JSON.stringify(p_reservation),p_response===null?null:JSON.stringify(p_response),JSON.stringify(p_assignments),p_placement_changed,
      ]);
      return Response.json(result.rows[0].data);
    }catch(error){return Response.json({message:error.message},{status:400});}
  };
  const current=()=>readAdminReservation(id);
  const form=s=>({...adminRegistrationData(s).registration,expectedReservationUpdatedAt:s.reservation.updated_at,expectedRegistrationUpdatedAt:s.registration.updated_at});
  const fingerprint=async()=>JSON.stringify((await db.query(`select jsonb_build_object(
    'r',(select jsonb_agg(to_jsonb(r) order by id) from lodging_reservations r),
    'w',(select jsonb_agg(to_jsonb(w) order by id) from wedding_responses w),
    'a',(select jsonb_agg(to_jsonb(a) order by id) from lodging_guest_assignments a),
    'h',(select jsonb_agg(to_jsonb(h) order by id) from lodging_admin_edit_history h)) as data`)).rows);
  let s=await current();
  const assignmentId=s.assignments[0].id;
  assert(!JSON.stringify(s).includes('SECRET-MUST-STAY-SERVER')&&!JSON.stringify(s).includes('access_token'));
  let body=form(s);body.roommateWishes='Souhait corrigé';body.received_amount_cents=999999;
  await saveAdminReservation(id,body);
  s=await current();
  assert.equal(s.reservation.received_amount_cents,7000,'editing a reservation never overwrites receipts');
  assert.equal(s.registration.roommate_wishes,'Souhait corrigé');
  assert.equal(s.assignments[0].id,assignmentId,'contact-only edits preserve placement identity');
  const afterSave=await fingerprint();
  await assert.rejects(saveAdminReservation(id,body),e=>e.code==='EDIT_CONFLICT'&&e.status===409);
  assert.equal(await fingerprint(),afterSave,'stale forms make no changes');

  body=form(s);body.companions.push('Robin');body.lodgingGuestNames.push('Robin');
  await saveAdminReservation(id,body);s=await current();
  assert.equal(s.reservation.amount_cents,28000);assert.equal(s.reservation.received_amount_cents,7000);
  assert.equal(s.registration.companions.length,3);assert.deepEqual(s.registration.lodging_guest_names,s.reservation.guest_names);
  assert.deepEqual(s.assignments[0].assigned_nights,['2027-05-28']);
  assert.deepEqual((await db.query('select id,reference,access_token,created_at from lodging_reservations')).rows,originalIds);
  assert.deepEqual((await db.query('select id,management_token_hash,created_at from wedding_responses')).rows,originalResponse);

  const beforeRollback=await fingerprint();body=form(s);body.respondentName='ROLLBACK';body.lodgingGuestNames[0]='ROLLBACK';
  await assert.rejects(saveAdminReservation(id,body),e=>e.status===503);
  assert.equal(await fingerprint(),beforeRollback,'registration, reservation, placements and history roll back together');

  await db.query("update lodging_reservations set nights=array[date '2027-05-28'], amount_cents=14000 where id=$1",[id]);
  await db.query("update lodging_guest_assignments set assigned_nights=null where reservation_id=$1",[id]);
  s=await current();body=form(s);body.lodgingNights=['2027-05-28','2027-05-29'];
  const planned=prepareAdminReservationEdit(s,body);
  assert.deepEqual(planned.assignments[0].assigned_nights,['2027-05-28'],'adding a night never invents an existing bed assignment');
  await saveAdminReservation(id,body);s=await current();
  assert.deepEqual(s.assignments[0].assigned_nights,['2027-05-28']);

  await db.query("update lodging_reservations set financial_review_status='pending' where id=$1",[id]);
  s=await current();await assert.rejects(saveAdminReservation(id,form(s)),e=>e.code==='REVIEW_PENDING');
  await db.query("update lodging_reservations set financial_review_status='none' where id=$1",[id]);

  for(let i=0;i<5;i++) await db.query("insert into lodging_reservations(reference,booker_name,guests_count,guest_names,nights,amount_cents) values($1,'Capacité fictive',20,array['Fixture'],array[date '2027-05-28',date '2027-05-29'],140000)",['capacity-'+i]);
  s=await current();body=form(s);body.companions.push('Supplément 1','Supplément 2','Supplément 3');body.lodgingGuestNames.push('Supplément 1','Supplément 2','Supplément 3');
  const beforeCapacity=await fingerprint();
  await assert.rejects(saveAdminReservation(id,body),e=>e.code==='NIGHT_FULL');
  assert.equal(await fingerprint(),beforeCapacity);
  await db.exec("delete from lodging_reservations where reference like 'capacity-%'");

  s=await current();body=form(s);body.lodgingGuestNames=[];body.lodgingNights=[];body.paymentMethod='later';body.phone='';
  await saveAdminReservation(id,body);s=await current();
  assert.equal(s.reservation.booking_status,'cancelled');assert.equal(s.reservation.received_amount_cents,7000);
  assert.deepEqual(s.assignments,[]);assert.deepEqual(s.registration.lodging_nights,[]);

  const standalone={...s,registration:null,reservation:{...s.reservation,wedding_response_id:null}};
  const simple=prepareAdminReservationEdit(standalone,{bookerName:'Responsable fictif',phone:'0600000000',email:'',guestNames:['Personne 1','Personne 2'],nights:['2027-05-28'],paymentMethod:'bank_transfer',bookingStatus:'active',roommateWishes:''});
  assert.equal(simple.values.amount_cents,7000);assert.equal(simple.responseValues,null);
  const independentId='44444444-4444-4444-8444-444444444444';
  await db.query("insert into lodging_reservations(id,reference,booker_name,phone,guest_names,guests_count,nights,amount_cents,payment_method) values($1,'INDEPENDENT','Responsable fictif','0600000000',array['Personne 1'],1,array[date '2027-05-28'],3500,'wero')",[independentId]);
  const independent=await readAdminReservation(independentId);
  assert.equal(independent.registration,null);
  await saveAdminReservation(independentId,{expectedReservationUpdatedAt:independent.reservation.updated_at,expectedRegistrationUpdatedAt:null,
    bookerName:'Responsable corrigé',phone:'0600000000',email:'',guestNames:['Personne 1','Personne 2'],nights:['2027-05-28'],paymentMethod:'bank_transfer',bookingStatus:'active',roommateWishes:'Souhait fictif'});
  const independentSaved=await readAdminReservation(independentId);
  assert.equal(independentSaved.reservation.amount_cents,7000);assert.equal(independentSaved.reservation.received_amount_cents,0);
  assert.equal((await db.query('select count(*)::int as n from wedding_responses')).rows[0].n,1,'an independent booking never creates a wedding registration');

  const ctx={params:Promise.resolve({id})};const beforeAccess=calls;
  assert.equal((await route.PATCH(new Request('https://wedding.example/api/admin/reservations/'+id,{method:'PATCH'}),ctx)).status,401);
  globalThis.__adminEditAuthenticated=true;
  assert.equal((await route.PATCH(new Request('https://wedding.example/api/admin/reservations/'+id,{method:'PATCH',headers:{Origin:'https://evil.example'}}),ctx)).status,403);
  assert.equal(calls,beforeAccess,'unauthorized and cross-site writes never reach Supabase');
  console.log('PASS admin-only edits: coherent snapshot without tokens, real validation, atomic rollback, stale-form conflicts, preserved receipts/creation dates, companions, partial night coverage, capacity, cancellation and CSRF; no SMTP used');
}finally{globalThis.fetch=originalFetch;delete globalThis.__adminEditAuthenticated;await db.close();}
