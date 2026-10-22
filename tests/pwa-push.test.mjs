import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {migrations} from '../scripts/migrations.mjs';
import * as validation from '../src/lib/push-validation.mjs';

const keys={p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')};
test('push rejects arbitrary destinations, credentials, malformed browser keys and host suffix tricks',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://web.push.apple.com/Q/a','https://wns2-am3p.notify.windows.com/w/?token=a'])assert.equal(validation.validPushSubscription({endpoint,keys}),true,endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://169.254.169.254/a','https://fcm.googleapis.com.evil.test/a','https://evil.push.apple.com.evil.test/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','file:///etc/passwd','https://example.test/a'])assert.equal(validation.validPushSubscription({endpoint,keys}),false,endpoint);
 assert.equal(validation.validPushSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{...keys,auth:'bad'}}),false);
 assert.equal(validation.validPushSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{...keys,p256dh:Buffer.alloc(65).toString('base64url')}}),false);
});

test('service worker never caches authenticated routes or APIs, recovers offline navigation and requires an explicit update',async()=>{
 const handlers={},shown=[],cached=[],deleted=[];let skipped=0,opened='';
 const self={location:{origin:'https://meupedido.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{skipped++;},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async url=>{opened=url;}},registration:{showNotification:async(title,options)=>shown.push({title,...options})}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Response,caches:{open:async()=>({addAll:async paths=>cached.push(...paths)}),keys:async()=>['meupedido-public-v0','unrelated-cache'],delete:async key=>deleted.push(key),match:async()=>new Response('offline fallback')},fetch:async()=>{throw new Error('offline');}});
 let work;handlers.install({waitUntil:promise=>work=promise});await work;
 assert.equal(skipped,0);assert.ok(cached.every(path=>path==='/offline.html'||path.startsWith('/icons/')));
 handlers.activate({waitUntil:promise=>work=promise});await work;assert.deepEqual(deleted,['meupedido-public-v0']);
 for(const request of [{url:'https://meupedido.test/api/restaurant/orders',method:'GET',mode:'cors',headers:new Headers()},{url:'https://meupedido.test/comandas?_rsc=a',method:'GET',mode:'cors',headers:new Headers()},{url:'https://meupedido.test/api/restaurant/checkout',method:'POST',mode:'cors',headers:new Headers()}])handlers.fetch({request,respondWith:()=>assert.fail('Sensitive or mutating request intercepted')});
 handlers.fetch({request:{url:'https://meupedido.test/comandas',method:'GET',mode:'navigate',headers:new Headers()},respondWith:promise=>work=promise});assert.equal(await (await work).text(),'offline fallback');
 handlers.message({data:{type:'unrelated'},waitUntil:promise=>work=promise});assert.equal(skipped,0);
 handlers.message({data:{type:'ACTIVATE_UPDATE'},waitUntil:promise=>work=promise});await work;assert.equal(skipped,1);
 const payload={title:'Pedido pronto',body:'Confira a operação',tag:'meupedido-00000000-0000-0000-0000-000000000001',url:'https://evil.test'};
 for(let i=0;i<2;i++){handlers.push({data:{json:()=>payload},waitUntil:promise=>work=promise});await work;}
 assert.equal(shown[0].tag,shown[1].tag);assert.equal(shown[1].renotify,false);
 handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.test'}},waitUntil:promise=>work=promise});await work;assert.equal(opened,'https://meupedido.test/notificacoes');
 for(const size of [192,512]){const png=await readFile(new URL(`../public/icons/icon-${size}.png`,import.meta.url));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
});

test('push persistence: tenant constraints, authenticated rebinding, idempotent dispatch, retries and invalid subscription cleanup',async()=>{
 const db=new PGlite(),savedEnv={...process.env};
 try{
  for(const migration of (await migrations()).filter(m=>m.name<'035'))await db.exec(migration.sql);
  await db.exec(`INSERT INTO "user"(id,name,email) VALUES('push-a','Push A','push-a@example.test'),('push-b','Push B','push-b@example.test')`);
  const query=async(sql,params=[])=> (await db.query(sql,params)).rows;
  const one=async(sql,params=[])=> (await query(sql,params))[0];
  const a=(await one("SELECT onboard_establishment('push-a','Push A','push-a') AS id")).id;
  const b=(await one("SELECT onboard_establishment('push-b','Push B','push-b') AS id")).id;
  const register=async(user,endpoint)=> (await one('SELECT restaurant_register_push_subscription($1,$2,$3,$4,$5,$6) AS id',[user,endpoint,'a'.repeat(64),keys.p256dh,keys.auth,'Device'])).id;
  const subA=await register('push-a','https://fcm.googleapis.com/a');
  const subB=await register('push-b','https://fcm.googleapis.com/b');
  const event=async(org,user)=>{const id=(await one("INSERT INTO restaurant_events(organization_id,event_type,entity_id) VALUES($1,'kitchen.order_ready',gen_random_uuid()) RETURNING id",[org])).id;await query('INSERT INTO restaurant_notifications(event_id,organization_id,user_id) VALUES($1,$2,$3)',[id,org,user]);return id;};
  const eventA=await event(a,'push-a');
  await assert.rejects(query('INSERT INTO restaurant_push_deliveries(event_id,subscription_id,organization_id,user_id) VALUES($1,$2,$3,$4)',[eventA,subB,b,'push-b']),/foreign key/);
  const nativeRequire=createRequire(import.meta.url);let outcome='ok',sent=0;
  const sql=async(strings,...values)=>query(strings.reduce((text,part,index)=>text+part+(index<values.length?`$${index+1}`:''),''),values);
  let session={user:{id:'push-a'}},configured=true;
  const apiModule={exports:{}};
  const apiSource=ts.transpileModule(await readFile(new URL('../src/app/api/push/subscriptions/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText;
  const apiRequire=name=>name==='next/headers'?{headers:async()=>new Headers()}:name==='@/lib/auth'?{createAuth:()=>({api:{getSession:async()=>session}})}:name==='@/lib/db'?{getDb:()=>sql}:name==='@/lib/push'?{pushConfiguration:()=>({configured,publicKey:configured?'public-key':''})}:name==='@/lib/push-validation.mjs'?validation:nativeRequire(name);
  new Function('require','module','exports',apiSource)(apiRequire,apiModule,apiModule.exports);
  const request=(method,body,origin='https://meupedido.test')=>new Request('https://meupedido.test/api/push/subscriptions',{method,headers:method==='GET'?{}:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  const api=apiModule.exports;
  session=null;assert.equal((await api.GET(request('GET'))).status,401);session={user:{id:'push-a'}};
  assert.equal((await api.POST(request('POST',{},'https://evil.test'))).status,403);
  assert.equal((await api.POST(request('POST',null))).status,400);
  const activate={consent:true,subscription:{endpoint:'https://fcm.googleapis.com/a',keys}};
  assert.equal((await api.POST(request('POST',{...activate,organizationId:b}))).status,403);
  assert.equal((await api.POST(request('POST',{...activate,consent:false}))).status,400);
  assert.equal((await api.POST(request('POST',{...activate,subscription:{endpoint:'https://127.0.0.1/secrets',keys}}))).status,400);
  assert.equal((await api.POST(request('POST',{...activate,userId:'push-b',role:'owner'}))).status,201);
  assert.equal((await one('SELECT user_id FROM restaurant_push_subscriptions WHERE id=$1',[subA])).user_id,'push-a','browser user fields cannot switch the recipient');
  const list=await (await api.GET(request('GET'))).json();assert.equal(list.devices.length,1);assert.ok(!JSON.stringify(list).includes('https://fcm.googleapis.com'));assert.ok(!('privateKey' in list));
  assert.equal((await api.DELETE(request('DELETE',{endpoint:'https://fcm.googleapis.com/b'}))).status,200);
  assert.equal((await one('SELECT count(*)::int n FROM restaurant_push_subscriptions WHERE id=$1',[subB])).n,1,'a user cannot revoke another user device');
  configured=false;assert.equal((await api.POST(request('POST',activate))).status,503);configured=true;
  const source=ts.transpileModule(await readFile(new URL('../src/lib/push.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  const mockRequire=name=>name==='server-only'?{}:name==='./db'?{getDb:()=>sql}:name==='./push-validation.mjs'?validation:name==='web-push'?{sendNotification:async(subscription,payload)=>{sent++;assert.ok(subscription.endpoint.startsWith('https://fcm.googleapis.com/'));const data=JSON.parse(payload);assert.equal(data.url,'/notificacoes');assert.ok(!('orderId' in data));if(outcome!=='ok')throw Object.assign(new Error('provider_error'),{statusCode:Number(outcome)});}}:nativeRequire(name);
  new Function('require','module','exports',source)(mockRequire,module,module.exports);
  process.env.VAPID_PUBLIC_KEY='a'.repeat(87);process.env.VAPID_PRIVATE_KEY='b'.repeat(43);process.env.VAPID_SUBJECT='mailto:ops@example.test';
  const dispatch=module.exports.dispatchPushNotifications;
  assert.equal((await dispatch()).sent,1);assert.equal((await dispatch()).sent,0);assert.equal(sent,1);
  assert.equal((await one('SELECT state FROM restaurant_push_deliveries WHERE event_id=$1',[eventA])).state,'sent');
  const retryEvent=await event(a,'push-a');outcome='503';assert.equal((await dispatch()).failed,1);
  assert.equal((await one('SELECT attempts FROM restaurant_push_deliveries WHERE event_id=$1',[retryEvent])).attempts,1);
  assert.equal((await dispatch()).failed,0,'backoff avoids retrying in a tight loop');
  await query("UPDATE restaurant_push_deliveries SET next_attempt_at=now()-interval '1 second' WHERE event_id=$1",[retryEvent]);outcome='ok';assert.equal((await dispatch()).sent,1);
  await event(b,'push-b');outcome='410';assert.equal((await dispatch()).failed,1);assert.equal((await one('SELECT count(*)::int n FROM restaurant_push_subscriptions WHERE id=$1',[subB])).n,0);
  const rebound=await register('push-b','https://fcm.googleapis.com/a');assert.notEqual(rebound,subA);assert.equal((await one('SELECT count(*)::int n FROM restaurant_push_subscriptions WHERE user_id=$1',['push-a'])).n,0);
  assert.equal((await one('SELECT count(*)::int n FROM organizations')).n,2,'only device registrations were changed');
  await assert.rejects(register('not-a-user','https://fcm.googleapis.com/unknown'),/forbidden/);
 }finally{for(const name of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT']){if(savedEnv[name]===undefined)delete process.env[name];else process.env[name]=savedEnv[name];}await db.close();}
});
