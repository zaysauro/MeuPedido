import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4320';
async function api(path,body,cookie,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));return {status:r.status,data,cookie:r.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
}
const runId=Date.now();
const users=[];
for(const suffix of ['A','B']){
 const email=`validation-${runId}-${suffix.toLowerCase()}@example.test`,password=randomUUID()+'Aa1!';
 const signup=await api('/api/auth/sign-up/email',{name:'Restaurante de teste '+suffix,email,password});
 assert.equal(signup.status,200,'cadastro: '+JSON.stringify(signup.data));assert.ok(signup.cookie);
 const signin=await api('/api/auth/sign-in/email',{email,password});assert.equal(signin.status,200,'login');
 const cookie=signin.cookie;assert.ok(cookie);
 const organization=await api('/api/organizations/create',{name:'Homologação '+runId+' '+suffix},cookie);assert.equal(organization.status,201,'organization '+JSON.stringify(organization.data));
 users.push({email,password,cookie,org:organization.data.organization.id});
}
const [a,b]=users;const org=a.org;
assert.equal((await api('/api/restaurant?resource=customers&organizationId='+org,null,b.cookie)).status,403,'isolamento leitura');
assert.equal((await api('/api/restaurant',{organizationId:org,resource:'customers',name:'Invasor',phone:''},b.cookie)).status,403,'isolamento gravação');
const ingredient=await api('/api/restaurant',{resource:'ingredients',organizationId:org,name:'Pão teste',unit:'un',quantity:10,minimumQuantity:2},a.cookie);assert.equal(ingredient.status,201);
const product=await api('/api/menu/create',{organizationId:org,name:'Burger teste',priceCents:2500,description:'Teste integrado',categoryId:null},a.cookie);assert.equal(product.status,201,'produto '+JSON.stringify(product.data));
const productId=product.data.item?.id??product.data.product?.id;
const recipe=await api('/api/restaurant/recipes',{organizationId:org,menuItemId:productId,ingredients:[{ingredientId:ingredient.data.item.id,quantity:1}]},a.cookie,'PUT');
assert.equal(recipe.status,200,'receita '+JSON.stringify(recipe.data));
const cash=await api('/api/restaurant/cash',{organizationId:org,action:'open',amountCents:10000},a.cookie);assert.equal(cash.status,201);
const payload={organizationId:org,requestId:randomUUID(),channel:'balcao',tableId:null,customerId:null,notes:'',items:[{menuItemId:productId,quantity:2,addons:[],notes:''}]};
const concurrent=await Promise.all([api('/api/restaurant/checkout',payload,a.cookie),api('/api/restaurant/checkout',payload,a.cookie)]);
assert.equal(concurrent[0].data.orderId,concurrent[1].data.orderId,'pedidos simultâneos');
const order=concurrent[0];assert.equal(order.status,201,'pedido '+JSON.stringify(order.data));
assert.equal((await api('/api/restaurant/checkout',payload,a.cookie)).data.orderId,order.data.orderId);
for(const status of ['preparando','pronto','entregue']){const r=await api('/api/restaurant/kitchen',{organizationId:org,orderId:order.data.orderId,status},a.cookie,'PATCH');assert.equal(r.status,200,'cozinha '+JSON.stringify(r.data));}
const inventory=await api('/api/restaurant/inventory?organizationId='+org,null,a.cookie);assert.equal(Number(inventory.data.items[0].quantity),8);
const payment={organizationId:org,orderId:order.data.orderId,method:'dinheiro',amountCents:5000,requestId:randomUUID()};
for(const result of await Promise.all([api('/api/restaurant/payments',payment,a.cookie),api('/api/restaurant/payments',payment,a.cookie)]))assert.equal(result.status,201);
assert.equal((await api('/api/restaurant/payments',payment,a.cookie)).status,201);
assert.equal(Number((await api('/api/restaurant/order-detail?organizationId='+org+'&orderId='+order.data.orderId,null,a.cookie)).data.order.paid_cents),5000);
assert.equal((await api('/api/restaurant/cash',{organizationId:org,action:'close',sessionId:cash.data.id,amountCents:15000},a.cookie)).status,200);
const customer=await api('/api/restaurant/customers',{organizationId:org,name:'Cliente delivery teste',phone:'41999999999',email:'cliente@example.test'},a.cookie);assert.equal(customer.status,201);
const address=await api('/api/restaurant/addresses',{organizationId:org,customerId:customer.data.customer.id,street:'Rua Teste',number:'10',complement:'Fundos',reference:'Portão verde',neighborhood:'Centro',city:'Curitiba',state:'PR',postalCode:'80000000'},a.cookie);assert.equal(address.status,201);
const delivery=await api('/api/restaurant/checkout',{...payload,requestId:randomUUID(),channel:'delivery',customerId:customer.data.customer.id,deliveryAddressId:address.data.address.id,deliveryFeeCents:500},a.cookie);assert.equal(delivery.status,201);
for(const status of ['preparando','pronto'])assert.equal((await api('/api/restaurant/kitchen',{organizationId:org,orderId:delivery.data.orderId,status},a.cookie,'PATCH')).status,200);
for(const status of ['despachado','em_rota','falhou','despachado','em_rota','entregue']){const r=await api('/api/restaurant/delivery',{organizationId:org,orderId:delivery.data.orderId,status,...(status==='despachado'?{driverName:'Entregador teste',driverPhone:'41999999999'}:{})},a.cookie,'PATCH');assert.equal(r.status,200,'delivery '+JSON.stringify(r.data));}
const delivered=(await api('/api/restaurant/order-detail?organizationId='+org+'&orderId='+delivery.data.orderId,null,a.cookie)).data;
assert.equal(Number(delivered.order.total_cents),5500);
const crossOrigin=await fetch(base+'/api/restaurant/customers',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example',Cookie:a.cookie},body:JSON.stringify({organizationId:org,name:'Bloqueado'})});assert.equal(crossOrigin.status,403);
assert.equal((await api('/api/auth-status')).data.passwordRecoveryAvailable,false);
assert.equal((await api('/api/auth/sign-out',{},b.cookie)).status,200);
assert.equal((await api('/api/organizations',null,b.cookie)).status,401);
const privateRoute=await fetch(base+'/painel',{redirect:'manual'});assert.equal(privateRoute.status,307);
await writeFile(new URL('../.validation-user.json',import.meta.url),JSON.stringify({email:a.email,password:a.password,org,order:order.data.orderId,cookie:a.cookie}),{mode:0o600});
console.log('PASS: cadastro, login, logout, sessões, rotas privadas, isolamento em APIs, produto, receita, pedido idempotente, cozinha, estoque, pagamento idempotente, fechamento, delivery, origem de requisições.');
