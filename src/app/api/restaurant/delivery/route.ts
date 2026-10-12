import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const org=new URL(req.url).searchParams.get('organizationId');
 if(!org||!uuid.test(org))return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT o.id,o.order_number,o.status AS kitchen_status,o.payment_status,o.created_at,
 c.name AS customer_name,c.phone AS customer_phone,
 a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.postal_code,a.reference,
 o.delivery_fee_cents,o.total_cents,COALESCE(t.status,'aguardando') AS delivery_status,t.driver_name,t.driver_phone,t.dispatched_at,t.delivered_at
 FROM restaurant_orders o
 LEFT JOIN restaurant_customers c ON c.id=o.customer_id AND c.organization_id=o.organization_id
 LEFT JOIN restaurant_customer_addresses a ON a.id=o.delivery_address_id AND a.organization_id=o.organization_id
 LEFT JOIN restaurant_delivery_tracking t ON t.order_id=o.id AND t.organization_id=o.organization_id
 WHERE o.organization_id=${org}::uuid AND o.channel='delivery'
 AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.organization_id AND m.user_id=${session.user.id})
 ORDER BY o.created_at DESC LIMIT 150`;
 return NextResponse.json({deliveries:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
export async function PATCH(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b=await req.json() as Record<string,unknown>;
 if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId)
 ||!['despachado','em_rota','entregue','falhou'].includes(String(b.status))
 ||(b.driverName!=null&&(typeof b.driverName!=='string'||b.driverName.length>120))
 ||(b.driverPhone!=null&&(typeof b.driverPhone!=='string'||b.driverPhone.length>40)))
 return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT restaurant_update_delivery(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid,${b.status as string},${String(b.driverName||'')},${String(b.driverPhone||'')}) AS status`;
 return NextResponse.json({status:rows[0].status});
 }catch{return NextResponse.json({error:'delivery_transition_rejected'},{status:409})}
}
