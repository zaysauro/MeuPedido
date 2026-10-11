import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const org = new URL(req.url).searchParams.get('organizationId');
    if (!org || !uuid.test(org)) return NextResponse.json({ error: 'invalid_organization' }, { status: 400 });
    const sql = getDb();
    const items = await sql`SELECT i.id, i.name, i.unit, i.quantity, i.minimum_quantity, i.cost_per_unit_cents,
      (i.quantity <= i.minimum_quantity) AS low_stock
      FROM restaurant_ingredients i
      WHERE i.organization_id = ${org}::uuid
      AND EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = i.organization_id AND m.user_id = ${session.user.id})
      ORDER BY i.name`;
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const b: unknown = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    const v = b as Record<string, unknown>;
    if (typeof v.organizationId !== 'string' || !uuid.test(v.organizationId)
      || typeof v.ingredientId !== 'string' || !uuid.test(v.ingredientId)
      || !['entrada', 'ajuste_positivo', 'ajuste_negativo'].includes(String(v.kind))
      || typeof v.quantity !== 'number' || !Number.isFinite(v.quantity) || v.quantity <= 0 || v.quantity > 100000000
      || typeof v.notes !== 'string' || v.notes.length > 500)
      return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
    const sql = getDb();
    const rows = await sql`SELECT restaurant_adjust_ingredient(
      ${v.organizationId}::uuid, ${session.user.id}, ${v.ingredientId}::uuid,
      ${v.kind as string}, ${v.quantity as number}, ${v.notes as string}) AS balance`;
    return NextResponse.json({ balance: rows[0].balance });
  } catch {
    return NextResponse.json({ error: 'movement_not_allowed' }, { status: 409 });
  }
}
