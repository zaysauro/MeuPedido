import {NextResponse} from 'next/server';
// Deliberately inactive: configure signature/token validation, durable event deduplication,
// provider verification and environment isolation before enabling the future integration.
export async function POST(){return NextResponse.json({error:'billing_integration_not_enabled'},{status:503});}
