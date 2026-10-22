import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createRealtimeClient} from '@neon/realtime/client';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4320';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'isolated local server required');
assert.match(process.env.DATABASE_URL||'',/ep-gentle-butterfly-b4ykgpu9/,'only the known isolated Neon branch');
const suffix=Date.now()+'-'+randomUUID().slice(0,6);
async function api(path,user,body,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(user?{Cookie:user.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));return {status:response.status,data,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
async function ok(path,user,body,method){const r=await api(path,user,body,method);assert.ok(r.status>=200&&r.status<300,`${method||'request'} ${path}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
async function register(role){const user={email:`multidevice-${suffix}-${role}@example.test`,password:randomUUID()+'Aa1!',role};const r=await api('/api/auth/sign-up/email',null,{name:'Homologação '+role,email:user.email,password:user.password});assert.equal(r.status,200,JSON.stringify(r.data));user.cookie=r.cookie;user.id=r.data.user.id;assert.ok(user.cookie);return user;}
const clients=[];
const renewals=new Set();
function keepAuthorized(user,sub,caps){
 let stopped=false,timer;
 const stop=()=>{stopped=true;clearTimeout(timer);renewals.delete(stop);};
 const schedule=cap=>{timer=setTimeout(async()=>{try{const next=await ok('/api/realtime',user);if(stopped)return;await sub.renew(next.versionQuery);schedule(next);}catch(error){if(!stopped){console.error('Capability renewal failed for '+user.role+': '+error.message);stop();}}},Math.max(1000,cap.versionQuery.expiresAt-Date.now()-15000));};
 renewals.add(stop);schedule(caps);return stop;
}
const wait=(sub,predicate)=>new Promise((resolve,reject)=>{let off=()=>{};const timeout=setTimeout(()=>{off();reject(Error('Live snapshot timeout'));},30000);const check=s=>{if(s.status==='error'){clearTimeout(timeout);off();reject(Error('Realtime subscription failed '+JSON.stringify(s.error)));}else if(s.status==='live'&&s.data&&predicate(s.data)){clearTimeout(timeout);off();resolve(s.data);}};off=sub.onChange(check);check(sub.getSnapshot());});
try{
 const owner=await register('owner');const organization=await ok('/api/organizations/create',owner,{name:'Multidevice homologação '+suffix});const org=organization.organization.id;
 const people={owner};
 for(const role of ['cashier','kitchen','waiter','waiter2','kitchen2']){const user=await register(role);const invite=await ok('/api/staff',owner,{email:user.email,role:role.replace('2',''),permissions:[]});const token=new URLSearchParams(new URL(invite.invitationUrl).hash.slice(1)).get('token');await ok('/api/invitations',user,{token});people[role]=user;}
 const {cashier,kitchen,waiter,waiter2,kitchen2}=people;
 const foreign=await register('foreign');const foreignOrg=(await ok('/api/organizations/create',foreign,{name:'Outro restaurante '+suffix})).organization.id;
 const observers=[];
 for(const user of [owner,cashier,kitchen,waiter]){const caps=await ok('/api/realtime',user);const client=createRealtimeClient({url:caps.url,logLevel:'silent'});clients.push(client);const sub=client.subscribe(caps.versionQuery);const initial=await wait(sub,r=>r.length===1);const stop=keepAuthorized(user,sub,caps);observers.push({user,client,sub,stop,initial:BigInt(initial[0].version)});}
 console.log('PASS four independent Better Auth sessions connected to managed realtime');
 for(const [user,path] of [[waiter,'/api/restaurant/reports'],[waiter,'/api/restaurant/cash'],[kitchen,'/api/restaurant/order-detail'],[kitchen,'/api/menu'],[cashier,'/api/staff']])assert.equal((await api(path,user)).status,403,`${user.role} cannot ${path}`);
 assert.equal((await api('/api/restaurant/tables?organizationId='+foreignOrg,waiter)).status,403);
 assert.equal((await api('/api/restaurant/tables')).status,401);
 const table=(await ok('/api/restaurant',owner,{resource:'tables',name:'Mesa 05 '+suffix})).item.id;
 const ingredient=(await ok('/api/restaurant',owner,{resource:'ingredients',name:'Ingrediente '+suffix,unit:'un',quantity:100,minimumQuantity:2})).item.id;
 const product=(await ok('/api/menu/create',owner,{name:'Prato homologação',description:'Teste isolado',priceCents:2500})).item.id;
 await ok('/api/restaurant/recipes',owner,{menuItemId:product,ingredients:[{ingredientId:ingredient,quantity:1}]},'PUT');
 const cash=(await ok('/api/restaurant/cash',cashier,{action:'open',amountCents:0})).id;
 const open={requestId:randomUUID(),channel:'mesa',tableId:table,customerId:null,notes:''};
 const opens=await Promise.all([ok('/api/restaurant/orders',waiter,open),ok('/api/restaurant/orders',waiter2,{...open,requestId:randomUUID()})]);
 const order=opens[0].order.id;assert.equal(opens[1].order.id,order,'concurrent waiters share the same comanda');
 const line={menuItemId:product,quantity:2,notes:'Sem cebola',addons:[]};
 const initial={requestId:randomUUID(),orderId:order,items:[line]};
 await Promise.all([ok('/api/restaurant/order-items',waiter,initial),ok('/api/restaurant/order-items',waiter,initial)]);
 const getOrder=async user=>(await ok('/api/restaurant/order-detail?orderId='+order,user)).order;
 let kds=(await ok('/api/restaurant/kitchen',kitchen)).orders.find(o=>o.id===order);assert.equal(kds.items.length,1);assert.ok(!JSON.stringify(kds).includes('price_cents'));
 const first=kds.items[0].id;
 for(const o of observers)await wait(o.sub,r=>BigInt(r[0]?.version||'0')>o.initial);
 assert.equal((await getOrder(cashier)).total_cents,5000);
 await Promise.all([ok('/api/restaurant/kitchen',kitchen,{orderId:order,itemId:first,status:'preparando'},'PATCH'),ok('/api/restaurant/kitchen',kitchen2,{orderId:order,itemId:first,status:'preparando'},'PATCH')]);
 assert.equal(Number((await ok('/api/restaurant/inventory',owner)).items.find(i=>i.id===ingredient).quantity),98);
 const second={requestId:randomUUID(),orderId:order,items:[{...line,quantity:3}]};
 await ok('/api/restaurant/order-items',waiter2,second);
 await ok('/api/restaurant/order-items',waiter2,second);
 kds=(await ok('/api/restaurant/kitchen',kitchen)).orders.find(o=>o.id===order);assert.equal(kds.items.length,2);assert.equal(kds.items.find(i=>i.id===first).status,'preparando');
 const later=kds.items.find(i=>i.id!==first).id;
 await ok('/api/restaurant/kitchen',kitchen,{orderId:order,itemId:first,status:'pronto'},'PATCH');
 const notifications=await ok('/api/notifications',waiter);assert.ok(notifications.notifications.some(n=>n.event_type==='kitchen.order_ready'));
 await ok('/api/restaurant/kitchen',waiter,{orderId:order,itemId:first,status:'entregue'},'PATCH');
 assert.equal((await api('/api/restaurant/payments',waiter,{requestId:randomUUID(),orderId:order,method:'pix',amountCents:100})).status,403);
 for(const status of ['preparando','pronto'])await ok('/api/restaurant/kitchen',kitchen,{orderId:order,itemId:later,status},'PATCH');
 await ok('/api/restaurant/kitchen',waiter2,{orderId:order,itemId:later,status:'entregue'},'PATCH');
 assert.equal(Number((await ok('/api/restaurant/inventory',owner)).items.find(i=>i.id===ingredient).quantity),95,'stock exactly once across rounds');
 const payment={requestId:randomUUID(),orderId:order,method:'pix',amountCents:12500};
 await Promise.all([ok('/api/restaurant/payments',cashier,payment),ok('/api/restaurant/payments',cashier,payment)]);
 assert.equal(Number((await getOrder(cashier)).paid_cents),12500);
 assert.equal((await ok('/api/restaurant/tables',waiter)).tables.find(t=>t.id===table).orders.length,0);
 console.log('PASS waiter→KDS→ready→delivery→cash payment→free table, later rounds, concurrent kitchen, idempotency');
 const cashierPayload={requestId:randomUUID(),channel:'balcao',tableId:null,customerId:null,notes:'Caixa',items:[{...line,quantity:1}]};
 const desk=(await ok('/api/restaurant/checkout',cashier,cashierPayload)).orderId;
 assert.equal((await ok('/api/restaurant/checkout',cashier,cashierPayload)).orderId,desk);
 for(const status of ['preparando','pronto'])await ok('/api/restaurant/kitchen',kitchen,{orderId:desk,status},'PATCH');
 await ok('/api/restaurant/kitchen',cashier,{orderId:desk,status:'entregue'},'PATCH');
 await ok('/api/restaurant/payments',cashier,{requestId:randomUUID(),orderId:desk,method:'dinheiro',amountCents:2500});
 await ok('/api/restaurant/cash',cashier,{action:'close',sessionId:cash,amountCents:2500});
 console.log('PASS cashier order and cash reconciliation');
 const notices=await ok('/api/notifications',waiter);const ids=notices.notifications.map(n=>n.id);await ok('/api/notifications',waiter,{eventIds:ids,soundEnabled:false},'PATCH');assert.equal((await ok('/api/notifications',waiter)).unread,0);
 // Disconnect, mutate while offline, reconnect with a fresh authorized snapshot.
 const reconnect=observers[3];reconnect.stop();reconnect.client.close();await ok('/api/restaurant',owner,{resource:'tables',name:'Reconexão '+suffix});
 const cap=await ok('/api/realtime',waiter);const fresh=createRealtimeClient({url:cap.url,logLevel:'silent'});clients.push(fresh);const resumed=fresh.subscribe(cap.versionQuery);await wait(resumed,r=>BigInt(r[0]?.version||'0')>reconnect.initial);
 assert.ok((await ok('/api/restaurant/tables',waiter)).tables.some(t=>t.label==='Reconexão '+suffix));
 await ok('/api/auth/sign-out',waiter,{});assert.equal((await api('/api/realtime',waiter)).status,401);await wait(resumed,r=>r.length===0);
 console.log('PASS reconnection, notification read/mute, expired login and revoked realtime capability');
 await writeFile('.validation-multidevice-accounts.json',JSON.stringify({base,org,people},null,2),{mode:0o600});
 console.log('PASS isolated integration complete; test credentials saved in ignored local file');
}finally{for(const stop of renewals)stop();for(const client of clients)client.close();}
