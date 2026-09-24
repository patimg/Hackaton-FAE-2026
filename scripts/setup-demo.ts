import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { loadLocalEnv, requireLocalUrl, writeLocalEnv } from './local-env';

async function main() {
  loadLocalEnv();
  if (process.env.APP_MODE && process.env.APP_MODE !== 'demo') throw new Error('El setup solo se permite en modo demo.');
  if (process.env.SUPABASE_URL) requireLocalUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const status = JSON.parse(execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Record<string,string>;
  const url = requireLocalUrl(status.API_URL, 'API_URL');
  const dbUrl = requireLocalUrl(status.DB_URL, 'DB_URL');
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const adminKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  if (!publicKey || !adminKey) throw new Error('Supabase status no devolvió claves locales.');
  const email = z.email().parse(process.env.DEMO_AUTH_EMAIL || 'operadora@example.test');
  if (!email.endsWith('@example.test')) throw new Error('Usa una dirección sintética @example.test para demo.');
  const password = process.env.DEMO_AUTH_PASSWORD || randomBytes(24).toString('base64url');
  if (password.length < 12) throw new Error('DEMO_AUTH_PASSWORD debe tener al menos 12 caracteres.');
  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Antes de crear usuario, persistir credenciales locales para poder reanudar sin perder la contraseña.
  writeLocalEnv({ APP_MODE:'demo', APP_BASE_URL:process.env.APP_BASE_URL || 'http://localhost:3000', APP_TIMEZONE:'America/Santiago', DEFAULT_PHONE_COUNTRY:'CL', SUPABASE_URL:url, SUPABASE_PUBLISHABLE_KEY:publicKey, SUPABASE_SERVICE_ROLE_KEY:adminKey, DATABASE_URL:dbUrl, STORAGE_PROVIDER:'local', AI_PROVIDER:'deterministic', LOCAL_FILES_DIR:'./.data/files', STAGING_DIR:'./.data/staging', DEMO_AUTH_EMAIL:email, DEMO_AUTH_PASSWORD:password });
  let userId: string | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error('No se pudo consultar Auth local.');
    userId = data.users.find(user => user.email === email)?.id;
    if (userId || data.users.length < 100) break;
  }
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error('No se pudo crear la operadora local.');
    userId = data.user.id;
  } else {
    const client = createClient(url, publicKey, { auth: { persistSession:false, autoRefreshToken:false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error('La operadora ya existe y la contraseña local no coincide. No se ha cambiado su contraseña.');
    await client.auth.signOut();
  }
  writeLocalEnv({ OPERATOR_USER_ID:userId });
  console.log('Auth local preparado. Credenciales guardadas en .env.local; no se imprimen secretos. Ejecuta npm run db:seed.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Falló setup demo.'); process.exitCode = 1; });
