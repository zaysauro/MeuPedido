import {NextResponse} from 'next/server';
import {emailConfigured} from '@/lib/email';
export const dynamic='force-dynamic';
export function GET(){return NextResponse.json({passwordRecoveryAvailable:emailConfigured(),emailVerificationRequired:emailConfigured()&&process.env.REQUIRE_EMAIL_VERIFICATION==='true'});}
