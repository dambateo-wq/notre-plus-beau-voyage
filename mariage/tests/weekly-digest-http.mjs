import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fixture } from './weekly-digest-loader.mjs';

let failing = false, calls = 0;
const database = createServer((request, response) => {
  calls++;
  assert.equal(request.method,'POST');
  assert.equal(request.url,'/rest/v1/rpc/weekly_digest_snapshot','only the read-only snapshot is called');
  assert.equal(request.headers.apikey,'test-private-service-key');
  response.writeHead(failing?503:200,{'Content-Type':'application/json'});
  response.end(failing?'private fixture error':JSON.stringify(fixture()));
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
  failing=true;
  const failed=await fetch(origin+'/api/admin/weekly-digest',{headers:auth});
  assert.equal(failed.status,503);
  const failure=JSON.stringify(await failed.json());
  assert(!failure.includes('newPeopleCount')&&!failure.includes('private fixture error'));
  console.log('PASS built Next.js HTTP routes: auth, real preview HTML/JSON, private headers, disabled test/cron, method protection and fail-closed Supabase response; no SMTP credentials or real database used');
} finally {
  if(server.pid && server.exitCode===null && server.signalCode===null){const stopped=once(server,'exit');server.kill('SIGTERM');await stopped;}
  database.closeAllConnections();await new Promise(resolve=>database.close(resolve));
}
