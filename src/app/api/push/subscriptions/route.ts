import {createHash} from 'node:crypto';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';
import {pushConfiguration} from '@/lib/push';
import {validPushSubscription} from '@/lib/push-validation.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(request:Request){
  if(request.method!=='GET'){
    const origin=request.headers.get('origin');
    if(!origin||![new URL(request.url).origin,process.env.BETTER_AUTH_URL].includes(origin))return {error:response({error:'Origem não permitida.'},403)};
    if(!request.headers.get('content-type')?.includes('application/json'))return {error:response({error:'Formato inválido.'},415)};
  }
  const session=await createAuth().api.getSession({headers:await headers()});
  if(!session)return {error:response({error:'Entre novamente para configurar notificações.'},401)};
  const sql=getDb();
  const rows=await sql`SELECT authorized_establishment(${session.user.id}) AS id`;
  if(!rows[0]?.id)return {error:response({error:'Estabelecimento não autorizado.'},403)};
  return {sql,userId:session.user.id,org:String(rows[0].id)};
}
export async function GET(request:Request){
  try{
    const state=await access(request);if(state.error)return state.error;
    const {sql,userId,org}=state;
    const devices=await sql`SELECT id,endpoint_hash AS "endpointHash",device_name AS "deviceName",updated_at AS "updatedAt" FROM restaurant_push_subscriptions WHERE organization_id=${org}::uuid AND user_id=${userId} ORDER BY updated_at DESC`;
    const {configured,publicKey}=pushConfiguration();
    return response({configured,publicKey,devices});
  }catch{return response({error:'Não foi possível consultar as notificações deste dispositivo.'},503);}
}
export async function POST(request:Request){
  try{
    const state=await access(request);if(state.error)return state.error;
    if(Number(request.headers.get('content-length')||0)>8192)return response({error:'Assinatura inválida.'},413);
    const text=await request.text();if(text.length>8192)return response({error:'Assinatura inválida.'},413);
    const body=JSON.parse(text);
    if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'Assinatura inválida.'},400);
    if(body.organizationId&&body.organizationId!==state.org)return response({error:'Estabelecimento não autorizado.'},403);
    if(body.consent!==true||!validPushSubscription(body.subscription))return response({error:'Confirme a ativação de notificações neste dispositivo.'},400);
    if(!pushConfiguration().configured)return response({error:'Web Push ainda não está configurado pelo administrador.'},503);
    const {sql,userId,org}=state,{endpoint,keys}=body.subscription;
    const name=typeof body.deviceName==='string'?body.deviceName.trim().slice(0,80):'Este dispositivo';
    const hash=createHash('sha256').update(endpoint).digest('hex');
    const result=await sql`SELECT restaurant_register_push_subscription(${userId},${endpoint},${hash},${keys.p256dh},${keys.auth},${name||'Este dispositivo'}) AS id`;
    return response({id:result[0].id,enabled:true},201);
  }catch(error){
    return response({error:error instanceof SyntaxError?'Assinatura inválida.':'Não foi possível ativar notificações.'},error instanceof SyntaxError?400:503);
  }
}
export async function DELETE(request:Request){
  try{
    const state=await access(request);if(state.error)return state.error;
    const body=await request.json().catch(()=>null);
    if(!body||typeof body.endpoint!=='string'||body.endpoint.length>2048)return response({error:'Dispositivo inválido.'},400);
    const {sql,userId,org}=state;
    await sql`DELETE FROM restaurant_push_subscriptions WHERE organization_id=${org}::uuid AND user_id=${userId} AND endpoint=${body.endpoint}`;
    return response({enabled:false});
  }catch{return response({error:'Não foi possível desativar notificações. Tente novamente.'},503);}
}
