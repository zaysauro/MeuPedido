import 'server-only';
import {databaseUrl as verifiedDatabaseUrl} from './db';
import { betterAuth } from 'better-auth';
import {emailConfigured,sendAccountEmail} from './email';
import { Pool } from '@neondatabase/serverless';

function buildAuth() {
  const databaseUrl = verifiedDatabaseUrl();
  const authSecret = process.env.BETTER_AUTH_SECRET;
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não configurada');
  if (!authSecret || authSecret.length < 32) throw new Error('BETTER_AUTH_SECRET deve ter pelo menos 32 caracteres');
  if (!authUrl) throw new Error('BETTER_AUTH_URL não configurada');

  const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => Boolean(host))
    .map(host => 'https://' + host.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  return betterAuth({
    database: new Pool({ connectionString: databaseUrl, max: 5 }),
    baseURL: authUrl,
    secret: authSecret,
    emailAndPassword: { enabled: true, requireEmailVerification: emailConfigured()&&process.env.REQUIRE_EMAIL_VERIFICATION==='true', revokeSessionsOnPasswordReset:true,
      ...(emailConfigured()?{sendResetPassword:async({user,url}:{user:{email:string};url:string})=>sendAccountEmail(user.email,'Redefina sua senha',url)}:{}) },
    emailVerification:{sendOnSignUp:emailConfigured()&&process.env.REQUIRE_EMAIL_VERIFICATION==='true',sendOnSignIn:true,autoSignInAfterVerification:true,
      ...(emailConfigured()?{sendVerificationEmail:async({user,url}:{user:{email:string};url:string})=>sendAccountEmail(user.email,'Confirme seu e-mail',url)}:{})},
    // Explicit production host allowlist. Never trust arbitrary Origin/Host headers.
    trustedOrigins: [
      authUrl,
      'https://meupedido.sistemakumo.com.br',
      'https://meupedido-bruno-02a0.vercel.app',
      'https://meupedido-seven.vercel.app',
      'https://meupedido-git-main-bruno-02a0.vercel.app',
      ...vercelOrigins,
    ],
  });
}

let cachedAuth: ReturnType<typeof buildAuth> | undefined;
export function createAuth(){return cachedAuth ??= buildAuth();}
