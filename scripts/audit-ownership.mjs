import pg from 'pg';
const client=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL,connectionTimeoutMillis:15000});
await client.connect();
try{
const owners=(await client.query("SELECT user_id,array_agg(organization_id ORDER BY organization_id) AS organization_ids,count(*)::int AS count FROM organization_members WHERE role='owner' GROUP BY user_id HAVING count(*)>1")).rows;
const memberships=(await client.query("SELECT user_id,count(*)::int AS count FROM organization_members GROUP BY user_id HAVING count(*)>1")).rows;
const subscriptions=(await client.query("SELECT provider_subscription_id,count(*)::int AS count FROM organization_subscriptions WHERE provider_subscription_id IS NOT NULL GROUP BY provider_subscription_id HAVING count(*)>1")).rows;
const counts=(await client.query("SELECT (SELECT count(*) FROM organizations)::int AS organizations,(SELECT count(*) FROM organization_members WHERE role='owner')::int AS owner_memberships,(SELECT count(*) FROM organization_subscriptions)::int AS subscriptions")).rows[0];
console.log(JSON.stringify({counts,multipleOwners:owners,multipleMemberships:memberships,sharedSubscriptions:subscriptions},null,2));
}finally{await client.end();}
