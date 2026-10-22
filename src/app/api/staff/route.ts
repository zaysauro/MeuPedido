import {createHash,randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
import {readStaffBody,staffFailure,staffOptions,staffOwner,StaffError} from './_shared';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 try{
  const {sql,organizationId}=await staffOwner(request);
  const [members,invitations]=await Promise.all([
   sql`SELECT m.user_id,u.name,u.email,m.role,m.revoked_at,
    COALESCE((SELECT jsonb_agg(permission ORDER BY permission) FROM restaurant_member_permissions p WHERE p.organization_id=m.organization_id AND p.user_id=m.user_id),'[]'::jsonb) AS permissions
    FROM organization_members m JOIN "user" u ON u.id=m.user_id WHERE m.organization_id=${organizationId}::uuid
    ORDER BY (m.role='owner') DESC,u.name,m.user_id`,
   sql`SELECT id,email,role,permissions,created_at,expires_at,revoked_at,accepted_at FROM restaurant_staff_invitations
    WHERE organization_id=${organizationId}::uuid ORDER BY created_at DESC LIMIT 100`
  ]);
  return NextResponse.json({members,invitations},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return staffFailure(error);}
}
export async function POST(request:Request){
 try{
  const {sql,session,organizationId}=await staffOwner(request);
  const body=await readStaffBody(request,['email','role','permissions']);
  const {role,permissions}=staffOptions(body);
  if(typeof body.email!=='string'||body.email.trim().length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))throw new StaffError('Informe um e-mail válido.');
  const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
  const result=await sql`SELECT restaurant_invite_staff(${organizationId}::uuid,${session.user.id},${body.email.trim().toLowerCase()},${role},${permissions}::text[],${hash}) AS id`;
  // Fragments never travel in HTTP request URLs or Referer headers.
  const link=new URL('/convite',process.env.BETTER_AUTH_URL||request.url);
  link.hash=new URLSearchParams({token}).toString();
  return NextResponse.json({id:result[0].id,invitationUrl:link.toString()},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){return staffFailure(error);}
}
export async function PATCH(request:Request){
 try{
  const {sql,session,organizationId}=await staffOwner(request);
  const body=await readStaffBody(request,['userId','role','permissions','active']);
  const {role,permissions}=staffOptions(body);
  if(typeof body.userId!=='string'||!body.userId||body.userId.length>200||typeof body.active!=='boolean')throw new StaffError('Dados do funcionário inválidos.');
  await sql`SELECT restaurant_update_staff(${organizationId}::uuid,${session.user.id},${body.userId},${role},${permissions}::text[],${body.active})`;
  return NextResponse.json({ok:true});
 }catch(error){return staffFailure(error);}
}
export async function DELETE(request:Request){
 try{
  const {sql,session,organizationId}=await staffOwner(request);
  const body=await readStaffBody(request,['invitationId']);
  if(typeof body.invitationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.invitationId))throw new StaffError('Convite inválido.');
  await sql`SELECT restaurant_revoke_invitation(${organizationId}::uuid,${session.user.id},${body.invitationId}::uuid)`;
  return NextResponse.json({ok:true});
 }catch(error){return staffFailure(error);}
}
