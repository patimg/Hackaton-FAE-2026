import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { parseEnv } from '@/config/env';

export async function proxy(request: NextRequest) {
  const env = parseEnv(process.env);
  let response = NextResponse.next({ request });
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: { httpOnly: true, sameSite: 'lax', secure: new URL(env.APP_BASE_URL).protocol === 'https:' },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser valida con Auth; la autorización se repite en cada acceso de servidor.
  await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/v1/ingest(?:/|$)).*)'] };
