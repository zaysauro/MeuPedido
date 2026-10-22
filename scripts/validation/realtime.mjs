// Actual Neon WebSocket validation. Run ONLY with the isolated validation branch.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import pg from 'pg';
import { createRealtime } from '@neon/realtime/server';
import { createRealtimeClient } from '@neon/realtime/client';

const url = process.env.DATABASE_URL;
assert.equal(new URL(url).hostname, process.env.EXPECTED_DATABASE_HOST);
assert.match(process.env.NEON_REALTIME_URL || '', /br-still-recipe-b4wec14a/);
const source = await readFile(new URL('../../src/lib/realtime-queries.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
  .replaceAll("'@neon/realtime/server'", JSON.stringify(import.meta.resolve('@neon/realtime/server')));
const { operationalQueries } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const db = new pg.Client({ connectionString: url });
const realtime = createRealtime({ secret: process.env.NEON_REALTIME_SECRET, db: 'neondb', debugMode: true });
const clients = Array.from({ length: 5 }, () => createRealtimeClient({ url: process.env.NEON_REALTIME_URL }));
const prefix = `ws-${randomUUID()}`;
const identities = [];
const waitFor = (subscription, check) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { off(); reject(Error('Realtime snapshot timeout')); }, 30_000);
  const inspect = snapshot => {
    if (snapshot.status === 'error') { clearTimeout(timer); off(); reject(Error(snapshot.error.message + ' | ' + snapshot.error.code + ' | ' + (snapshot.error.sqlState || ''))); }
    else if (snapshot.status === 'live' && snapshot.data && check(snapshot.data)) { clearTimeout(timer); off(); resolve(snapshot.data); }
  };
  let off = () => {};
  off = subscription.onChange(inspect);
  inspect(subscription.getSnapshot());
});
try {
  await db.connect();
  for (const role of ['owner', 'cashier', 'kitchen', 'waiter']) {
    const userId = `${prefix}-${role}`, sessionId = randomUUID();
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [userId, `Realtime test ${role}`, `${userId}@example.test`]);
    identities.push({ userId, sessionId });
  }
  const org = (await db.query('SELECT onboard_establishment($1,$2,$3) AS id', [identities[0].userId, 'Realtime isolated validation', prefix])).rows[0].id;
  for (let index = 0; index < identities.length; index++) {
    const identity = identities[index];
    identity.organizationId = org;
    if (index) await db.query('INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)', [org, identity.userId, ['owner', 'cashier', 'kitchen', 'waiter'][index]]);
    await db.query('INSERT INTO "session"(id,token,"userId","expiresAt") VALUES($1,$2,$3,now()+interval \'1 hour\')', [identity.sessionId, randomUUID(), identity.userId]);
  }
  const subscriptions = await Promise.all(identities.map(async (identity, index) => clients[index].subscribe(await realtime.seal({ query: operationalQueries(identity).versions }))));
  await Promise.all(subscriptions.map(subscription => waitFor(subscription, rows => rows.length === 1 && rows[0].version === '0')));
  console.log('PASS: four authorized sessions receive initial snapshot');
  await db.query("SELECT restaurant_emit($1,'table.updated',$2::uuid)", [org, randomUUID()]);
  await Promise.all(subscriptions.map(subscription => waitFor(subscription, rows => rows[0]?.version === '1')));
  console.log('PASS: committed event reaches all four sessions without polling');
  await db.query('BEGIN');
  await db.query("SELECT restaurant_emit($1,'table.updated',$2::uuid)", [org, randomUUID()]);
  await db.query('ROLLBACK');
  assert.ok(subscriptions.every(subscription => subscription.getSnapshot().data[0].version === '1'));
  console.log('PASS: rolled-back transaction leaves persisted and live versions unchanged');
  const denied = clients[4].subscribe(await realtime.seal({ query: operationalQueries({ ...identities[0], organizationId: randomUUID() }).versions }));
  await waitFor(denied, rows => rows.length === 0);
  console.log('PASS: another establishment has no rows');
  const notices = await Promise.all(identities.map(async (identity, index) => clients[index].subscribe(await realtime.seal({ query: operationalQueries(identity).notifications }))));
  await Promise.all(notices.map(subscription => waitFor(subscription, rows => rows.length === 0)));
  await db.query("SELECT restaurant_emit($1,'order.created',$2::uuid)", [org, randomUUID()]);
  await Promise.all(notices.slice(0,3).map(subscription => waitFor(subscription, rows => rows.length === 1)));
  assert.equal(notices[3].getSnapshot().data.length,0,'unassigned waiter is not notified');
  console.log('PASS: owner, cashier and kitchen receive notification, uninvolved waiter does not');
  await db.query('UPDATE restaurant_notifications SET read_at=now() WHERE organization_id=$1 AND user_id=$2', [org,identities[0].userId]);
  await waitFor(notices[0], rows => rows[0]?.read_at !== null);
  assert.equal(notices[1].getSnapshot().data[0].read_at,null,'reading does not mark another employee notification');
  console.log('PASS: read state is persisted and private to each employee');
  await subscriptions[0].renew(await realtime.seal({query:operationalQueries(identities[0]).versions}));
  await waitFor(subscriptions[0], rows => rows[0]?.version === '2');
  clients[1].close();
  await db.query("SELECT restaurant_emit($1,'table.updated',$2::uuid)", [org,randomUUID()]);
  clients[1]=createRealtimeClient({url:process.env.NEON_REALTIME_URL});
  const recovered=clients[1].subscribe(await realtime.seal({query:operationalQueries(identities[1]).versions}));
  await waitFor(recovered, rows => rows[0]?.version === '3');
  console.log('PASS: capability renewal retains subscription and reconnect recovers missed state');
  await db.query('UPDATE organization_members SET revoked_at=now() WHERE organization_id=$1 AND user_id=$2', [org, identities[3].userId]);
  await waitFor(subscriptions[3], rows => rows.length === 0);
  console.log('PASS: membership revocation removes live access');
  await db.query('UPDATE "session" SET "userId"=$2 WHERE id=$1', [identities[2].sessionId, identities[0].userId]);
  await waitFor(subscriptions[2], rows => rows.length === 0);
  console.log('PASS: session no longer belongs to subscriber, rows disappear');
  console.log('Fixture retained only in isolated branch, prefix:', prefix);
} finally {
  for (const client of clients) client.close();
  await db.end();
}
// Node's built-in WebSocket may retain its close-handshake timer after every
// assertion and explicit close has completed. This test owns no remaining work.
process.exit(0);
