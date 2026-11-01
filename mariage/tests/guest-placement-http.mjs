import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {encodeReply}=require('next/dist/compiled/react-server-dom-turbopack/client.node');
const manifest=JSON.parse(await readFile('.next/server/server-reference-manifest.json','utf8'));
const actionId=name=>Object.entries(manifest.node).find(([,value])=>value.exportedName===name)?.[0];
const id='11111111-1111-4111-8111-111111111111';
let errorCode='ROOM_FULL_2027-05-29',rpcCalls=0,readCalls=0;
const database=createServer(async(request,response)=>{
  assert.equal(request.headers.apikey,'fixture-private-key');
  if(request.method!=='POST'){readCalls++;response.writeHead(200,{'Content-Type':'application/json'});response.end('[]');return;}
  rpcCalls++;
  assert.equal(request.url,'/rest/v1/rpc/admin_lodging_placement');
  let raw='';for await(const chunk of request)raw+=chunk;
  const params=JSON.parse(raw);
  response.writeHead(errorCode?400:200,{'Content-Type':'application/json'});
  response.end(JSON.stringify(errorCode?{code:'P0001',message:errorCode,details:'PRIVATE-FIXTURE-DETAILS'}:{
    placement_status:params.p_operation==='finalize'?'finalized':'in_progress',
    assignment:params.p_operation==='place'?{id:'22222222-2222-4222-8222-222222222222',reservation_id:id,
      guest_index:params.p_guest_index,room_name:params.p_room_name,guest_name:'Invité fictif',assigned_nights:['2027-05-29'],updated_at:'2026-11-01T17:00:00Z'}:null,
  }));
});
await new Promise(resolve=>database.listen(0,'127.0.0.1',resolve));
const env={...process.env,SUPABASE_URL:`http://127.0.0.1:${database.address().port}`,SUPABASE_SERVICE_ROLE_KEY:'fixture-private-key',
  ADMIN_PASSWORD:'fixture-admin-password',WEEKLY_DIGEST_ENABLED:'false',WEEKLY_DIGEST_TEST_ENABLED:'false',VERCEL_ENV:'preview'};
delete env.SMTP_USER;delete env.SMTP_PASS;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3461'],{env,stdio:['ignore','pipe','pipe']});
const origin='http://127.0.0.1:3461';
const session=createHmac('sha256',env.ADMIN_PASSWORD).update('notre-plus-beau-voyage-admin').digest('hex');
async function call(name,{authenticated=true}={}){
  const action=actionId(name);assert(action,'Server Action exists in the actual compiled manifest: '+name);
  const form=new FormData();form.set('reservationId',id);form.set('guestIndex','1');form.set('roomName','A1');
  const body=await encodeReply([form]);
  const response=await fetch(origin+'/admin',{method:'POST',headers:{Origin:origin,'Next-Action':action,Accept:'text/x-component',
    ...(authenticated?{Cookie:'wedding_admin_session='+session}:{}),...(typeof body==='string'?{'Content-Type':'text/plain;charset=UTF-8'}:{})},body});
  const text=await response.text();
  assert.equal(response.status,200,text.slice(0,400));
  assert.match(response.headers.get('Content-Type'),/text\/x-component/);
  assert(!text.includes('Server Components render')&&!text.includes('PRIVATE-FIXTURE-DETAILS')&&!text.includes('fixture-private-key'));
  assert.equal(readCalls,0,'an expected placement refusal must not start a full admin render');
  return text;
}
try{
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Next startup timed out')),15000);
    server.stdout.on('data',data=>{if(String(data).includes('Ready')){clearTimeout(timer);resolve();}});
    server.stderr.resume();server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(new Error('Next exited '+code));});
  });
  const expired=await call('saveGuestLodgingPlacement',{authenticated:false});
  assert(expired.includes('session administrateur a expiré'));assert.equal(rpcCalls,0);
  const full=await call('saveGuestLodgingPlacement');assert(full.includes('Cette chambre est complète'));
  errorCode='REVIEW_PENDING';
  for(const name of ['saveGuestLodgingPlacement','removeGuestLodgingPlacement','finalizeLodgingPlacement','reopenLodgingPlacement']){
    const body=await call(name);assert(body.includes('modification financière en attente'));assert(body.includes('"ok":false'));
  }
  errorCode='INCOMPLETE_PLACEMENT';
  assert((await call('finalizeLodgingPlacement')).includes('Tous les voyageurs doivent avoir une chambre'));
  errorCode='UNEXPECTED_PRIVATE_FAILURE';
  const unknown=await call('saveGuestLodgingPlacement');assert(unknown.includes('"refreshRequired":true')&&!unknown.includes(errorCode));
  errorCode='';
  for(const name of ['saveGuestLodgingPlacement','removeGuestLodgingPlacement','finalizeLodgingPlacement','reopenLodgingPlacement']){
    assert((await call(name)).includes('"ok":true'));
  }
  console.log('PASS actual production-build Server Action transport: safe French room/review/completeness messages, expired session, all four operations, no RSC error, no automatic page rerender or database read, no raw private details and no real SMTP/Supabase');
}finally{
  if(server.pid&&server.exitCode===null&&server.signalCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await stopped;}
  database.closeAllConnections();await new Promise(resolve=>database.close(resolve));
}
