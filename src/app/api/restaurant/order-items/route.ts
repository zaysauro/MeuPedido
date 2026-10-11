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
 const q=new URL(req.url).searchParams,org=q.get('organizationId'),order=q.get('orderId');
 if(!org||!uuid.test(org)||!order||!uuid.test(order))return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT i.id,i.name_snapshot,i.quantity,i.unit_price_cents,i.addons_cents,i.notes,i.status FROM restaurant_order_items i
 WHERE i.organization_id=${org}::uuid AND i.order_id=${order}::uuid
 AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=i.organization_id AND m.user_id=${session.user.id})
 ORDER BY i.created_at`;
 return NextResponse.json({items:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
export async function POST(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b=await req.json() as Record<string,unknown>;
 if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId)||!Array.isArray(b.items)||b.items.length<1||b.items.length>100)return NextResponse.json({error:'invalid_fields'},{status:400});
 for(const x of b.items){if(!x||typeof x!=='object'||Array.isArray(x))return NextResponse.json({error:'invalid_item'},{status:400});const v=x as Record<string,unknown>;if(typeof v.menuItemId!=='string'||!uuid.test(v.menuItemId)||!Number.isInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>99||typeof v.notes!=='string'||v.notes.length>500||!Array.isArray(v.addons)||v.addons.length>20||v.addons.some(a=>typeof a!=='string'||!uuid.test(a))||new Set(v.addons).size!==v.addons.length)return NextResponse.json({error:'invalid_item'},{status:400})}
 const sql=getDb();
 const rows=await sql`SELECT * FROM restaurant_add_order_items(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid,${JSON.stringify(b.items)}::jsonb)`;
 return NextResponse.json({order:rows[0]},{status:201});
 }catch{return NextResponse.json({error:'order_not_editable'},{status:409})}
}
