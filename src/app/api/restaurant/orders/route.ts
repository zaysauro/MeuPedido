import {withOrganizationAccess} from '@/lib/organization-access';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const err=(code:string,status=400)=>NextResponse.json({error:code},{status});
async function handlePOST(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return err('unauthorized',401);
 const b=await req.json() as Record<string,unknown>;
 const org=b.organizationId,channel=b.channel,table=b.tableId,customer=b.customerId;
 if(typeof org!=='string'||!uuid.test(org)||!['balcao','mesa','retirada'].includes(String(channel)))return err('invalid_fields');
 if(table!=null&&(typeof table!=='string'||!uuid.test(table)))return err('invalid_table');
 if(customer!=null&&(typeof customer!=='string'||!uuid.test(customer)))return err('invalid_customer');
 if(channel==='mesa'&&!table)return err('table_required');
 const sql=getDb();
 const rows=await sql`INSERT INTO restaurant_orders(organization_id,channel,table_id,customer_id,created_by,notes)
 SELECT m.organization_id,${channel as string},${(table as string)||null}::uuid,${(customer as string)||null}::uuid,${session.user.id},${typeof b.notes==='string'?b.notes.slice(0,1000):''}
 FROM organization_members m
 WHERE m.organization_id=${org}::uuid AND m.user_id=${session.user.id}
 AND (${(table as string)||null}::uuid IS NULL OR EXISTS(SELECT 1 FROM restaurant_tables t WHERE t.id=${(table as string)||null}::uuid AND t.organization_id=m.organization_id AND t.active))
 AND (${(customer as string)||null}::uuid IS NULL OR EXISTS(SELECT 1 FROM restaurant_customers c WHERE c.id=${(customer as string)||null}::uuid AND c.organization_id=m.organization_id))
 RETURNING id,order_number,status,channel`;
 if(!rows.length)return err('forbidden_or_invalid_reference',403);
 return NextResponse.json({order:rows[0]},{status:201});
 }catch{return err('service_unavailable',503)}
}

export const POST = withOrganizationAccess(handlePOST);

export const PATCH=withOrganizationAccess(async(req:Request)=>{
 try{const session=await createAuth().api.getSession({headers:await headers()});if(!session)return err('unauthorized',401);const b=await req.json();if(typeof b.orderId!=='string'||!uuid.test(b.orderId)||b.action!=='close')return err('invalid_fields');const sql=getDb();await sql`SELECT restaurant_close_order(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid)`;return NextResponse.json({closed:true});}catch{return err('A comanda deve estar entregue e sem saldo pendente.',409);}
});
