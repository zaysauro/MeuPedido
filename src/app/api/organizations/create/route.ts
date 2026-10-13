import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const body: unknown = await request.json();
    const name = body && typeof body === 'object' && 'name' in body ? body.name : null;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160)
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    const sql = getDb();
    // One atomic statement: create organization, its owner and settings together.
    const rows = await sql`
      WITH new_org AS (
        INSERT INTO organizations (name, slug)
        VALUES (${name.trim()}, ${randomUUID()})
        RETURNING id, name, slug
      ), new_member AS (
        INSERT INTO organization_members (organization_id, user_id, role)
        SELECT id, ${session.user.id}, 'owner' FROM new_org
        RETURNING organization_id
      ), new_settings AS (
        INSERT INTO organization_settings (organization_id)
        SELECT organization_id FROM new_member
        RETURNING organization_id
      )
      SELECT o.id, o.name, o.slug FROM new_org o
      JOIN new_settings s ON s.organization_id = o.id
    `;
    if (!rows[0]) return NextResponse.json({ error: 'create_failed' }, { status: 500 });
    return NextResponse.json({ organization: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
