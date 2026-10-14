import 'server-only';
import {NextResponse} from 'next/server';
import {headers} from 'next/headers';
import {createAuth} from './auth';
import {getDb} from './db';
export function withOrganizationAccess(handler:(request:Request)=>Promise<Response>){
 return async(request:Request)=>{
  try{
   if(request.method!=="GET"){
    const origin=request.headers.get("origin");
    const allowed=[new URL(request.url).origin,process.env.BETTER_AUTH_URL].filter(Boolean);
    if(!origin || !allowed.includes(origin))return NextResponse.json({error:"Origem não permitida."},{status:403});
    if(!request.headers.get("content-type")?.includes("application/json"))return NextResponse.json({error:"Formato inválido."},{status:415});
   }
   const session=await createAuth().api.getSession({headers:await headers()});
   if(!session)return NextResponse.json({error:'Entre para continuar.'},{status:401});
   const body=request.method==='GET'?null:await request.clone().json().catch(()=>null);
   const org=new URL(request.url).searchParams.get('organizationId')??body?.organizationId;
   if(typeof org!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(org))return NextResponse.json({error:'Estabelecimento inválido.'},{status:400});
   const sql=getDb();
   const member=await sql`SELECT role FROM organization_members WHERE organization_id=${org}::uuid AND user_id=${session.user.id}`;
   const authorized=await sql`SELECT authorized_establishment(${session.user.id}) AS id`;
   if(authorized[0]?.id!==org)return NextResponse.json({error:'Estabelecimento não autorizado para esta conta. Procure o suporte se houver vínculos antigos.'},{status:403});
   if(!member.length)return NextResponse.json({error:'Acesso não permitido.'},{status:403});
   if(request.method!=='GET'){
    const rate=await sql`INSERT INTO restaurant_rate_limits(user_id) VALUES(${session.user.id}) ON CONFLICT(user_id) DO UPDATE SET request_count=CASE WHEN restaurant_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE restaurant_rate_limits.request_count+1 END,window_start=CASE WHEN restaurant_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE restaurant_rate_limits.window_start END RETURNING request_count`;
    if(Number(rate[0].request_count)>120)return NextResponse.json({error:'Muitas operações. Aguarde um minuto.'},{status:429,headers:{'Retry-After':'60'}});
   }
   if(process.env.BILLING_ENFORCED==='true'){
    const homologation=(process.env.HOMOLOGATION_ORGANIZATION_IDS||'').split(',').includes(org);
    if(!homologation){const allowed=await sql`SELECT 1 FROM organization_subscriptions WHERE organization_id=${org}::uuid AND ((status='active' AND provider_confirmed_at IS NOT NULL AND EXISTS(SELECT 1 FROM organization_subscription_claims c WHERE c.provider_subscription_id=organization_subscriptions.provider_subscription_id AND c.organization_id=organization_subscriptions.organization_id) AND NOT EXISTS(SELECT 1 FROM organization_subscriptions other WHERE other.provider_subscription_id=organization_subscriptions.provider_subscription_id AND other.organization_id<>organization_subscriptions.organization_id)) OR (status='trial' AND trial_ends_at>now()))`;
    if(!allowed.length)return NextResponse.json({error:'Acesso suspenso. Consulte sua assinatura.'},{status:402});}
   }
   return handler(request);
  }catch{return NextResponse.json({error:'Serviço indisponível. Tente novamente.'},{status:503});}
 };
}
