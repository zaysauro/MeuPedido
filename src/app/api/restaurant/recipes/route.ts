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
    const q = new URL(req.url).searchParams;
    const org = q.get('organizationId'), item = q.get('menuItemId');
    if (!org || !uuid.test(org) || !item || !uuid.test(item))
      return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
    const sql = getDb();
    const ingredients = await sql`SELECT r.ingredient_id, r.quantity, i.name, i.unit, i.cost_per_unit_cents,
      (r.quantity * i.cost_per_unit_cents) AS cost_cents
      FROM restaurant_recipes r
      JOIN restaurant_ingredients i ON i.id = r.ingredient_id AND i.organization_id = r.organization_id
      WHERE r.organization_id = ${org}::uuid AND r.menu_item_id = ${item}::uuid
      AND EXISTS (SELECT 1 FROM organization_members m WHERE m.organization_id = r.organization_id AND m.user_id = ${session.user.id})
      ORDER BY i.name`;
    return NextResponse.json({ ingredients });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

async function handlePUT(req: Request) {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const b: unknown = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b))
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
    const v = b as Record<string, unknown>;
    if (typeof v.organizationId !== 'string' || !uuid.test(v.organizationId)
      || typeof v.menuItemId !== 'string' || !uuid.test(v.menuItemId)
      || !Array.isArray(v.ingredients) || v.ingredients.length > 100)
      return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
    const seen = new Set<string>();
    for (const ingredient of v.ingredients) {
      if (!ingredient || typeof ingredient !== 'object' || Array.isArray(ingredient))
        return NextResponse.json({ error: 'invalid_ingredient' }, { status: 400 });
      const i = ingredient as Record<string, unknown>;
      if (typeof i.ingredientId !== 'string' || !uuid.test(i.ingredientId)
        || seen.has(i.ingredientId) || typeof i.quantity !== 'number'
        || !Number.isFinite(i.quantity) || i.quantity <= 0 || i.quantity > 100000000)
        return NextResponse.json({ error: 'invalid_ingredient' }, { status: 400 });
      seen.add(i.ingredientId);
    }
    const sql = getDb();
    const rows = await sql`SELECT restaurant_set_recipe(
      ${v.organizationId}::uuid, ${session.user.id}, ${v.menuItemId}::uuid,
      ${JSON.stringify(v.ingredients)}::jsonb) AS count`;
    return NextResponse.json({ count: rows[0].count });
  } catch {
    return NextResponse.json({ error: 'recipe_not_saved' }, { status: 409 });
  }
}

export const GET = withOrganizationAccess(handleGET);

export const PUT = withOrganizationAccess(handlePUT);
