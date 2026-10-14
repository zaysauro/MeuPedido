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
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const org=new URL(req.url).searchParams.get('organizationId');
  if(!org||!uuid.test(org))return NextResponse.json({error:'invalid_organization'},{status:400});
  const sql=getDb();
  const rows=await sql`SELECT t.id,t.label,t.active,
   COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'order_number',o.order_number,'status',o.status,'payment_status',o.payment_status,'total_cents',o.total_cents,'created_at',o.created_at) ORDER BY o.created_at DESC) FILTER (WHERE o.id IS NOT NULL),'[]'::jsonb) AS orders
   FROM restaurant_tables t
   LEFT JOIN restaurant_open_orders o ON o.table_id=t.id AND o.organization_id=t.organization_id

   WHERE t.organization_id=${org}::uuid AND EXISTS
    (SELECT 1 FROM organization_members m WHERE m.organization_id=t.organization_id AND m.user_id=${session.user.id})
   GROUP BY t.id,t.label,t.active ORDER BY t.label`;
  return NextResponse.json({tables:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}

export const GET = withOrganizationAccess(handleGET);
