import { rawSql } from '@neon/realtime/server';
import type { OperationalNotification, OperationalVersion } from './realtime-events';

/** Call only with the identity resolved from Better Auth by the route handler. */
export function operationalQueries(identity: { organizationId: string; userId: string; sessionId: string }) {
  const params = [identity.organizationId, identity.userId, identity.sessionId];
  // Neon Live SQL currently rejects user-defined scalar functions. These joins are
  // the exact live equivalent of authorized_establishment(), checked again at renewal.
  const ownership = `JOIN organization_owner_claims c ON c.organization_id=m.organization_id
     JOIN organization_members owner ON owner.organization_id=c.organization_id AND owner.user_id=c.user_id AND owner.role='owner' AND owner.revoked_at IS NULL`;
  const uniqueMembership = `NOT EXISTS(SELECT 1 FROM organization_members other WHERE other.user_id=m.user_id AND other.organization_id<>m.organization_id)
     AND NOT EXISTS(SELECT 1 FROM organization_members other_owner WHERE other_owner.user_id=c.user_id AND other_owner.role='owner' AND other_owner.organization_id<>m.organization_id)`;
  const versions = rawSql<OperationalVersion>(
    `SELECT coalesce(v.version,0)::text AS version FROM organization_members m
     LEFT JOIN restaurant_live_versions v ON v.organization_id=m.organization_id
     JOIN "session" s ON s.id=$3 AND s."userId"=m.user_id
     ${ownership}
     WHERE m.organization_id=$1::uuid AND m.user_id=$2 AND m.revoked_at IS NULL
       AND ${uniqueMembership}`, params,
  );
  const notifications = rawSql<OperationalNotification>(
    `SELECT e.id,e.event_type,e.entity_id,e.created_at,n.read_at,o.order_number,t.label AS table_label
     FROM restaurant_notifications n
     JOIN restaurant_events e ON e.id=n.event_id AND e.organization_id=n.organization_id
     JOIN organization_members m ON m.organization_id=n.organization_id AND m.user_id=n.user_id AND m.revoked_at IS NULL
     JOIN "session" s ON s.id=$3 AND s."userId"=m.user_id
     LEFT JOIN restaurant_orders o ON o.id=e.entity_id AND o.organization_id=e.organization_id
     LEFT JOIN restaurant_tables t ON t.id=o.table_id AND t.organization_id=o.organization_id
     ${ownership}
     WHERE n.organization_id=$1::uuid AND n.user_id=$2 AND ${uniqueMembership}
       AND (m.role<>'kitchen' OR e.event_type LIKE 'order.%' OR e.event_type LIKE 'kitchen.%')
     ORDER BY e.created_at DESC,e.id DESC LIMIT 100`, params,
  );
  return { versions, notifications };
}
