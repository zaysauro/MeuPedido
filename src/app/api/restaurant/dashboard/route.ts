import {NextResponse} from 'next/server';
import {getDb} from '@/lib/db';
import {withOrganizationAccess} from '@/lib/organization-access';
export const dynamic='force-dynamic';
export const GET=withOrganizationAccess(async(req:Request)=>{
 const org=new URL(req.url).searchParams.get('organizationId')!;const sql=getDb();
 const [summary,states,products,stock,cash]=await Promise.all([
 sql`SELECT count(*) FILTER(WHERE status<>'cancelado')::integer AS orders,coalesce(sum(total_cents) FILTER(WHERE status<>'cancelado'),0)::bigint AS sales,coalesce(avg(total_cents) FILTER(WHERE status<>'cancelado'),0)::numeric AS average,(SELECT coalesce(sum(amount_cents),0) FROM restaurant_payments WHERE organization_id=${org}::uuid AND created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS received FROM restaurant_orders WHERE organization_id=${org}::uuid AND created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'`,
 sql`SELECT status,count(*)::integer AS count FROM restaurant_orders WHERE organization_id=${org}::uuid AND created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' GROUP BY status`,
 sql`SELECT i.name_snapshot AS name,sum(i.quantity)::integer AS units FROM restaurant_order_items i JOIN restaurant_orders o ON o.id=i.order_id AND o.organization_id=i.organization_id WHERE i.organization_id=${org}::uuid AND i.status<>'cancelado' AND o.status<>'cancelado' AND o.created_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' GROUP BY i.name_snapshot ORDER BY units DESC LIMIT 5`,
 sql`SELECT id,name,quantity,unit,minimum_quantity FROM restaurant_ingredients WHERE organization_id=${org}::uuid AND quantity<=minimum_quantity ORDER BY quantity LIMIT 8`,
 sql`SELECT id,opened_at FROM restaurant_cash_sessions WHERE organization_id=${org}::uuid AND closed_at IS NULL`
 ]);return NextResponse.json({summary:summary[0],states,products,stock,cash:cash[0]??null});
});
