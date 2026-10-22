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
 if(typeof b.requestId!=='string'||!uuid.test(b.requestId))return err('request_required');
 const {requestId,organizationId,...payload}=b;
 const rows=await sql`SELECT restaurant_open_order_once(${org}::uuid,${session.user.id},${requestId}::uuid,${JSON.stringify(payload)}::jsonb) AS id`;
 if(!rows.length)return err('forbidden_or_invalid_reference',403);
 return NextResponse.json({order:rows[0]},{status:201});
 }catch{return err('service_unavailable',503)}
}

export const POST = withOrganizationAccess(handlePOST);

export const PATCH=withOrganizationAccess(async(req:Request)=>{
 try{const session=await createAuth().api.getSession({headers:await headers()});if(!session)return err('unauthorized',401);const b=await req.json();if(typeof b.orderId!=='string'||!uuid.test(b.orderId)||b.action!=='close')return err('invalid_fields');const sql=getDb();await sql`SELECT restaurant_close_order(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid)`;return NextResponse.json({closed:true});}catch{return err('A comanda deve estar entregue e sem saldo pendente.',409);}
});
