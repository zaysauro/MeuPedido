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
 if(typeof b.requestId!=='string'||!uuid.test(b.requestId)||typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId)||!['dinheiro','pix','debito','credito','outro'].includes(String(b.method))||!Number.isSafeInteger(b.amountCents)||Number(b.amountCents)<=0||Number(b.amountCents)>1000000000)return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`SELECT * FROM restaurant_record_payment_once(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid,${b.method as string},${b.amountCents as number},${b.requestId as string}::uuid)`;
 return NextResponse.json({payment:rows[0]},{status:201});
 }catch{return NextResponse.json({error:'payment_not_accepted'},{status:400})}
}

export const POST = withOrganizationAccess(handlePOST);
