import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authClient } from '@/server/auth/client';
import { getEnv } from '@/server/config';
const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  const env = getEnv();
  const base = new URL(env.APP_BASE_URL);
  if (request.headers.get('origin') !== base.origin) return new Response('Origen no permitido', { status: 403 });
  const failure = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, base), 303);
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return new Response('Solicitud demasiado grande', { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return failure('credentials'); }
  const parsed = credentials.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return failure('credentials');
  try {
    const client = await authClient();
    const { data, error } = await client.auth.signInWithPassword(parsed.data);
    if (error || !data.user) return failure(error && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500) ? 'unavailable' : 'credentials');
    if (data.user.id !== env.OPERATOR_USER_ID) {
      await client.auth.signOut();
      return failure('credentials');
    }
  } catch { return failure('unavailable'); }
  return NextResponse.redirect(new URL('/', base), 303);
}
