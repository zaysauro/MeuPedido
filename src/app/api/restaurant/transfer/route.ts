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
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b=await req.json() as Record<string,unknown>;
 if([b.organizationId,b.itemId,b.targetOrderId].some(v=>typeof v!=='string'||!uuid.test(v)))return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT restaurant_transfer_order_item(${b.organizationId as string}::uuid,${session.user.id},${b.itemId as string}::uuid,${b.targetOrderId as string}::uuid) AS order_id`;
 return NextResponse.json({orderId:rows[0].order_id});
 }catch{return NextResponse.json({error:'transfer_not_allowed'},{status:409})}
}

export const POST = withOrganizationAccess(handlePOST);
