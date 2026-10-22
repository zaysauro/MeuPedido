import {createHash} from 'node:crypto';
import {headers} from 'next/headers';
import {NextResponse} from 'next/server';
import {createAuth} from '@/lib/auth';
import {readStaffBody,staffFailure,staffSession,StaffError} from '../staff/_shared';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const session=await createAuth().api.getSession({headers:await headers()});
  return NextResponse.json({user:session?{name:session.user.name,email:session.user.email}:null},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return staffFailure(error);}
}
export async function POST(request:Request){
 try{
  const {session,sql}=await staffSession(request);
  const body=await readStaffBody(request,['token']);
  if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.token))throw new StaffError('Convite inválido.');
  const hash=createHash('sha256').update(body.token).digest('hex');
  const result=await sql`SELECT restaurant_accept_staff_invitation(${session.user.id},${hash}) AS id`;
  const rows=await sql`SELECT role FROM organization_members WHERE organization_id=${result[0].id}::uuid AND user_id=${session.user.id} AND revoked_at IS NULL`;
  const destination=rows[0]?.role==='kitchen'?'/cozinha':rows[0]?.role==='waiter'?'/mesas':'/pdv';
  return NextResponse.json({ok:true,destination},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return staffFailure(error);}
}
