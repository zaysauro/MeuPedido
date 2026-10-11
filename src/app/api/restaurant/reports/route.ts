import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req:Request){
 try{
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const q=new URL(req.url).searchParams,org=q.get('organizationId'),start=q.get('start'),end=q.get('end');
  if(!org||!uuid.test(org)||!start||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!end||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)
   return NextResponse.json({error:'invalid_period'},{status:400});
  const sql=getDb();
  const access=await sql`SELECT 1 FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${session.user.id}`;
  if(!access.length)return NextResponse.json({error:'forbidden'},{status:403});
  const sales=await sql`SELECT count(*)::integer AS orders,coalesce(sum(total_cents),0)::bigint AS total_cents,
   coalesce(avg(total_cents),0)::numeric(14,2) AS average_cents,
   count(*) FILTER(WHERE payment_status='pago')::integer AS paid_orders
   FROM restaurant_orders WHERE organization_id=${org}::uuid AND status<>'cancelado'
   AND created_at>=${start}::date AND created_at<(${end}::date+interval '1 day')`;
  const methods=await sql`SELECT p.method,count(*)::integer AS payments,sum(p.amount_cents)::bigint AS amount_cents
   FROM restaurant_payments p JOIN restaurant_orders o ON o.id=p.order_id AND o.organization_id=p.organization_id
   WHERE p.organization_id=${org}::uuid AND p.created_at>=${start}::date
   AND p.created_at<(${end}::date+interval '1 day') AND o.status<>'cancelado'
   GROUP BY p.method ORDER BY amount_cents DESC`;
  const products=await sql`SELECT i.name_snapshot AS name,sum(i.quantity)::bigint AS units,
   sum((i.unit_price_cents+i.addons_cents)*i.quantity)::bigint AS amount_cents
   FROM restaurant_order_items i JOIN restaurant_orders o ON o.id=i.order_id AND o.organization_id=i.organization_id
   WHERE i.organization_id=${org}::uuid AND i.status<>'cancelado' AND o.status<>'cancelado'
   AND o.created_at>=${start}::date AND o.created_at<(${end}::date+interval '1 day')
   GROUP BY i.name_snapshot ORDER BY units DESC LIMIT 20`;
  return NextResponse.json({sales:sales[0],methods,products});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
