import 'server-only';
import {randomUUID} from 'node:crypto';
import webPush from 'web-push';
import {getDb} from './db';
import {pushCopy,validPushEndpoint} from './push-validation.mjs';

export function pushConfiguration() {
  const publicKey=process.env.VAPID_PUBLIC_KEY || '';
  const privateKey=process.env.VAPID_PRIVATE_KEY || '';
  const subject=process.env.VAPID_SUBJECT || '';
  const configured=/^[A-Za-z0-9_-]{87}$/.test(publicKey) &&
    /^[A-Za-z0-9_-]{43}$/.test(privateKey) && /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject);
  return {configured,publicKey:configured?publicKey:'',privateKey,subject};
}

/**
 * Durable notification delivery, called after commit and by the retry scheduler.
 * Provider acknowledgement means accepted by its push service, not displayed by the OS.
 * A lost acknowledgement may be retried: the worker uses a stable notification tag.
 */
export async function dispatchPushNotifications(limit=20) {
  const config=pushConfiguration();
  if(!config.configured)return {configured:false,sent:0,failed:0};
  const sql=getDb();
  const batchSize=Math.max(1,Math.min(50,Math.floor(limit)));
  await sql`
    INSERT INTO restaurant_push_deliveries(event_id,subscription_id,organization_id,user_id)
    SELECT n.event_id,s.id,s.organization_id,s.user_id
    FROM restaurant_notifications n
    JOIN restaurant_events e ON e.id=n.event_id AND e.organization_id=n.organization_id
    JOIN restaurant_push_subscriptions s ON s.organization_id=n.organization_id AND s.user_id=n.user_id
    JOIN restaurant_notification_preferences p ON p.organization_id=s.organization_id AND p.user_id=s.user_id AND p.push_enabled
    WHERE n.read_at IS NULL AND e.event_type IN ('order.created','order.items_added','kitchen.order_received','kitchen.order_ready') AND e.created_at>=s.created_at AND e.created_at>now()-interval '15 minutes'
      AND authorized_establishment(s.user_id)=s.organization_id
    ON CONFLICT DO NOTHING`;
  const lease=randomUUID();
  const rows=await sql`
    WITH claim AS (
      SELECT d.event_id,d.subscription_id FROM restaurant_push_deliveries d
      JOIN restaurant_push_subscriptions s ON s.id=d.subscription_id
      JOIN restaurant_events e ON e.id=d.event_id AND e.organization_id=s.organization_id
      JOIN restaurant_notifications n ON n.event_id=e.id AND n.organization_id=s.organization_id AND n.user_id=s.user_id
      JOIN restaurant_notification_preferences p ON p.organization_id=s.organization_id AND p.user_id=s.user_id AND p.push_enabled
      WHERE d.state='pending' AND d.attempts<6 AND d.next_attempt_at<=now()
        AND (d.lease_until IS NULL OR d.lease_until<now())
        AND n.read_at IS NULL AND e.created_at>now()-interval '15 minutes'
        AND authorized_establishment(s.user_id)=s.organization_id
      ORDER BY d.created_at LIMIT ${batchSize} FOR UPDATE OF d SKIP LOCKED
    ), claimed AS (
      UPDATE restaurant_push_deliveries d SET lease_token=${lease}::uuid,lease_until=now()+interval '1 minute',attempts=attempts+1
      FROM claim c WHERE d.event_id=c.event_id AND d.subscription_id=c.subscription_id RETURNING d.*
    )
    SELECT d.*,s.endpoint,s.p256dh,s.auth,s.organization_id,s.user_id,e.event_type
    FROM claimed d JOIN restaurant_push_subscriptions s ON s.id=d.subscription_id JOIN restaurant_events e ON e.id=d.event_id`;
  const results=await Promise.all(rows.map(async row=>{
    const eventId=String(row.event_id), subscriptionId=String(row.subscription_id);
    // Recheck eligibility after claiming, including device rebinding or membership removal.
    const active=await sql`
      SELECT 1 FROM restaurant_push_subscriptions s
      JOIN restaurant_notification_preferences p ON p.organization_id=s.organization_id AND p.user_id=s.user_id AND p.push_enabled
      JOIN restaurant_notifications n ON n.organization_id=s.organization_id AND n.user_id=s.user_id
      WHERE s.id=${subscriptionId}::uuid AND s.organization_id=${row.organization_id}::uuid AND s.user_id=${row.user_id}
        AND n.event_id=${eventId}::uuid AND n.read_at IS NULL AND authorized_establishment(s.user_id)=s.organization_id`;
    if(!active.length)return false;
    try {
      if(!validPushEndpoint(row.endpoint))throw Object.assign(new Error('invalid_push_endpoint'),{statusCode:410});
      await webPush.sendNotification({
        endpoint:String(row.endpoint),keys:{p256dh:String(row.p256dh),auth:String(row.auth)},
      },JSON.stringify({...pushCopy(String(row.event_type)),tag:`meupedido-${eventId}`,url:'/notificacoes'}),{
        vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey},
        TTL:120,timeout:6000,urgency:'high',
        // Repeated event delivery replaces the same provider message when supported.
        topic:eventId.replaceAll('-','').slice(0,32),
      });
      await sql`UPDATE restaurant_push_deliveries SET state='sent',sent_at=now(),lease_until=NULL,last_status=201 WHERE event_id=${eventId}::uuid AND subscription_id=${subscriptionId}::uuid AND lease_token=${lease}::uuid`;
      return true;
    } catch(error) {
      const status=typeof error==='object'&&error!==null&&'statusCode' in error?Number(error.statusCode):0;
      if(status===404||status===410){
        await sql`DELETE FROM restaurant_push_subscriptions WHERE id=${subscriptionId}::uuid AND organization_id=${row.organization_id}::uuid AND user_id=${row.user_id}`;
      }else{
        await sql`UPDATE restaurant_push_deliveries SET state=CASE WHEN attempts>=6 THEN 'failed' ELSE 'pending' END,
          next_attempt_at=now()+make_interval(secs=>LEAST(900,15*power(2,attempts)::integer)),lease_until=NULL,last_status=${status||null}
          WHERE event_id=${eventId}::uuid AND subscription_id=${subscriptionId}::uuid AND lease_token=${lease}::uuid`;
      }
      return false;
    }
  }));
  return {configured:true,sent:results.filter(Boolean).length,failed:results.filter(r=>!r).length};
}
