import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrations} from '../scripts/migrations.mjs';

test('operação multidevice persistida: rodadas, cozinha, financeiro e permissões',async t=>{
 const db=new PGlite();
 const one=async(sql,params=[])=> (await db.query(sql,params)).rows[0];
 try{
  for(const migration of await migrations())await db.exec(migration.sql);
  for(const user of ['owner','other','cashier','waiter','waiter2','kitchen','kitchen2','manager'])await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[user,user+'@multidevice.test']);
  const org=(await one("SELECT onboard_establishment('owner','Restaurante multidevice','multidevice') AS id")).id;
  const other=(await one("SELECT onboard_establishment('other','Outro restaurante','multidevice-other') AS id")).id;
  for(const [user,role] of [['cashier','cashier'],['waiter','waiter'],['waiter2','waiter'],['kitchen','kitchen'],['kitchen2','kitchen'],['manager','manager']])await db.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)',[org,user,role]);
  const ingredient=(await one("INSERT INTO restaurant_ingredients(organization_id,name,unit,quantity) VALUES($1,'Ingrediente teste','un',1000) RETURNING id",[org])).id;
  const food=(await one("INSERT INTO restaurant_menu_items(organization_id,name,price_cents) VALUES($1,'Prato teste',1000) RETURNING id",[org])).id;
  const drink=(await one("INSERT INTO restaurant_menu_items(organization_id,name,price_cents,requires_preparation) VALUES($1,'Bebida pronta',500,false) RETURNING id",[org])).id;
  for(const product of [food,drink])await db.query("SELECT restaurant_set_recipe($1,'owner',$2,$3)",[org,product,JSON.stringify([{ingredientId:ingredient,quantity:1}])]);
  const lines=(product=food,quantity=1)=>[{menuItemId:product,quantity,notes:'Sem cebola',addons:[]}];
  const quantity=async()=>Number((await one('SELECT quantity FROM restaurant_ingredients WHERE id=$1',[ingredient])).quantity);
  const checkout=async({user='waiter',channel='balcao',tableId=null,items=lines(),requestId=randomUUID()}={})=>{
   const payload={channel,tableId,customerId:null,notes:'Teste multidevice',items};
   const order=(await one('SELECT restaurant_checkout_once($1,$2,$3,$4) AS id',[org,user,requestId,JSON.stringify(payload)])).id;
   return {order,requestId,payload};
  };
  const items=async order=>(await db.query('SELECT id,status,batch_id,requires_preparation FROM restaurant_order_items WHERE order_id=$1 ORDER BY created_at,id',[order])).rows;
  const transition=async(order,item,status,user=status==='entregue'?'waiter':'kitchen')=>db.query('SELECT restaurant_item_transition($1,$2,$3,$4,$5)',[org,user,order,item,status]);

  await t.test('dois garçons usam a mesma comanda e pedidos/addições repetidos não duplicam',async()=>{
   const table=(await one("INSERT INTO restaurant_tables(organization_id,label) VALUES($1,'Mesa 05') RETURNING id",[org])).id;
   const requestId=randomUUID(),body={channel:'mesa',tableId:table,customerId:null,notes:''};
   const opened=(await one("SELECT restaurant_open_order_once($1,'waiter',$2,$3) AS id",[org,requestId,JSON.stringify(body)])).id;
   assert.equal((await one("SELECT restaurant_open_order_once($1,'waiter2',$2,$3) AS id",[org,randomUUID(),JSON.stringify(body)])).id,opened);
   const first=await checkout({channel:'mesa',tableId:table,items:lines(food,2)});assert.equal(first.order,opened);
   assert.equal((await checkout({channel:'mesa',tableId:table,items:lines(food,2),requestId:first.requestId})).order,opened);
   assert.equal((await items(opened)).length,1,'checkout repetido não repete linha');
   const prior=(await items(opened))[0],before=await quantity();
   await transition(opened,prior.id,'preparando');
   await transition(opened,prior.id,'preparando','kitchen2');
   assert.equal(await quantity(),before-2,'segundo dispositivo não baixa duas vezes');
   const addition=randomUUID(),newLines=JSON.stringify(lines(food,3));
   await db.query("SELECT restaurant_add_items_once($1,'waiter2',$2,$3,$4)",[org,opened,addition,newLines]);
   await db.query("SELECT restaurant_add_items_once($1,'waiter2',$2,$3,$4)",[org,opened,addition,newLines]);
   const all=await items(opened);assert.equal(all.length,2);assert.equal(all.find(i=>i.id===prior.id).status,'preparando','rodada anterior não retorna para recebido');
   const added=all.find(i=>i.id!==prior.id);assert.equal(added.status,'recebido');assert.equal(added.batch_id,addition);assert.notEqual(added.batch_id,prior.batch_id);
   assert.equal(await quantity(),before-2,'adicionar itens não repete consumo anterior');
   await assert.rejects(db.query("SELECT restaurant_add_items_once($1,'waiter2',$2,$3,$4)",[org,opened,addition,JSON.stringify(lines(food,4))]),/request_payload_mismatch/);
   await transition(opened,added.id,'preparando');await transition(opened,added.id,'preparando','kitchen2');
   assert.equal(await quantity(),before-5,'apenas nova rodada consome estoque adicional');
   for(const item of all){await transition(opened,item.id,'pronto');await transition(opened,item.id,'pronto','kitchen2');await transition(opened,item.id,'entregue');}
   assert.equal((await one('SELECT status FROM restaurant_orders WHERE id=$1',[opened])).status,'entregue');
   const payment=randomUUID();
   await db.query("SELECT restaurant_record_payment_once($1,'cashier',$2,'pix',5000,$3)",[org,opened,payment]);
   await db.query("SELECT restaurant_record_payment_once($1,'cashier',$2,'pix',5000,$3)",[org,opened,payment]);
   assert.equal(Number((await one('SELECT sum(amount_cents) AS total FROM restaurant_payments WHERE order_id=$1',[opened])).total),5000);
   assert.equal((await one('SELECT count(*)::int AS n FROM restaurant_open_orders WHERE table_id=$1',[table])).n,0,'pagamento e entrega liberam mesa');
   await db.query("SELECT restaurant_close_order($1,'cashier',$2)",[org,opened]);await db.query("SELECT restaurant_close_order($1,'cashier',$2)",[org,opened]);
   await assert.rejects(db.query("SELECT restaurant_add_items_once($1,'waiter',$2,$3,$4)",[org,opened,randomUUID(),newLines]),/order_not_editable/);
   assert.equal(await quantity(),before-5,'pagamento e encerramento não baixam estoque');
  });

  await t.test('caixa registra pedido, pagamento não finaliza antes de entregar',async()=>{
   const {order}=await checkout({user:'cashier'});const line=(await items(order))[0];
   await db.query("SELECT restaurant_record_payment_once($1,'cashier',$2,'pix',1000,$3)",[org,order,randomUUID()]);
   assert.equal((await one('SELECT completed_at FROM restaurant_orders WHERE id=$1',[order])).completed_at,null);
   await assert.rejects(db.query("SELECT restaurant_close_order($1,'cashier',$2)",[org,order]),/fulfillment_pending/);
   await transition(order,line.id,'preparando');await transition(order,line.id,'pronto');await transition(order,line.id,'entregue','cashier');
   assert.ok((await one('SELECT completed_at FROM restaurant_orders WHERE id=$1',[order])).completed_at);
   await assert.rejects(db.query("SELECT restaurant_record_payment_once($1,'cashier',$2,'pix',1,$3)",[org,order,randomUUID()]),/payment_exceeds_balance/);
  });

  await t.test('cozinha e garçom não alteram financeiro/administração, nem outro restaurante',async()=>{
   const {order}=await checkout();const item=(await items(order))[0];
   for(const user of ['waiter','kitchen'])await assert.rejects(db.query('SELECT restaurant_record_payment_once($1,$2,$3,$4,$5,$6)',[org,user,order,'pix',1000,randomUUID()]),/forbidden/);
   await assert.rejects(transition(order,item.id,'preparando','waiter'),/forbidden/);
   await assert.rejects(transition(order,item.id,'entregue','kitchen'),/forbidden/);
   await assert.rejects(db.query("SELECT restaurant_checkout_once($1,'kitchen',$2,$3)",[org,randomUUID(),JSON.stringify({channel:'balcao',items:lines()})]),/forbidden/);
   await assert.rejects(db.query("SELECT restaurant_kitchen_transition($1,'other',$2,'preparando')",[org,order]),/forbidden/);
   await assert.rejects(db.query("SELECT restaurant_add_items_once($1,'waiter',$2,$3,$4)",[other,order,randomUUID(),JSON.stringify(lines())]),/forbidden/);
   await assert.rejects(db.query("SELECT restaurant_set_discount($1,'waiter',$2,100)",[org,order]),/forbidden/);
   await assert.rejects(db.query("SELECT restaurant_cancel_order($1,'waiter',$2)",[org,order]),/forbidden/);
  });

  await t.test('notificações são únicas por operação e somente participantes/roles autorizados recebem',async()=>{
   const {order,payload,requestId}=await checkout();
   await db.query("SELECT restaurant_checkout_once($1,'waiter',$2,$3)",[org,requestId,JSON.stringify(payload)]);
   assert.equal((await one("SELECT count(*)::int AS n FROM restaurant_events WHERE entity_id=$1 AND event_type='order.created'",[order])).n,1);
   assert.equal((await one("SELECT count(*)::int AS n FROM restaurant_events WHERE entity_id=$1 AND event_type='order.items_added'",[order])).n,0,'evento inicial não repete novo pedido por item');
   const event=(await one("SELECT id FROM restaurant_events WHERE entity_id=$1 AND event_type='order.created'",[order])).id;
   const users=(await db.query('SELECT user_id FROM restaurant_notifications WHERE event_id=$1',[event])).rows.map(row=>row.user_id);
   assert.ok(users.includes('kitchen')&&users.includes('cashier')&&users.includes('waiter'));
   assert.ok(!users.includes('other')&&!users.includes('waiter2'));
  });

  await t.test('produto sem preparo fica pronto, é entregue pelo garçom e consome uma vez',async()=>{
   const before=await quantity(),{order}=await checkout({items:lines(drink,2)}),line=(await items(order))[0];
   assert.equal(line.status,'pronto');assert.equal(line.requires_preparation,false);
   assert.equal((await one('SELECT status FROM restaurant_orders WHERE id=$1',[order])).status,'pronto','pedido sem preparo também deve ficar pronto');
   await transition(order,line.id,'entregue');await transition(order,line.id,'entregue','waiter2');
   assert.equal(await quantity(),before-2);
  });

  await t.test('rodada nova não permite cancelar um item antigo já preparado',async()=>{
   const {order}=await checkout(),line=(await items(order))[0];
   await transition(order,line.id,'preparando');await transition(order,line.id,'pronto');
   await db.query("SELECT restaurant_add_items_once($1,'waiter',$2,$3,$4)",[org,order,randomUUID(),JSON.stringify(lines())]);
   await assert.rejects(db.query("SELECT restaurant_cancel_item($1,'owner',$2)",[org,line.id]),/prepared|editable|cancel/);
   assert.equal((await items(order)).find(i=>i.id===line.id).status,'pronto');
  });

  await t.test('cancelar somente nova linha mantém preparo anterior e é idempotente',async()=>{
   const {order}=await checkout(),prior=(await items(order))[0];
   await transition(order,prior.id,'preparando');await transition(order,prior.id,'pronto');
   await db.query("SELECT restaurant_add_items_once($1,'waiter',$2,$3,$4)",[org,order,randomUUID(),JSON.stringify(lines())]);
   const added=(await items(order)).find(line=>line.id!==prior.id);
   await db.query("SELECT restaurant_cancel_item($1,'owner',$2)",[org,added.id]);
   await db.query("SELECT restaurant_cancel_item($1,'owner',$2)",[org,added.id]);
   const saved=await one('SELECT status,total_cents FROM restaurant_orders WHERE id=$1',[order]);
   assert.equal(saved.status,'pronto');assert.equal(Number(saved.total_cents),1000);
   assert.equal((await items(order)).find(line=>line.id===added.id).status,'cancelado');
  });

  await t.test('gerente com permissão de gestão pode atualizar ficha técnica',async()=>{
   await db.query("SELECT restaurant_update_staff($1,'owner','manager','manager',ARRAY['manage'],true)",[org]);
   await db.query("SELECT restaurant_set_recipe($1,'manager',$2,$3)",[org,food,JSON.stringify([{ingredientId:ingredient,quantity:1}])]);
  });
 }finally{await db.close();}
});
