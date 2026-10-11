import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const b:unknown=await request.json();
 if(!b||typeof b!=='object')return NextResponse.json({error:'invalid_body'},{status:400});
 const v=b as Record<string,unknown>;
 if(typeof v.organizationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.organizationId)||typeof v.name!=='string'||v.name.trim().length<2||v.name.trim().length>160||!Number.isSafeInteger(v.priceCents)||Number(v.priceCents)<0||Number(v.priceCents)>100000000||typeof v.description!=='string'||v.description.length>1000)return NextResponse.json({error:'invalid_fields'},{status:400});
 const sql=getDb();
 const rows=await sql`INSERT INTO restaurant_menu_items(organization_id,name,description,price_cents)
 SELECT m.organization_id,${v.name.trim()},${v.description},${v.priceCents as number}
 FROM organization_members m WHERE m.organization_id=${v.organizationId}::uuid AND m.user_id=${session.user.id} AND m.role IN ('owner','admin')
 RETURNING id,name,price_cents`;
 if(!rows[0])return NextResponse.json({error:'forbidden'},{status:403});
 return NextResponse.json({item:rows[0]},{status:201});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503});}
}
