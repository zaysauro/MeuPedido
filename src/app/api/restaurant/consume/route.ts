import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req:Request){
 try{
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const body:unknown=await req.json();
  if(!body||typeof body!=='object'||Array.isArray(body))return NextResponse.json({error:'invalid_body'},{status:400});
  const b=body as Record<string,unknown>;
  if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.orderId!=='string'||!uuid.test(b.orderId))
   return NextResponse.json({error:'invalid_fields'},{status:400});
  const sql=getDb();
  const rows=await sql`SELECT restaurant_consume_order_inventory(${b.organizationId}::uuid,${session.user.id},${b.orderId}::uuid) AS movements`;
  return NextResponse.json({movements:rows[0].movements});
 }catch{return NextResponse.json({error:'consumption_rejected'},{status:409})}
}
