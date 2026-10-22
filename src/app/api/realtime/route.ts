import { NextResponse } from 'next/server';
import { notificationPreferences, privateHeaders, realtimeIdentity, sealOperationalQueries } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const identity = await realtimeIdentity(request);
    if (identity instanceof Response) return identity;
    // SDK capabilities last 60 seconds. Never issue one that could outlive the login session.
    if (identity.sessionExpiresAt - Date.now() < 65_000) return NextResponse.json({ error: 'Sua sessão está terminando. Entre novamente.' }, { status: 401, headers: privateHeaders });
    const queries = await sealOperationalQueries(identity);
    if (!queries) return NextResponse.json({ error: 'Sincronização entre dispositivos ainda não configurada.', code: 'realtime_unconfigured' }, { status: 503, headers: privateHeaders });
    const preferences = await notificationPreferences(identity.organizationId, identity.userId);
    return NextResponse.json({ ...queries, preferences }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ error: 'Não foi possível conectar a sincronização.' }, { status: 503, headers: privateHeaders });
  }
}
