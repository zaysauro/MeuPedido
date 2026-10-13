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
  const q=new URL(req.url).searchParams,org=q.get('organizationId'),customer=q.get('customerId');
  if(!org||!uuid.test(org)||!customer||!uuid.test(customer))return NextResponse.json({error:'invalid_fields'},{status:400});
  const sql=getDb();
  const rows=await sql`SELECT a.id,a.label,a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.postal_code,a.reference
   FROM restaurant_customer_addresses a
   WHERE a.organization_id=${org}::uuid AND a.customer_id=${customer}::uuid
    AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=a.organization_id AND m.user_id=${session.user.id})
   ORDER BY a.created_at DESC LIMIT 30`;
  return NextResponse.json({addresses:rows});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}
async function handlePOST(req:Request){
 try{
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
  const b=await req.json() as Record<string,unknown>;
  if(typeof b.organizationId!=='string'||!uuid.test(b.organizationId)||typeof b.customerId!=='string'||!uuid.test(b.customerId))return NextResponse.json({error:'invalid_fields'},{status:400});
  const field=(key:string,max:number)=>typeof b[key]==='string'&&(b[key] as string).trim().length>0&&(b[key] as string).trim().length<=max;
  if(!field('street',180)||!field('number',30)||!field('neighborhood',120)||!field('city',120)||!field('state',2)||!field('postalCode',9))return NextResponse.json({error:'invalid_address'},{status:400});
  if(!/^[0-9]{8}$/.test(String(b.postalCode).replace(/-/g,''))||!/^[A-Za-z]{2}$/.test(String(b.state)))return NextResponse.json({error:'invalid_address'},{status:400});
  const sql=getDb();
  const rows=await sql`INSERT INTO restaurant_customer_addresses(organization_id,customer_id,label,street,number,complement,neighborhood,city,state,postal_code,reference)
   SELECT c.organization_id,c.id,${String(b.label||'Principal').slice(0,60)},${String(b.street).trim()},${String(b.number).trim()},${String(b.complement||'').slice(0,160)},${String(b.neighborhood).trim()},${String(b.city).trim()},${String(b.state).toUpperCase()},${String(b.postalCode).replace(/-/g,'')},${String(b.reference||'').slice(0,300)}
   FROM restaurant_customers c
   JOIN organization_members m ON m.organization_id=c.organization_id AND m.user_id=${session.user.id}
   WHERE c.organization_id=${b.organizationId}::uuid AND c.id=${b.customerId}::uuid
   RETURNING id,customer_id,street,number,city,state`;
  if(!rows.length)return NextResponse.json({error:'forbidden_or_missing_customer'},{status:403});
  return NextResponse.json({address:rows[0]},{status:201});
 }catch{return NextResponse.json({error:'service_unavailable'},{status:503})}
}

export const GET = withOrganizationAccess(handleGET);

export const POST = withOrganizationAccess(handlePOST);
