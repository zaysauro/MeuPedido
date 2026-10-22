import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { notificationPreferences, privateHeaders, realtimeIdentity } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const identity = await realtimeIdentity(request);
    if (identity instanceof Response) return identity;
    const { organizationId: org, userId, role } = identity;
    const sql = getDb();
    const [notifications, unread, preferences] = await Promise.all([
      sql`SELECT e.id,e.event_type,e.entity_id,e.created_at,n.read_at,o.order_number,t.label AS table_label FROM restaurant_notifications n JOIN restaurant_events e ON e.id=n.event_id AND e.organization_id=n.organization_id LEFT JOIN restaurant_orders o ON o.id=e.entity_id AND o.organization_id=e.organization_id LEFT JOIN restaurant_tables t ON t.id=o.table_id AND t.organization_id=o.organization_id WHERE n.organization_id=${org}::uuid AND n.user_id=${userId} AND (${role}<>'kitchen' OR e.event_type LIKE 'order.%' OR e.event_type LIKE 'kitchen.%') ORDER BY e.created_at DESC,e.id DESC LIMIT 100`,
      sql`SELECT count(*)::int AS count FROM restaurant_notifications n JOIN restaurant_events e ON e.id=n.event_id AND e.organization_id=n.organization_id WHERE n.organization_id=${org}::uuid AND n.user_id=${userId} AND read_at IS NULL AND (${role}<>'kitchen' OR e.event_type LIKE 'order.%' OR e.event_type LIKE 'kitchen.%')`,
      notificationPreferences(org, userId),
    ]);
    return NextResponse.json({ notifications, unread: unread[0].count, preferences }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar os avisos.' }, { status: 503, headers: privateHeaders });
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await realtimeIdentity(request);
    if (identity instanceof Response) return identity;
    const body = await request.json().catch(() => null);
    if (!body || Object.keys(body).some(key => !['eventIds', 'soundEnabled'].includes(key))
      || (body.soundEnabled !== undefined && typeof body.soundEnabled !== 'boolean')
      || (body.eventIds !== undefined && (!Array.isArray(body.eventIds) || body.eventIds.length > 100 || body.eventIds.some((id: unknown) => typeof id !== 'string' || !uuid.test(id))))
      || (body.soundEnabled === undefined && body.eventIds === undefined)) {
      return NextResponse.json({ error: 'Avisos inválidos.' }, { status: 400, headers: privateHeaders });
    }
    const { organizationId: org, userId } = identity;
    const sql = getDb();
    if (body.eventIds?.length) {
      await sql`UPDATE restaurant_notifications SET read_at=coalesce(read_at,now()) WHERE organization_id=${org}::uuid AND user_id=${userId} AND event_id=ANY(${body.eventIds}::uuid[])`;
    }
    if (body.soundEnabled !== undefined) {
      await sql`INSERT INTO restaurant_notification_preferences(organization_id,user_id,sound_enabled) VALUES(${org}::uuid,${userId},${body.soundEnabled}) ON CONFLICT(organization_id,user_id) DO UPDATE SET sound_enabled=EXCLUDED.sound_enabled`;
    }
    return NextResponse.json({ ok: true }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: 'Não foi possível salvar os avisos.' }, { status: 503, headers: privateHeaders });
  }
}
