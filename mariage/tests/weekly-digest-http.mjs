import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fixture } from './weekly-digest-loader.mjs';
import { createHmac } from 'node:crypto';

let failing = false, calls = 0;
const noLodgingId='55555555-5555-4555-8555-555555555555';
const database = createServer(async (request, response) => {
  calls++;
  assert.equal(request.headers.apikey,'test-private-service-key');
  const source=fixture();
  const admin={reservation:{...source.reservations[0],updated_at:'2026-10-28T10:00:00Z'},registration:{...source.registrations[0],
    respondent_email:'fixture@example.invalid',phone:'0600000000',departure_city:'Ville fictive',departure_country:'France',latitude:43,longitude:6,
    lodging_payment_method:'wero',songs:[],dietary_requirements:null,updated_at:'2026-10-28T10:00:00Z'},assignments:source.assignments,legacy:[]};
  const noLodging={...admin.registration,id:noLodgingId,respondent_name:'Sans hébergement',lodging_reservation_id:null,
    lodging_guest_names:[],lodging_nights:[],friday_sleepers:0,saturday_sleepers:0};
  response.writeHead(failing?503:200,{'Content-Type':'application/json'});
  if(request.method==='GET'){
    const table=new URL(request.url,'http://fixture').pathname.split('/').at(-1);
    assert(['wedding_responses','carpool_offers','carpool_requests','lodging_reservations','lodging_assignments',
      'lodging_guest_assignments','lodging_change_requests','admin_notifications','wedding_email_history'].includes(table));
    response.end(JSON.stringify(table==='wedding_responses'?[noLodging,{...noLodging,id:'66666666-6666-4666-8666-666666666666',not_attending:true}]:[]));
    return;
  }
  assert.equal(request.method,'POST');
  assert(['/rest/v1/rpc/weekly_digest_snapshot','/rest/v1/rpc/admin_reservation_snapshot','/rest/v1/rpc/admin_registration_snapshot'].includes(request.url),'only read-only snapshots are called');
  let requestBody='';for await(const chunk of request) requestBody+=chunk;
  const body=JSON.parse(requestBody);
  const data=request.url.endsWith('/admin_reservation_snapshot')?admin:request.url.endsWith('/admin_registration_snapshot')
    ? {registration:body.p_id===noLodgingId?noLodging:admin.registration,reservationId:body.p_id===noLodgingId?null:source.reservations[0].id}:source;
  response.end(failing?'private fixture error':JSON.stringify(data));
});
await new Promise(resolve=>database.listen(0,'127.0.0.1',resolve));
const testSecret='test-secret-with-at-least-32-characters';
const cronSecret='cron-secret-with-at-least-32-characters';
const processEnv={...process.env,SUPABASE_URL:`http://127.0.0.1:${database.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'test-private-service-key',
  ADMIN_PASSWORD:'local-test-password-not-production',WEEKLY_DIGEST_TEST_SECRET:testSecret,WEEKLY_DIGEST_CRON_SECRET:cronSecret,
  WEEKLY_DIGEST_ENABLED:'false',WEEKLY_DIGEST_TEST_ENABLED:'false',VERCEL_ENV:'preview'};
delete processEnv.SMTP_USER; delete processEnv.SMTP_PASS;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3458'],{env:processEnv,stdio:['ignore','pipe','pipe']});
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Next startup timeout')),15000);
    server.stdout.on('data',data=>{if(String(data).includes('Ready')){clearTimeout(timer);resolve();}});
    server.stderr.resume();
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Next exited ${code}`));});
  });
  const origin='http://127.0.0.1:3458';
  const auth={Authorization:`Bearer ${testSecret}`};
  assert.equal((await fetch(origin+'/api/admin/weekly-digest')).status,401);
  assert.equal((await fetch(origin+'/api/cron/weekly-digest',{method:'POST'})).status,401);
  assert.equal(calls,0);
  const preview=await fetch(origin+'/api/admin/weekly-digest',{headers:auth});
  assert.equal(preview.status,200);
  assert.match(preview.headers.get('cache-control'),/no-store/);
  const data=await preview.json();
  assert.equal(data.digest.newPeopleCount,3);assert.equal(data.digest.outstandingCents,14000);
  assert(!JSON.stringify(data).includes('test-private-service-key'));
  const html=await fetch(origin+'/api/admin/weekly-digest?format=html',{headers:auth});
  assert.match(html.headers.get('content-type'),/text\/html/);
  assert.match(html.headers.get('content-security-policy'),/default-src 'none'/);
  assert((await html.text()).includes('https://les-dadjus-notre-plus-beau-voyage.vercel.app/admin'));
  assert.equal((await fetch(origin+'/api/admin/weekly-digest',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:'{"testKey":"not-sent-001"}'})).status,409);
  assert.equal((await (await fetch(origin+'/api/cron/weekly-digest',{method:'POST',headers:{Authorization:`Bearer ${cronSecret}`}})).json()).status,'disabled');
  assert.equal((await fetch(origin+'/api/cron/weekly-digest')).status,405);
  assert.equal(calls,2);
  const id=fixture().reservations[0].id;
  const session=createHmac('sha256',processEnv.ADMIN_PASSWORD).update('notre-plus-beau-voyage-admin').digest('hex');
  const cookie={Cookie:'wedding_admin_session='+session};
  assert.equal((await fetch(origin+'/api/admin/reservations/'+id,{method:'PATCH'})).status,401);
  assert.equal((await fetch(origin+'/api/admin/reservations/'+id,{method:'PATCH',headers:{...cookie,Origin:'https://evil.example'}})).status,403);
  const protectedPage=await fetch(origin+'/admin/reservations/'+id,{redirect:'manual'});
  assert.equal(protectedPage.headers.get('location'),'/admin');
  assert.equal(calls,2);
  const editor=await fetch(origin+'/admin/reservations/'+id,{headers:cookie});
  assert.equal(editor.status,200);
  const editorHtml=await editor.text();
  assert(editorHtml.includes('Modifier la réservation')&&editorHtml.includes('Enregistrer les modifications sans envoyer'));
  assert(!editorHtml.includes('management_token_hash')&&!editorHtml.includes('access_token')&&!editorHtml.includes('test-private-service-key'));
  assert.equal(calls,3);
  assert.equal((await fetch(origin+'/api/admin/inscriptions/'+noLodgingId,{method:'PATCH'})).status,401);
  assert.equal((await fetch(origin+'/api/admin/inscriptions/'+noLodgingId,{method:'PATCH',headers:{...cookie,Origin:'https://evil.example'}})).status,403);
  const protectedRegistration=await fetch(origin+'/admin/inscriptions/'+noLodgingId,{redirect:'manual'});
  assert.equal(protectedRegistration.headers.get('location'),'/admin');assert.equal(calls,3);
  const registrationEditor=await fetch(origin+'/admin/inscriptions/'+noLodgingId,{headers:cookie});
  assert.equal(registrationEditor.status,200);
  const registrationHtml=await registrationEditor.text();
  assert(registrationHtml.includes('Sans hébergement')&&registrationHtml.includes('Enregistrer les modifications sans envoyer'));
  assert(!registrationHtml.includes('management_token_hash')&&!registrationHtml.includes('access_token')&&!registrationHtml.includes('test-private-service-key'));
  const existingRegistration=await fetch(origin+'/admin/inscriptions/'+fixture().registrations[0].id,{headers:cookie,redirect:'manual'});
  assert.equal(existingRegistration.headers.get('location'),'/admin/reservations/'+id,'linked registrations keep the existing protected editor');
  const dashboard=await fetch(origin+'/admin',{headers:cookie});
  assert.equal(dashboard.status,200);
  const dashboardHtml=await dashboard.text();
  assert(dashboardHtml.includes('/admin/inscriptions/'+noLodgingId)&&dashboardHtml.includes('/admin/inscriptions/66666666-6666-4666-8666-666666666666'),
    'both attending and declined registrations without lodging have an edit link');
  failing=true;
  const failed=await fetch(origin+'/api/admin/weekly-digest',{headers:auth});
  assert.equal(failed.status,503);
  const failure=JSON.stringify(await failed.json());
  assert(!failure.includes('newPeopleCount')&&!failure.includes('private fixture error'));
  console.log('PASS built Next.js HTTP: dashboard edit links with no lodging, private registration/reservation editors, linked-booking redirect, auth/CSRF, no exposed tokens, preview, disabled sends and fail-closed database errors; no SMTP credentials or real database used');
} finally {
  if(server.pid && server.exitCode===null && server.signalCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await stopped;}
  database.closeAllConnections();await new Promise(resolve=>database.close(resolve));
}
