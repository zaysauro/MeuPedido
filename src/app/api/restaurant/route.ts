import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return bad('unauthorized',401);
 const q=new URL(req.url).searchParams,org=q.get('organizationId'),resource=q.get('resource');
 if(!org||!uuid.test(org))return bad('invalid_organization');
 const sql=getDb();
 const member=await sql`SELECT role FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${session.user.id}`;
 if(!member.length)return bad('forbidden',403);
 if(resource==='tables')return NextResponse.json({items:await sql`SELECT id,label,active FROM restaurant_tables WHERE organization_id=${org}::uuid ORDER BY label`});
 if(resource==='customers')return NextResponse.json({items:await sql`SELECT id,name,phone,notes FROM restaurant_customers WHERE organization_id=${org}::uuid ORDER BY name LIMIT 500`});
 if(resource==='ingredients')return NextResponse.json({items:await sql`SELECT id,name,unit,quantity,minimum_quantity FROM restaurant_ingredients WHERE organization_id=${org}::uuid ORDER BY name`});
 if(resource==='categories')return NextResponse.json({items:await sql`SELECT id,name,sort_order FROM restaurant_categories WHERE organization_id=${org}::uuid ORDER BY sort_order,name`});
 if(resource==='orders')return NextResponse.json({items:await sql`SELECT o.id,o.order_number,o.channel,o.status,o.payment_status,o.total_cents,o.created_at,t.label AS table_label FROM restaurant_orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id AND t.organization_id=o.organization_id WHERE o.organization_id=${org}::uuid ORDER BY o.created_at DESC LIMIT 150`});
 return bad('unknown_resource');
 }catch{return bad('service_unavailable',503)}
}
export async function POST(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return bad('unauthorized',401);
 const b=await req.json() as Record<string,unknown>,org=b.organizationId;
 if(typeof org!=='string'||!uuid.test(org))return bad('invalid_organization');
 const sql=getDb();
 const members=await sql`SELECT role FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${session.user.id}`;
 if(!members.length)return bad('forbidden',403);
 if(!['owner','admin'].includes(String(members[0].role)))return bad('forbidden',403);
 const name=typeof b.name==='string'?b.name.trim():'';
 if(b.resource==='tables'){
 if(name.length<1||name.length>60)return bad('invalid_name');
 const rows=await sql`INSERT INTO restaurant_tables(organization_id,label) VALUES(${org}::uuid,${name}) ON CONFLICT(organization_id,label) DO UPDATE SET active=true RETURNING id,label,active`;
 return NextResponse.json({item:rows[0]},{status:201});
 }
 if(b.resource==='categories'){
 if(name.length<1||name.length>100)return bad('invalid_name');
 const rows=await sql`INSERT INTO restaurant_categories(organization_id,name) VALUES(${org}::uuid,${name}) RETURNING id,name`;
 return NextResponse.json({item:rows[0]},{status:201});
 }
 if(b.resource==='customers'){
 if(name.length<1||name.length>160||typeof b.phone!=='string'||b.phone.length>40)return bad('invalid_fields');
 const rows=await sql`INSERT INTO restaurant_customers(organization_id,name,phone) VALUES(${org}::uuid,${name},${b.phone}) RETURNING id,name,phone`;
 return NextResponse.json({item:rows[0]},{status:201});
 }
 if(b.resource==='ingredients'){
 const unit=b.unit,quantity=b.quantity,minimum=b.minimumQuantity;
 if(name.length<1||name.length>160||!['g','kg','ml','l','un'].includes(String(unit))||typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<0||typeof minimum!=='number'||!Number.isFinite(minimum)||minimum<0)return bad('invalid_fields');
 const rows=await sql`INSERT INTO restaurant_ingredients(organization_id,name,unit,quantity,minimum_quantity) VALUES(${org}::uuid,${name},${unit as string},${quantity},${minimum}) RETURNING id,name,unit,quantity,minimum_quantity`;
 return NextResponse.json({item:rows[0]},{status:201});
 }
 return bad('unknown_resource');
 }catch{return bad('service_unavailable',503)}
}
