import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {migrations} from '../scripts/migrations.mjs';

test('funcionários: convite, perfil, isolamento, revogação e propriedade única no PostgreSQL',async()=>{
 const db=new PGlite();
 const one=async(query,params=[])=> (await db.query(query,params)).rows[0];
 const token=()=>createHash('sha256').update(randomUUID()).digest('hex');
 try{
  for(const migration of (await migrations()).filter(m=>Number(m.name.slice(0,3))<=29))await db.exec(migration.sql);
  for(const user of ['owner','other','manager','cashier','waiter','kitchen','wrong','expired','revoked','foreign'])await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$1,$2)',[user,user+'@example.test']);
  const org=(await one("SELECT onboard_establishment('owner','Meu restaurante','staff-test') AS id")).id;
  const other=(await one("SELECT onboard_establishment('other','Outro restaurante','staff-other') AS id")).id;
  const invite=async(email,role='waiter',permissions=[],actor='owner',organization=org)=>{
   const hash=token();const row=await one('SELECT restaurant_invite_staff($1,$2,$3,$4,$5,$6) AS id',[organization,actor,email,role,permissions,hash]);
   return {...row,hash};
  };
  const grant=async(user,role,permissions=[])=>{const invitation=await invite(user+'@example.test',role,permissions);await db.query('SELECT restaurant_accept_staff_invitation($1,$2)',[user,invitation.hash]);return invitation;};
  const waiter=await grant('waiter','waiter');
  assert.equal((await one("SELECT restaurant_accept_staff_invitation('waiter',$1) AS id",[waiter.hash])).id,org,'repetição do convite aceito é idempotente');
  assert.equal((await one("SELECT count(*)::int AS n FROM organization_members WHERE user_id='waiter'")).n,1);
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('wrong',$1)",[waiter.hash]),/invalid_invitation/);
  await assert.rejects(db.query("SELECT onboard_establishment('waiter','Empresa adicional','waiter-company')"),/owner_establishment_limit/);
  await assert.rejects(db.query("SELECT onboard_establishment('owner','Segunda','owner-second')"),/owner_establishment_limit/);
  await assert.rejects(invite('wrong@example.test','owner'),/invalid_invitation/);
  await assert.rejects(invite('wrong@example.test','waiter',['manage']),/invalid_invitation/);
  await assert.rejects(invite('wrong@example.test','manager',['staff']),/invalid_invitation/);
  await assert.rejects(invite('wrong@example.test','waiter',[],'waiter'),/forbidden/);
  await assert.rejects(invite('wrong@example.test','waiter',[],'other'),/forbidden/);
  await grant('manager','manager');await grant('cashier','cashier');await grant('kitchen','kitchen');
  const allowed={owner:['serve','prepare','deliver','cash','manage','reports','staff'],manager:['serve','prepare','deliver','cash'],cashier:['serve','deliver','cash'],waiter:['serve','deliver'],kitchen:['prepare']};
  for(const [user,permissions] of Object.entries(allowed))for(const permission of ['serve','prepare','deliver','cash','manage','reports','staff']){
   assert.equal((await one('SELECT restaurant_has_permission($1,$2,$3) AS allowed',[org,user,permission])).allowed,permissions.includes(permission),user+': '+permission);
   assert.equal((await one('SELECT restaurant_has_permission($1,$2,$3) AS allowed',[other,user,permission])).allowed,false,'isolamento: '+user+': '+permission);
  }
  await db.query("SELECT restaurant_update_staff($1,'owner','manager','manager',ARRAY['reports','manage'],true)",[org]);
  for(const permission of ['reports','manage'])assert.equal((await one("SELECT restaurant_has_permission($1,'manager',$2) AS allowed",[org,permission])).allowed,true);
  await assert.rejects(db.query("SELECT restaurant_update_staff($1,'manager','waiter','manager',ARRAY['reports'],true)",[org]),/forbidden/);
  await assert.rejects(db.query("SELECT restaurant_update_staff($1,'owner','owner','manager','{}',false)",[org]),/protected_member/);
  await assert.rejects(db.query("SELECT restaurant_update_staff($1,'owner','waiter','owner','{}',true)",[org]),/invalid_staff_role/);
  await db.query(`INSERT INTO "session"(id,token,"expiresAt","userId") VALUES('staff-session','opaque',now()+interval '1 day','waiter')`);
  await db.query("SELECT restaurant_update_staff($1,'owner','waiter','waiter','{}',false)",[org]);
  assert.equal((await one("SELECT count(*)::int AS n FROM \"user\" WHERE id='waiter'")).n,1,'usuário preservado');
  assert.equal((await one("SELECT count(*)::int AS n FROM organization_members WHERE user_id='waiter'")).n,1,'vínculo histórico preservado');
  assert.equal((await one("SELECT count(*)::int AS n FROM \"session\" WHERE \"userId\"='waiter'")).n,0,'sessões revogadas');
  assert.equal((await one("SELECT authorized_establishment('waiter') AS id")).id,null);
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('waiter',$1)",[waiter.hash]),/membership_inactive/);
  await assert.rejects(db.query("SELECT onboard_establishment('waiter','Nova empresa','revoked-waiter')"),/owner_establishment_limit/);
  await db.query("SELECT restaurant_update_staff($1,'owner','waiter','waiter','{}',true)",[org]);
  assert.equal((await one("SELECT authorized_establishment('waiter') AS id")).id,org);
  const foreign=await invite('waiter@example.test','waiter',[],'other',other);
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('waiter',$1)",[foreign.hash]),/account_already_assigned/);
  const ownerInvite=await invite('other@example.test');
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('other',$1)",[ownerInvite.hash]),/account_already_assigned/);
  const expired=await invite('expired@example.test');
  await db.query("UPDATE restaurant_staff_invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('expired',$1)",[expired.hash]),/invitation_expired/);
  const revoked=await invite('revoked@example.test');
  await assert.rejects(db.query("SELECT restaurant_revoke_invitation($1,'other',$2)",[other,revoked.id]),/invalid_invitation/);
  await db.query("SELECT restaurant_revoke_invitation($1,'owner',$2)",[org,revoked.id]);
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('revoked',$1)",[revoked.hash]),/invitation_expired/);
  const superseded=await invite('wrong@example.test');
  const current=await invite('wrong@example.test','kitchen');
  await assert.rejects(db.query("SELECT restaurant_accept_staff_invitation('wrong',$1)",[superseded.hash]),/invitation_expired/);
  await db.query("SELECT restaurant_accept_staff_invitation('wrong',$1)",[current.hash]);
  assert.equal((await one("SELECT role FROM organization_members WHERE user_id='wrong'")).role,'kitchen');
  const audit=await one("SELECT count(*)::int AS n FROM restaurant_staff_audit WHERE organization_id=$1",[org]);
  assert.ok(audit.n>=15,'alterações importantes auditadas');
 }finally{await db.close();}
});
