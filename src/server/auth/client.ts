import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/server/config";

export async function authClient() {
  const env = getEnv();
  const jar = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: new URL(env.APP_BASE_URL).protocol === 'https:' },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Render no puede escribir cookies; proxy.ts renueva la sesión. */ }
      },
    },
  });
}
