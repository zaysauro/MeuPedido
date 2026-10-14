import {withOrganizationAccess} from '@/lib/organization-access';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handleGET(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const q=new URL(req.url).searchParams,org=q.get('organizationId'),order=q.get('orderId');
 if(!org||!uuid.test(org)||!order||!uuid.test(order))return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT o.completed_at AS closed_at,o.id,o.order_number,o.channel,o.status,o.payment_status,o.subtotal_cents,o.discount_cents,o.total_cents,o.notes,o.table_id,o.customer_id,o.delivery_address_id,o.delivery_fee_cents,o.created_at,a.street AS delivery_street,a.number AS delivery_number,a.neighborhood AS delivery_neighborhood,a.city AS delivery_city,
 COALESCE((SELECT SUM(p.amount_cents) FROM restaurant_payments p WHERE p.organization_id=o.organization_id AND p.order_id=o.id),0) AS paid_cents
 FROM restaurant_orders o LEFT JOIN restaurant_customer_addresses a ON a.id=o.delivery_address_id AND a.organization_id=o.organization_id WHERE o.id=${order}::uuid AND o.organization_id=${org}::uuid
 AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.organization_id AND m.user_id=${session.user.id})`;
 if(!rows.length)return NextResponse.json({error:'not_found'},{status:404});
 const items=await sql`SELECT i.id,i.name_snapshot,i.quantity,i.unit_price_cents,i.addons_cents,i.notes,i.status,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.name_snapshot,'price_cents',a.price_cents)) FROM restaurant_order_item_addons a WHERE a.organization_id=i.organization_id AND a.order_item_id=i.id),'[]'::jsonb) AS addons
 FROM restaurant_order_items i WHERE i.organization_id=${org}::uuid AND i.order_id=${order}::uuid ORDER BY i.created_at`;
 const payments=await sql`SELECT id,method,amount_cents,created_at FROM restaurant_payments WHERE organization_id=${org}::uuid AND order_id=${order}::uuid ORDER BY created_at`;
 return NextResponse.json({order:rows[0],items,payments});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}

export const GET = withOrganizationAccess(handleGET);
