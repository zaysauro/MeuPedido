import 'server-only';
import { createRealtime } from '@neon/realtime/server';
import { NextResponse } from 'next/server';
import { createAuth } from './auth';
import { accountEstablishment } from './establishment';
import { databaseUrl, getDb } from './db';
import type { NotificationPreferences } from './realtime-events';
import { operationalQueries } from './realtime-queries';

export const privateHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function realtimeIdentity(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = [new URL(request.url).origin, process.env.BETTER_AUTH_URL];
  if ((origin && !allowed.includes(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: privateHeaders });
  }
  if (request.method !== 'GET' && (!origin || !request.headers.get('content-type')?.includes('application/json'))) {
    return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400, headers: privateHeaders });
  }
  const session = await createAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401, headers: privateHeaders });
  const { organization } = await accountEstablishment(session.user.id);
  if (!organization) return NextResponse.json({ error: 'Estabelecimento não autorizado.' }, { status: 403, headers: privateHeaders });
  return { userId: session.user.id, sessionId: session.session.id, sessionExpiresAt: new Date(session.session.expiresAt).getTime(), organizationId: String(organization.id), role: String(organization.role) };
}

export async function notificationPreferences(organizationId: string, userId: string): Promise<NotificationPreferences> {
  const rows = await getDb()`SELECT sound_enabled,push_enabled FROM restaurant_notification_preferences WHERE organization_id=${organizationId}::uuid AND user_id=${userId}`;
  return { sound_enabled: rows[0]?.sound_enabled === true, push_enabled: rows[0]?.push_enabled === true };
}

/** Every capability is bound to the existing session and live membership, never a browser org ID. */
export async function sealOperationalQueries(identity: { organizationId: string; userId: string; sessionId: string }) {
  const secret = process.env.NEON_REALTIME_SECRET;
  const url = process.env.NEON_REALTIME_URL;
  if (!secret || !url) return null;
  const realtime = createRealtime({ secret, db: decodeURIComponent(new URL(databaseUrl()).pathname.slice(1)), debugMode: false });
  const { versions, notifications } = operationalQueries(identity);
  const [versionQuery, notificationQuery] = await Promise.all([
    realtime.seal({ query: versions }), realtime.seal({ query: notifications }),
  ]);
  return { url, versionQuery, notificationQuery };
}
