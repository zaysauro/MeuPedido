import {withOrganizationAccess} from '@/lib/organization-access';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET(req: Request) {
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
    const movements=await sql`SELECT m.id,i.name,m.movement_type,m.quantity,m.notes,m.created_at FROM restaurant_inventory_movements m JOIN restaurant_ingredients i ON i.id=m.ingredient_id AND i.organization_id=m.organization_id WHERE m.organization_id=${org}::uuid ORDER BY m.created_at DESC LIMIT 100`;
    return NextResponse.json({ items,movements });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

async function handlePOST(req: Request) {
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

export const GET = withOrganizationAccess(handleGET);

export const POST = withOrganizationAccess(handlePOST);

export const PATCH=withOrganizationAccess(async(req:Request)=>{try{const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});const b=await req.json();if(typeof b.ingredientId!=='string'||!uuid.test(b.ingredientId)||typeof b.costPerUnitCents!=='number'||!Number.isFinite(b.costPerUnitCents)||b.costPerUnitCents<0||b.costPerUnitCents>100000000)return NextResponse.json({error:'invalid_cost'},{status:400});const sql=getDb();const rows=await sql`UPDATE restaurant_ingredients SET cost_per_unit_cents=${b.costPerUnitCents} WHERE id=${b.ingredientId}::uuid AND organization_id=${b.organizationId}::uuid AND EXISTS(SELECT 1 FROM organization_members WHERE organization_id=${b.organizationId}::uuid AND user_id=${session.user.id} AND role IN ('owner','admin')) RETURNING id`;return NextResponse.json({ok:true},{status:rows.length?200:403});}catch{return NextResponse.json({error:'update_failed'},{status:400});}});
