import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRealtimeClient} from '@neon/realtime/client';

const base=process.env.TEST_BASE_URL;
assert.equal(base,'https://meupedido-git-codex-multidevice-homologacao-20261022-bruno-02a0.vercel.app','only the isolated preview is allowed');
const fixture=JSON.parse(await readFile('.validation-multidevice-accounts.json','utf8'));
const protection=new Map();let url=process.env.VERCEL_SHARE_URL;
assert.equal(new URL(url).origin,base);
for(let i=0;i<8;i++){
 const r=await fetch(url,{redirect:'manual',headers:{Cookie:[...protection].map(([k,v])=>k+'='+v).join('; ')}});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],split=pair.indexOf('=');protection.set(pair.slice(0,split),pair.slice(split+1));}
 if(!r.headers.get('location')){assert.equal(r.status,200);break;}
 url=new URL(r.headers.get('location'),url).href;assert.equal(new URL(url).origin,base,'share must stay on the preview');
}
const bypass=[...protection].map(([k,v])=>k+'='+v).join('; ');
async function request(path,user,body,method=body?'POST':'GET',attempt=0){
 const r=await fetch(base+path,{redirect:'manual',method,headers:{Origin:base,'Content-Type':'application/json',Cookie:[bypass,user?.cookie].filter(Boolean).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
 if(r.status===429&&attempt<4){await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Math.max(10000,Number(r.headers.get('retry-after')||10)*1000))));return request(path,user,body,method,attempt+1);}
 const text=await r.text();assert.ok(r.ok,`${path}: ${r.status} ${text.slice(0,200)}`);
 return {data:r.headers.get('content-type')?.includes('json')?JSON.parse(text):text,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
const clients=[],timers=[];
const wait=(sub,predicate)=>new Promise((resolve,reject)=>{let off=()=>{};const timer=setTimeout(()=>{off();reject(Error('Realtime deadline'));},30000);const check=s=>{if(s.status==='error'){clearTimeout(timer);off();reject(Error('Realtime error'));}else if(s.status==='live'&&s.data&&predicate(s.data)){clearTimeout(timer);off();resolve(s.data);}};off=sub.onChange(check);check(sub.getSnapshot());});
try{
 assert.equal((await request('/api/health')).data.database,'connected');
 const observers=[];
 for(const role of ['owner','cashier','kitchen','waiter']){
  const user=fixture.people[role];const login=await request('/api/auth/sign-in/email',null,{email:user.email,password:user.password});user.cookie=login.cookie;assert.ok(user.cookie);
  const caps=(await request('/api/realtime',user)).data;const client=createRealtimeClient({url:caps.url,logLevel:'silent'});clients.push(client);const sub=client.subscribe(caps.versionQuery);const rows=await wait(sub,r=>r.length===1);observers.push({user,sub,version:BigInt(rows[0].version)});
  timers.push(setInterval(async()=>{try{await sub.renew((await request('/api/realtime',user)).data.versionQuery);}catch{}},35000));
 }
 console.log('PASS preview login and managed realtime: owner, cashier, kitchen, waiter');
 const {owner,waiter,kitchen,cashier}=fixture.people;
 const product=(await request('/api/menu',owner)).data.items.find(x=>x.available);
 assert.ok(product);const checkout=(await request('/api/restaurant/checkout',waiter,{requestId:randomUUID(),channel:'balcao',tableId:null,customerId:null,notes:'Homologação Vercel isolada',items:[{menuItemId:product.id,quantity:1,notes:'Sem cebola',addons:[]}]})).data;
 const orderId=checkout.orderId;
 for(const o of observers)await wait(o.sub,rows=>BigInt(rows[0]?.version||0)>o.version);
 const received=(await request('/api/restaurant/kitchen',kitchen)).data.orders.find(o=>o.id===orderId);assert.ok(received);assert.equal(received.items.length,1);
 assert.equal((await request('/api/restaurant/order-detail?orderId='+orderId,cashier)).data.order.id,orderId);
 for(const status of ['preparando','pronto'])await request('/api/restaurant/kitchen',kitchen,{orderId,status},'PATCH');
 assert.ok((await request('/api/notifications',waiter)).data.notifications.some(n=>n.entity_id===orderId&&n.event_type==='kitchen.order_ready'));
 await request('/api/restaurant/kitchen',waiter,{orderId,status:'entregue'},'PATCH');
 console.log('PASS preview waiter order → kitchen → ready notice → delivery; four sessions receive persisted changes');
 for(const route of ['/mesas','/pdv','/comandas','/cozinha','/funcionarios','/notificacoes','/configuracoes','/manifest.webmanifest','/sw.js'])await request(route,owner);
 console.log('PASS main deployed routes and PWA resources');
}finally{for(const timer of timers)clearInterval(timer);for(const client of clients)client.close();}
