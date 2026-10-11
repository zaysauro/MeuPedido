import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const org=new URL(req.url).searchParams.get('organizationId');
 if(!org||!uuid.test(org))return NextResponse.json({error:'invalid_organization'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT a.id,a.menu_item_id,a.name,a.price_cents,a.active FROM restaurant_addons a WHERE a.organization_id=${org}::uuid AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=a.organization_id AND m.user_id=${session.user.id}) ORDER BY a.name`;
 return NextResponse.json({addons:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
export async function POST(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b=await req.json() as Record<string,unknown>;
 if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.menuItemId!=='string'||!uuid.test(b.menuItemId)||typeof b.name!=='string'||b.name.trim().length<1||b.name.trim().length>100||!Number.isSafeInteger(b.priceCents)||Number(b.priceCents)<0||Number(b.priceCents)>10000000)return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`INSERT INTO restaurant_addons(organization_id,menu_item_id,name,price_cents)
 SELECT i.organization_id,i.id,${b.name.trim()},${b.priceCents as number} FROM restaurant_menu_items i
 JOIN organization_members m ON m.organization_id=i.organization_id AND m.user_id=${session.user.id} AND m.role IN ('owner','admin')
 WHERE i.organization_id=${b.organizationId}::uuid AND i.id=${b.menuItemId}::uuid RETURNING id,name,price_cents,menu_item_id`;
 if(!rows.length)return NextResponse.json({error:'forbidden'},{status:403});
 return NextResponse.json({addon:rows[0]},{status:201});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
