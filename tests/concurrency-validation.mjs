import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

// Run only with the isolated branch environment. These are real independent
// PostgreSQL connections, not Promise.all over a single embedded connection.
const connectionString=process.env.INTEGRATION_DATABASE_URL;
if(!connectionString)throw Error('INTEGRATION_DATABASE_URL required for isolated concurrency validation.');
const target=new URL(connectionString);
if(target.hostname!==process.env.MIGRATION_EXPECTED_HOST||target.hostname.includes('ep-late-pond'))throw Error('Unexpected test database host.');
target.searchParams.set('sslmode','verify-full');
const setup=new pg.Client({connectionString:target.toString()});
const a=new pg.Client({connectionString:target.toString()}),b=new pg.Client({connectionString:target.toString()});
await Promise.all([setup.connect(),a.connect(),b.connect()]);
const one=async(client,sql,args=[])=> (await client.query(sql,args)).rows[0];
let phase='setup';
try{
 await Promise.all([a.query("SET statement_timeout='15s'"),b.query("SET statement_timeout='15s'")]);
 const marker='concurrency-'+randomUUID(),owner=marker+'-owner',kitchen=marker+'-kitchen',cashier=marker+'-cashier';
 for(const user of [owner,kitchen,cashier])await setup.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[user,user+'@example.test']);
 const org=(await one(setup,'SELECT onboard_establishment($1,$2,$3) AS id',[owner,'Homologação concorrência '+marker,marker])).id;
 for(const [user,role] of [[kitchen,'kitchen'],[cashier,'cashier']])await setup.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)',[org,user,role]);
 const product=(await one(setup,"INSERT INTO restaurant_menu_items(organization_id,name,price_cents) VALUES($1,'Prato sem ficha técnica de teste',1000) RETURNING id",[org])).id;
 const createOrder=async()=>{
  const order=(await one(setup,"SELECT restaurant_checkout_once($1,$2,$3,$4) AS id",[org,owner,randomUUID(),JSON.stringify({channel:'balcao',items:[{menuItemId:product,quantity:1,notes:'Teste isolado',addons:[]}]})])).id;
  return {order,item:(await one(setup,'SELECT id FROM restaurant_order_items WHERE order_id=$1',[order])).id};
 };
 const pid=(await one(b,'SELECT pg_backend_pid() AS id')).id;
 const expectBlocked=async()=>{
  const start=Date.now();
  while(Date.now()-start<5000){
   const state=await one(setup,'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
   if(state?.wait_event_type==='Lock')return;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw Error('Second connection did not reach its expected database lock.');
 };
 phase='prepare-before-cancel';
 const first=await createOrder();
 await a.query('BEGIN');await a.query('SELECT id FROM restaurant_orders WHERE id=$1 FOR UPDATE',[first.order]);
 const cancellation=b.query('SELECT restaurant_cancel_item($1,$2,$3)',[org,owner,first.item]).then(value=>({ok:true,value}),error=>({ok:false,error}));
 await expectBlocked();
 await a.query("SELECT restaurant_item_transition($1,$2,$3,$4,'preparando')",[org,kitchen,first.order,first.item]);
 await a.query('COMMIT');
 const cancelled=await cancellation;assert.equal(cancelled.ok,false);assert.match(cancelled.error.message,/cannot_cancel_prepared_item/);
 assert.equal((await one(setup,'SELECT status FROM restaurant_order_items WHERE id=$1',[first.item])).status,'preparando');
 assert.equal((await one(setup,'SELECT total_cents FROM restaurant_orders WHERE id=$1',[first.order])).total_cents,1000);
 assert.equal((await one(setup,'SELECT count(*)::int AS n FROM restaurant_order_inventory_consumptions WHERE order_item_id=$1',[first.item])).n,0,'race guard works even without inventory entries');
 console.log('PASS concurrency: kitchen preparation commits while cancellation waits; prepared item cannot be canceled.');

 phase='cancel-before-prepare';
 const second=await createOrder();
 await a.query('BEGIN');await a.query('SELECT id FROM restaurant_orders WHERE id=$1 FOR UPDATE',[second.order]);
 const preparation=b.query("SELECT restaurant_item_transition($1,$2,$3,$4,'preparando')",[org,kitchen,second.order,second.item]).then(value=>({ok:true,value}),error=>({ok:false,error}));
 await expectBlocked();await a.query('SELECT restaurant_cancel_item($1,$2,$3)',[org,owner,second.item]);await a.query('COMMIT');
 const prepared=await preparation;assert.equal(prepared.ok,false);assert.match(prepared.error.message,/invalid_item|invalid_order/);
 assert.equal((await one(setup,'SELECT status FROM restaurant_order_items WHERE id=$1',[second.item])).status,'cancelado');
 assert.equal((await one(setup,'SELECT total_cents FROM restaurant_orders WHERE id=$1',[second.order])).total_cents,0);
 await setup.query('SELECT restaurant_cancel_item($1,$2,$3)',[org,owner,second.item]);
 assert.equal((await one(setup,"SELECT count(*)::int AS n FROM restaurant_audit_events WHERE action='item.canceled' AND entity_id=$1",[second.item])).n,1);
 console.log('PASS concurrency: cancellation commits while preparation waits; canceled item stays canceled and retry is idempotent.');

 phase='payment-before-cancel';
 const third=await createOrder();
 await a.query('BEGIN');await a.query('SELECT id FROM restaurant_orders WHERE id=$1 FOR UPDATE',[third.order]);
 const paidCancel=b.query('SELECT restaurant_cancel_item($1,$2,$3)',[org,owner,third.item]).then(value=>({ok:true,value}),error=>({ok:false,error}));
 await expectBlocked();await a.query("SELECT restaurant_record_payment_once($1,$2,$3,'pix',1000,$4)",[org,cashier,third.order,randomUUID()]);await a.query('COMMIT');
 const paidCancelResult=await paidCancel;assert.equal(paidCancelResult.ok,false);assert.match(paidCancelResult.error.message,/order_not_editable/);
 assert.equal((await one(setup,'SELECT status FROM restaurant_order_items WHERE id=$1',[third.item])).status,'recebido');
 console.log('PASS concurrency: payment commits while cancellation waits; financial total remains intact.');

 phase='duplicate-payment';
 const fourth=await createOrder(),request=randomUUID();
 await a.query('BEGIN');await a.query("SELECT restaurant_record_payment_once($1,$2,$3,'pix',1000,$4)",[org,cashier,fourth.order,request]);
 const payment=b.query("SELECT restaurant_record_payment_once($1,$2,$3,'pix',1000,$4)",[org,cashier,fourth.order,request]);
 await expectBlocked();await a.query('COMMIT');await payment;
 const totals=await one(setup,'SELECT count(*)::int AS n,sum(amount_cents)::int AS paid FROM restaurant_payments WHERE order_id=$1',[fourth.order]);assert.deepEqual(totals,{n:1,paid:1000});
 console.log('PASS concurrency: two real connections retry the same payment; one payment is persisted.');
}catch(error){console.error('Concurrency validation failed at '+phase);throw error;}
finally{
 await a.query('ROLLBACK').catch(()=>{});await b.query('ROLLBACK').catch(()=>{});
 await Promise.all([a.end(),b.end(),setup.end()]);
}
