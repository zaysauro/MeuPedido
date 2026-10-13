import {withOrganizationAccess} from '@/lib/organization-access';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handlePOST(req:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b=await req.json() as Record<string,unknown>;
 if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId))
 return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT restaurant_cancel_order(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid) AS id`;
 return NextResponse.json({orderId:rows[0].id});
 }catch{return NextResponse.json({error:'order_cancellation_rejected'},{status:409})}
}

export const POST = withOrganizationAccess(handlePOST);
