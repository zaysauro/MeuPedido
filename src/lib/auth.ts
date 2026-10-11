import 'server-only';
import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';

export function createAuth() {
  const databaseUrl = process.env.DATABASE_URL;
  const authSecret = process.env.BETTER_AUTH_SECRET;
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não configurada');
  if (!authSecret || authSecret.length < 32) throw new Error('BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres');
  if (!authUrl) throw new Error('BETTER_AUTH_URL não configurada');

  return betterAuth({
    database: new Pool({ connectionString: databaseUrl, max: 5 }),
    baseURL: authUrl,
    secret: authSecret,
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    // Explicit production host allowlist. Never trust arbitrary Origin/Host headers.
    trustedOrigins: [
      authUrl,
      'https://meupedido-bruno-02a0.vercel.app',
      'https://meupedido-seven.vercel.app',
      'https://meupedido-git-main-bruno-02a0.vercel.app',
    ],
  });
}
