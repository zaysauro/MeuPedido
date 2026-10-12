import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  try {
    const session=await createAuth().api.getSession({headers:await headers()});
    if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
    const orgId=new URL(request.url).searchParams.get('organizationId');
    if(!orgId || !/^[0-9a-f-]{36}$/i.test(orgId))return NextResponse.json({error:'invalid_organization'},{status:400});
    const sql=getDb();
    const rows=await sql`
      SELECT i.id,i.name,i.description,i.price_cents,i.image_url,i.available,i.category_id,
             c.name AS category_name
      FROM restaurant_menu_items i
      LEFT JOIN restaurant_categories c
        ON c.id=i.category_id AND c.organization_id=i.organization_id
      WHERE i.organization_id=${orgId}::uuid
        AND EXISTS (
          SELECT 1 FROM organization_members m
          WHERE m.organization_id=i.organization_id AND m.user_id=${session.user.id}
        )
      ORDER BY c.sort_order NULLS LAST,i.name
    `;
    return NextResponse.json({items:rows});
  }catch{return NextResponse.json({error:'service_unavailable'},{status:503});}
}
