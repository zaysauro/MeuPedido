import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const origin=request.headers.get('origin');
    if(!origin||![new URL(request.url).origin,process.env.BETTER_AUTH_URL].includes(origin))return NextResponse.json({error:'invalid_origin'},{status:403});
    const body: unknown = await request.json();
    const name = body && typeof body === 'object' && 'name' in body ? body.name : null;
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160)
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    const sql = getDb();
    const rows = await sql`SELECT onboard_establishment(${session.user.id},${name.trim()},${randomUUID()}) AS id,${name.trim()} AS name`;
    if (!rows[0]) return NextResponse.json({ error: 'create_failed' }, { status: 500 });
    return NextResponse.json({ organization: rows[0] }, { status: 201 });
  } catch (error) {
    if(error instanceof Error && error.message.includes('owner_establishment_limit'))return NextResponse.json({error:'Esta conta já possui um estabelecimento. Não é permitido cadastrar outro.'},{status:409});
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
