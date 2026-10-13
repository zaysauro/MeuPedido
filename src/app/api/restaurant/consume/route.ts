import {withOrganizationAccess} from '@/lib/organization-access';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handlePOST(){return NextResponse.json({error:'O estoque é consumido automaticamente ao iniciar o preparo.'},{status:409});}
export const POST=withOrganizationAccess(handlePOST);
