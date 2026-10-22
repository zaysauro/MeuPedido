import 'server-only';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {getDb} from '@/lib/db';

export class StaffError extends Error {
 constructor(message:string,public status=400){super(message);}
}
export const staffRoles=['manager','cashier','waiter','kitchen'] as const;
export function staffOptions(body:Record<string,unknown>){
 if(typeof body.role!=='string'||!staffRoles.includes(body.role as typeof staffRoles[number])
 || !Array.isArray(body.permissions)||body.permissions.length>2
 ||body.permissions.some(p=>p!=='reports'&&p!=='manage')
 ||new Set(body.permissions).size!==body.permissions.length
 ||(body.role!=='manager'&&body.permissions.length>0))throw new StaffError('Escolha um perfil e permissões válidos.');
 return {role:body.role,permissions:body.permissions as string[]};
}
export async function staffSession(request:Request){
 if(request.method!=='GET'){
  const origin=request.headers.get('origin');
  if(!origin||![new URL(request.url).origin,process.env.BETTER_AUTH_URL].includes(origin))throw new StaffError('Origem não permitida.',403);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new StaffError('Formato inválido.',415);
 }
 const session=await createAuth().api.getSession({headers:await headers()});
 if(!session)throw new StaffError('Entre para continuar.',401);
 const sql=getDb();
 if(request.method!=='GET'){
  const rate=await sql`INSERT INTO restaurant_rate_limits(user_id) VALUES(${session.user.id})
   ON CONFLICT(user_id) DO UPDATE SET request_count=CASE WHEN restaurant_rate_limits.window_start<now()-interval '1 minute' THEN 1 ELSE restaurant_rate_limits.request_count+1 END,
   window_start=CASE WHEN restaurant_rate_limits.window_start<now()-interval '1 minute' THEN now() ELSE restaurant_rate_limits.window_start END RETURNING request_count`;
  if(Number(rate[0].request_count)>120)throw new StaffError('Muitas operações. Aguarde um minuto.',429);
 }
 return {session,sql};
}
export async function staffOwner(request:Request){
 const {session,sql}=await staffSession(request);
 const rows=await sql`SELECT organization_id FROM organization_members WHERE user_id=${session.user.id}
  AND organization_id=authorized_establishment(${session.user.id}) AND role='owner' AND revoked_at IS NULL`;
 if(!rows.length)throw new StaffError('Somente o proprietário pode gerenciar funcionários.',403);
 return {session,sql,organizationId:String(rows[0].organization_id)};
}
export async function readStaffBody(request:Request,keys:string[]){
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!keys.includes(key)))throw new StaffError('Dados inválidos.');
 return body as Record<string,unknown>;
}
export function staffFailure(error:unknown){
 if(error instanceof StaffError)return NextResponse.json({error:error.message},{status:error.status});
 const message=error instanceof Error?error.message:'';
 const known:[string,string,number][]=[
  ['forbidden','Seu perfil não permite esta operação.',403],
  ['invalid_invitation','Convite inválido ou destinado a outro e-mail.',400],
  ['invitation_expired','Este convite expirou ou foi revogado. Peça um novo ao proprietário.',410],
  ['membership_inactive','Seu acesso foi desativado. Consulte o proprietário.',403],
  ['account_already_assigned','Esta conta já possui vínculo com um estabelecimento. Procure a Kumo para regularização.',409],
  ['already_member','Você já tem vínculo com este estabelecimento. Peça ao proprietário para revisar seu acesso.',409],
  ['protected_member','O proprietário não pode ser alterado por esta operação.',403],
  ['invalid_staff_role','Perfil ou permissões inválidos.',400]
 ];
 for(const [code,text,status] of known)if(message.includes(code))return NextResponse.json({error:text},{status});
 return NextResponse.json({error:'Não foi possível concluir a operação. Tente novamente.'},{status:503});
}
