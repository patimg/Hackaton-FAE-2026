import "server-only";
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/server/config';
// Uso exclusivo en servicios que ya verificaron a la operadora.
export function database() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
