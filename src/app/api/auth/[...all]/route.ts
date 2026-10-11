import { createAuth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const handlers = toNextJsHandler(createAuth());
  return handlers.GET(request);
}

export async function POST(request: Request) {
  const handlers = toNextJsHandler(createAuth());
  return handlers.POST(request);
}
