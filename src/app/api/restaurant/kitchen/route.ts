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
  const org=new URL(req.url).searchParams.get('organizationId');
  if(!org||!uuid.test(org))return NextResponse.json({error:'invalid_organization'},{status:400});
  const sql=getDb();
  const rows=await sql`SELECT o.id,o.order_number,o.channel,o.status,o.notes,o.created_at,t.label AS table_label,
  COALESCE(jsonb_agg(jsonb_build_object('name',i.name_snapshot,'quantity',i.quantity,'notes',i.notes,'addons',COALESCE((SELECT jsonb_agg(a.name_snapshot ORDER BY a.name_snapshot) FROM restaurant_order_item_addons a WHERE a.organization_id=i.organization_id AND a.order_item_id=i.id),'[]'::jsonb)) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
  FROM restaurant_orders o
  LEFT JOIN restaurant_tables t ON t.id=o.table_id AND t.organization_id=o.organization_id
  LEFT JOIN restaurant_order_items i ON i.order_id=o.id AND i.organization_id=o.organization_id AND i.status<>'cancelado'
  WHERE o.organization_id=${org}::uuid AND (o.status IN ('recebido','preparando','pronto') OR (o.status='entregue' AND o.updated_at>now()-interval '2 hours'))
  AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.organization_id AND m.user_id=${session.user.id})
  GROUP BY o.id,t.label ORDER BY o.created_at ASC LIMIT 100`;
  return NextResponse.json({orders:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
async function handlePATCH(req:Request){
 try{
  const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const b=await req.json() as Record<string,unknown>;
  if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId)||!['preparando','pronto','entregue'].includes(String(b.status)))return NextResponse.json({error:'invalid_fields'},{status:400});
  const sql=getDb();
  const rows=await sql`SELECT * FROM restaurant_kitchen_transition(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid,${b.status as string})`;
  return NextResponse.json({order:rows[0]});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const code=message.includes('insufficient_stock')?'insufficient_stock':message.includes('invalid_transition')?'invalid_transition':null;
  return NextResponse.json({error:code||'service_unavailable'},{status:code?409:503});
 }
}

export const GET = withOrganizationAccess(handleGET);

export const PATCH = withOrganizationAccess(handlePATCH);
