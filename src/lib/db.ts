import 'server-only';
import { neon } from '@neondatabase/serverless';

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');
  if(process.env.EXPECTED_DATABASE_HOST && new URL(url).hostname!==process.env.EXPECTED_DATABASE_HOST) throw new Error("Destino do banco não corresponde ao ambiente configurado");
  return url;
}

export function getDb() { return neon(databaseUrl()); }
