import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {migrations} from '../scripts/migrations.mjs';
test('uma empresa: preservação legada, propriedade única, onboarding e assinatura isolada',async()=>{
 const db=new PGlite();try{
 const list=await migrations();for(const m of list.filter(m=>m.name<'027'))await db.exec(m.sql);
 await db.exec(`INSERT INTO "user"(id,name,email) VALUES('legacy','Legado','legacy@example.test'),('new','Novo','new@example.test'),('other','Outro','other@example.test');`);
 const one=async(s,p=[])=> (await db.query(s,p)).rows[0];
 const first=(await one("INSERT INTO organizations(name,slug) VALUES('Legado A','legacy-a') RETURNING id")).id;
 const second=(await one("INSERT INTO organizations(name,slug) VALUES('Legado B','legacy-b') RETURNING id")).id;
 for(const id of [first,second]){await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,'legacy','owner')",[id]);await db.query("INSERT INTO organization_subscriptions(organization_id,status,provider_subscription_id,provider_confirmed_at) VALUES($1,'active','old-shared',now())",[id]);}
 await db.exec(list.find(m=>m.name.startsWith('027')).sql);
 assert.equal((await one("SELECT count(*)::int AS n FROM organization_members WHERE user_id='legacy'")).n,2);
 assert.equal((await one("SELECT count(*)::int AS n FROM organization_subscriptions WHERE provider_subscription_id='old-shared'")).n,2);
 assert.equal((await one("SELECT authorized_establishment('legacy') AS id")).id,null);
 assert.equal((await one("SELECT count(*)::int AS n FROM organization_ownership_conflicts")).n,1);
 await assert.rejects(db.query("SELECT onboard_establishment('legacy','Terceira','third')"),/owner_establishment_limit/);
 const id=(await one("SELECT onboard_establishment('new','Minha empresa','new-company') AS id")).id;
 assert.equal((await one("SELECT authorized_establishment('new') AS id")).id,id);
 await assert.rejects(db.query("SELECT onboard_establishment('new','Segunda','second-company')"),/owner_establishment_limit/);
 const empty=(await one("INSERT INTO organizations(name,slug) VALUES('Sem dono','ownerless') RETURNING id")).id;
 await assert.rejects(db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,'new','owner')",[empty]),/owner_establishment_limit/);
 await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,'new','staff')",[empty]);
 await assert.rejects(db.query("UPDATE organization_members SET role='owner' WHERE organization_id=$1 AND user_id='new'",[empty]),/owner_establishment_limit/);
 assert.equal((await one("SELECT authorized_establishment('new') AS id")).id,null,'vínculos ambíguos não permitem alternância');
 await db.query("DELETE FROM organization_members WHERE organization_id=$1 AND user_id='new'",[empty]);
 const other=(await one("SELECT onboard_establishment('other','Outra empresa','other-company') AS id")).id;
 await db.query("INSERT INTO organization_subscriptions(organization_id,status,provider_subscription_id,provider_confirmed_at) VALUES($1,'active','sub-unique',now())",[id]);
 await assert.rejects(db.query("INSERT INTO organization_subscriptions(organization_id,status,provider_subscription_id,provider_confirmed_at) VALUES($1,'active','sub-unique',now())",[other]),/subscription_establishment_limit/);
 await assert.rejects(db.query("UPDATE organization_subscriptions SET organization_id=$1 WHERE organization_id=$2",[other,id]),/subscription_establishment_immutable/);
 await assert.rejects(db.query("UPDATE organization_subscriptions SET status='past_due' WHERE organization_id=$1",[first]),/regularization_required/);
 assert.equal((await one("SELECT count(*)::int AS n FROM organization_settings WHERE organization_id=$1",[id])).n,1);
 }finally{await db.close();}
});
