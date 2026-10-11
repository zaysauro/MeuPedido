import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return NextResponse.json({ status: 'ok', database: 'connected' });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
