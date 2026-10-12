import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
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
  if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||!['balcao','mesa','retirada','delivery'].includes(String(b.channel))||typeof b.notes!=='string'||b.notes.length>1000||!Array.isArray(b.items)||b.items.length<1||b.items.length>100)return NextResponse.json({error:'invalid_fields'},{status:400});
  if((b.tableId!=null&&(typeof b.tableId!=='string'||!uuid.test(b.tableId)))||(b.customerId!=null&&(typeof b.customerId!=='string'||!uuid.test(b.customerId))))return NextResponse.json({error:'invalid_reference'},{status:400});
  for(const item of b.items){
   if(!item||typeof item!=='object'||Array.isArray(item))return NextResponse.json({error:'invalid_item'},{status:400});
   const v=item as Record<string,unknown>;
   if(typeof v.menuItemId!=='string'||!uuid.test(v.menuItemId)||!Number.isInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>99||typeof v.notes!=='string'||v.notes.length>500||!Array.isArray(v.addons)||v.addons.length>20||v.addons.some(x=>typeof x!=='string'||!uuid.test(x))||new Set(v.addons).size!==v.addons.length)return NextResponse.json({error:'invalid_item'},{status:400});
  }
  const sql=getDb();
  const delivery=b.channel==='delivery';
  if(delivery){
   if(typeof b.customerId!=='string'||!uuid.test(b.customerId)||typeof b.deliveryAddressId!=='string'||!uuid.test(b.deliveryAddressId)||!Number.isSafeInteger(b.deliveryFeeCents)||Number(b.deliveryFeeCents)<0||Number(b.deliveryFeeCents)>1000000)return NextResponse.json({error:'invalid_delivery'},{status:400});
  }else if(b.deliveryAddressId!=null||b.deliveryFeeCents!=null){
   return NextResponse.json({error:'unexpected_delivery_fields'},{status:400});
  }
  const rows=delivery
   ?await sql`SELECT restaurant_create_delivery_order(${b.organizationId}::uuid,${session.user.id},${b.customerId as string}::uuid,${b.deliveryAddressId as string}::uuid,${b.deliveryFeeCents as number},${b.notes as string},${JSON.stringify(b.items)}::jsonb) AS id`
   :await sql`SELECT restaurant_create_order(${b.organizationId}::uuid,${session.user.id},${b.channel as string},${(b.tableId as string)||null}::uuid,${(b.customerId as string)||null}::uuid,${b.notes as string},${JSON.stringify(b.items)}::jsonb) AS id`;
  return NextResponse.json({orderId:rows[0].id},{status:201});
 }catch{return NextResponse.json({error:'could_not_create_order'},{status:400})}
}
