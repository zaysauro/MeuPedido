import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import {accountEstablishment} from '@/lib/establishment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await createAuth().api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const state=await accountEstablishment(session.user.id);
    return NextResponse.json({organizations:state.organization?[state.organization]:[],regularizationRequired:state.regularizationRequired,legacyOrganizations:state.regularizationRequired?state.organizations.map(o=>({id:o.id,name:o.name,role:o.role})):[]});
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
