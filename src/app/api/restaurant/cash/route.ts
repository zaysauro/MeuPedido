import {withOrganizationAccess} from '@/lib/organization-access';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleGET(req: Request) {
 try {
  const session = await createAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({error:'unauthorized'},{status:401});
  const org = new URL(req.url).searchParams.get('organizationId');
  if (!org || !uuid.test(org)) return NextResponse.json({error:'invalid_organization'},{status:400});
  const sql = getDb();
  const sessions = await sql`SELECT s.id,s.opened_at,s.closed_at,s.opening_cents,s.counted_cents,s.opened_by,
    COALESCE((SELECT SUM(p.amount_cents) FROM restaurant_payments p WHERE p.organization_id=s.organization_id AND p.cash_session_id=s.id AND p.method='dinheiro'),0) AS cash_sales_cents,
    COALESCE((SELECT SUM(CASE WHEN m.kind='suprimento' THEN m.amount_cents ELSE -m.amount_cents END)
      FROM restaurant_cash_movements m WHERE m.organization_id=s.organization_id AND m.session_id=s.id),0) AS net_movements_cents
    FROM restaurant_cash_sessions s WHERE s.organization_id=${org}::uuid
    AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=s.organization_id AND m.user_id=${session.user.id})
    ORDER BY s.opened_at DESC LIMIT 30`;
  const methods=await sql`SELECT cash_session_id,method,sum(amount_cents)::bigint AS amount_cents FROM restaurant_payments WHERE organization_id=${org}::uuid AND cash_session_id IS NOT NULL GROUP BY cash_session_id,method`;
  const movements=await sql`SELECT id,session_id,kind,amount_cents,notes,created_at FROM restaurant_cash_movements WHERE organization_id=${org}::uuid ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({sessions,methods,movements});
 } catch {return NextResponse.json({error:'service_unavailable'},{status:503});}
}

async function handlePOST(req: Request) {
 try {
  const session = await createAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({error:'unauthorized'},{status:401});
  const body: unknown = await req.json();
  if (!body || typeof body!=='object' || Array.isArray(body)) return NextResponse.json({error:'invalid_body'},{status:400});
  const b = body as Record<string,unknown>;
  if (typeof b.organizationId!=='string' || !uuid.test(b.organizationId) || !['open','move','close'].includes(String(b.action))
    || !Number.isSafeInteger(b.amountCents) || Number(b.amountCents)<0 || Number(b.amountCents)>1000000000)
    return NextResponse.json({error:'invalid_fields'},{status:400});
  if (b.action!=='open' && (typeof b.sessionId!=='string' || !uuid.test(b.sessionId)))
    return NextResponse.json({error:'invalid_session'},{status:400});
  const sql = getDb();
  if (b.action==='open') {
   const rows=await sql`SELECT restaurant_cash_open(${b.organizationId}::uuid,${session.user.id},${b.amountCents as number}) AS id`;
   return NextResponse.json({id:rows[0].id},{status:201});
  }
  if (b.action==='close') {
   const rows=await sql`SELECT restaurant_cash_close(${b.organizationId}::uuid,${session.user.id},${b.sessionId as string}::uuid,${b.amountCents as number}) AS id`;
   return NextResponse.json({id:rows[0].id});
  }
  if (!['suprimento','sangria'].includes(String(b.kind)) || Number(b.amountCents)===0 || typeof b.notes!=='string' || b.notes.length>500)
   return NextResponse.json({error:'invalid_movement'},{status:400});
  const rows=await sql`SELECT restaurant_cash_move(${b.organizationId}::uuid,${session.user.id},${b.sessionId as string}::uuid,${b.kind as string},${b.amountCents as number},${b.notes as string}) AS id`;
  return NextResponse.json({id:rows[0].id},{status:201});
 } catch {return NextResponse.json({error:'cash_operation_rejected'},{status:409});}
}

export const GET = withOrganizationAccess(handleGET);

export const POST = withOrganizationAccess(handlePOST);
