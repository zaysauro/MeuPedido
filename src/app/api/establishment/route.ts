import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
import {accountEstablishment} from '@/lib/establishment';
async function handle(req:Request){try{
 const session=await createAuth().api.getSession({headers:await headers()});if(!session)return NextResponse.json({error:'unauthorized'},{status:401});
 const state=await accountEstablishment(session.user.id),org=state.organization;
 if(!org)return NextResponse.json({error:state.regularizationRequired?'Regularização de vínculos necessária.':'Conclua seu cadastro inicial.'},{status:409});
 if(org.role!=='owner')return NextResponse.json({error:'Somente o proprietário pode acessar as configurações.'},{status:403});
 const sql=getDb();
 if(req.method==='PATCH'){
  const origin=req.headers.get('origin');if(!origin||![new URL(req.url).origin,process.env.BETTER_AUTH_URL].includes(origin))return NextResponse.json({error:'invalid_origin'},{status:403});
  if(org.role!=='owner')return NextResponse.json({error:'Somente o proprietário pode editar o estabelecimento.'},{status:403});
  const b=await req.json();
  if(typeof b.name!=='string'||b.name.trim().length<2||b.name.trim().length>160||typeof b.phone!=='string'||b.phone.length>40||typeof b.address!=='string'||b.address.length>500||typeof b.receiptFooter!=='string'||b.receiptFooter.length>160)return NextResponse.json({error:'Confira nome, telefone, endereço e mensagem do comprovante.'},{status:400});
  if(b.organizationId&&b.organizationId!==org.id)return NextResponse.json({error:'Estabelecimento não autorizado.'},{status:403});
  await sql`WITH updated AS (UPDATE organizations SET name=${b.name.trim()},updated_at=now() WHERE id=${org.id}::uuid RETURNING id) INSERT INTO organization_settings(organization_id,phone,address,receipt_footer) SELECT id,${b.phone.trim()},${b.address.trim()},${b.receiptFooter.trim()} FROM updated ON CONFLICT(organization_id) DO UPDATE SET phone=EXCLUDED.phone,address=EXCLUDED.address,receipt_footer=EXCLUDED.receipt_footer,updated_at=now()`;
 }
 const rows=await sql`SELECT o.id,o.name,s.phone,s.address,s.receipt_footer,s.timezone,s.currency FROM organizations o JOIN organization_settings s ON s.organization_id=o.id WHERE o.id=${org.id}::uuid`;
 return NextResponse.json({establishment:rows[0],canEdit:org.role==='owner'});
}catch{return NextResponse.json({error:'Não foi possível acessar o estabelecimento.'},{status:503});}}
export const GET=handle;export const PATCH=handle;
