import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

/** Real HTTP checks against a locally served app connected to an isolated branch. */
export async function runStaffApiValidation(base='http://127.0.0.1:4320'){
 if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Staff validation must target the isolated local server.');
 const call=async(path,body,cookie,method=body?'POST':'GET',origin=base)=>{
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json().catch(()=>({})),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
 };
 const suffix=Date.now()+'-'+randomUUID().slice(0,6);
 const register=async(name)=>{
  const email=`staff-${suffix}-${name}@example.test`,password=randomUUID()+'Aa1!';
  const signup=await call('/api/auth/sign-up/email',{name:'Equipe teste '+name,email,password});
  assert.equal(signup.status,200,'signup '+name+': '+JSON.stringify(signup.data));
  const signin=await call('/api/auth/sign-in/email',{email,password});assert.equal(signin.status,200);assert.ok(signin.cookie);
  return {email,password,cookie:signin.cookie,id:signup.data.user.id};
 };
 assert.equal((await call('/api/staff')).status,401);
 const owner=await register('owner'),other=await register('other'),outsider=await register('outsider');
 const created=await call('/api/organizations/create',{name:'Homologação equipe '+suffix},owner.cookie);assert.equal(created.status,201);
 const org=created.data.organization.id;
 const otherCreated=await call('/api/organizations/create',{name:'Homologação outra equipe '+suffix},other.cookie);assert.equal(otherCreated.status,201);
 assert.equal((await call('/api/organizations/create',{name:'Outra empresa'},owner.cookie)).status,409,'proprietário não abre segunda empresa');
 const members={};
 for(const role of ['manager','cashier','waiter','kitchen']){
  const employee=await register(role);members[role]=employee;
  const invitation=await call('/api/staff',{email:employee.email,role,permissions:[]},owner.cookie);
  assert.equal(invitation.status,201,'invitation '+role+': '+JSON.stringify(invitation.data));
  const link=new URL(invitation.data.invitationUrl);assert.equal(link.pathname,'/convite');assert.equal(link.search,'','token não vai na URL HTTP');
  const token=new URLSearchParams(link.hash.slice(1)).get('token');assert.equal(token.length,43);
  assert.equal((await call('/api/invitations',{token},outsider.cookie)).status,400,'outro e-mail não aceita');
  const attempts=await Promise.all([1,2].map(()=>call('/api/invitations',{token},employee.cookie)));
  for(const accepted of attempts)assert.equal(accepted.status,200,'accept '+role+': '+JSON.stringify(accepted.data));
  assert.equal(attempts[0].data.destination,role==='kitchen'?'/cozinha':role==='waiter'?'/mesas':'/pdv');
  assert.equal((await call('/api/organizations',null,employee.cookie)).data.organizations[0].id,org);
  assert.equal((await call('/api/organizations/create',{name:'Empresa proibida'},employee.cookie)).status,409);
  assert.equal((await call('/api/staff',null,employee.cookie)).status,403,'lista equipe exclusiva proprietário');
  assert.equal((await call('/api/staff',{email:outsider.email,role:'manager',permissions:['manage']},employee.cookie)).status,403,'funcionário não pode promover');
 }
 const {manager,cashier,waiter,kitchen}=members;
 for(const employee of [cashier,waiter,kitchen])assert.equal((await call('/api/restaurant/dashboard',null,employee.cookie)).status,403,'sem relatório financeiro');
 assert.equal((await call('/api/restaurant/cash',null,cashier.cookie)).status,200);
 assert.equal((await call('/api/restaurant/cash',null,waiter.cookie)).status,403);
 assert.equal((await call('/api/restaurant/cash',null,kitchen.cookie)).status,403);
 assert.equal((await call('/api/restaurant/tables',null,waiter.cookie)).status,200);
 assert.equal((await call('/api/restaurant/kitchen',null,kitchen.cookie)).status,200);
 assert.equal((await call('/api/restaurant/tables?organizationId='+otherCreated.data.organization.id,null,waiter.cookie)).status,403);
 assert.equal((await call('/api/staff',{email:outsider.email,role:'owner',permissions:[]},owner.cookie)).status,400,'perfil proprietário não pode ser convidado');
 assert.equal((await call('/api/staff',{email:outsider.email,role:'waiter',permissions:['manage']},owner.cookie)).status,400,'permissão manipulada');
 assert.equal((await call('/api/staff',{email:outsider.email,role:'waiter',permissions:[],organizationId:otherCreated.data.organization.id},owner.cookie)).status,400,'org não é aceita do navegador');
 assert.equal((await call('/api/staff',{userId:owner.id,role:'manager',permissions:[],active:false},owner.cookie,'PATCH')).status,403,'proprietário protegido');
 assert.equal((await call('/api/staff',{email:outsider.email,role:'waiter',permissions:[]},owner.cookie,'POST','https://attacker.invalid')).status,403,'origem inválida');
 assert.equal((await call('/api/restaurant/dashboard',null,manager.cookie)).status,403,'gerente sem relatório por padrão');
 const product={name:'Produto teste gerente',description:'Homologação',priceCents:1000};
 assert.equal((await call('/api/menu/create',product,manager.cookie)).status,403,'gerente sem gestão por padrão');
 assert.equal((await call('/api/staff',{userId:manager.id,role:'manager',permissions:['reports','manage'],active:true},owner.cookie,'PATCH')).status,200);
 assert.equal((await call('/api/restaurant/dashboard',null,manager.cookie)).status,200,'relatório autorizado');
 const menu=await call('/api/menu/create',product,manager.cookie);assert.equal(menu.status,201,'produto autorizado: '+JSON.stringify(menu.data));
 const managed=await call('/api/menu/manage',{action:'update',itemId:menu.data.item.id,...product,imageUrl:'',categoryId:null,available:true},manager.cookie);assert.equal(managed.status,200,'gestão produto: '+JSON.stringify(managed.data));
 assert.equal((await call('/api/restaurant/addons',{menuItemId:menu.data.item.id,name:'Extra teste',priceCents:100},manager.cookie)).status,201);
 const ingredient=await call('/api/restaurant',{resource:'ingredients',name:'Ingrediente gerente',unit:'un',quantity:10,minimumQuantity:0},manager.cookie);assert.equal(ingredient.status,201);
 const updatedCost=await call('/api/restaurant/inventory',{ingredientId:ingredient.data.item.id,costPerUnitCents:50},manager.cookie,'PATCH');assert.equal(updatedCost.status,200,'custo gerente: '+JSON.stringify(updatedCost.data));
 const revokeInvite=await call('/api/staff',{email:outsider.email,role:'waiter',permissions:[]},owner.cookie);assert.equal(revokeInvite.status,201);
 assert.equal((await call('/api/staff',{invitationId:revokeInvite.data.id},other.cookie,'DELETE')).status,400,'convite não pertence ao outro proprietário');
 assert.equal((await call('/api/staff',{invitationId:revokeInvite.data.id},owner.cookie,'DELETE')).status,200);
 const revokedToken=new URLSearchParams(new URL(revokeInvite.data.invitationUrl).hash.slice(1)).get('token');
 assert.equal((await call('/api/invitations',{token:revokedToken},outsider.cookie)).status,410);
 const before=await call('/api/staff',null,owner.cookie);assert.equal(before.data.members.length,5);
 assert.equal((await call('/api/staff',{userId:waiter.id,role:'waiter',permissions:[],active:false},owner.cookie,'PATCH')).status,200);
 assert.equal((await call('/api/restaurant/tables',null,waiter.cookie)).status,401,'sessão encerrada após revogar');
 const signin=await call('/api/auth/sign-in/email',{email:waiter.email,password:waiter.password});assert.equal(signin.status,200);
 assert.equal((await call('/api/restaurant/tables',null,signin.cookie)).status,403,'login não restaura acesso revogado');
 assert.equal((await call('/api/organizations/create',{name:'Contornar revogação'},signin.cookie)).status,409);
 assert.equal((await call('/api/staff',null,owner.cookie)).data.members.length,5,'equipe e usuários preservados');
 assert.equal((await call('/api/staff',{userId:waiter.id,role:'waiter',permissions:[],active:true},owner.cookie,'PATCH')).status,200);
 assert.equal((await call('/api/restaurant/tables',null,signin.cookie)).status,200,'reativação do mesmo vínculo');
 console.log('PASS staff HTTP: contas individuais, convites concorrentes/idempotentes, perfis, grants do gerente, isolamento, origem, revogação de sessão, reativação e uma empresa por conta.');
 return {organizationId:org};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.MEUPEDIDO_ISOLATED_TESTS!=='true')throw Error('Set MEUPEDIDO_ISOLATED_TESTS=true only after connecting the local app to an isolated test branch.');
 await runStaffApiValidation(process.env.TEST_BASE_URL||'http://127.0.0.1:4320');
}
