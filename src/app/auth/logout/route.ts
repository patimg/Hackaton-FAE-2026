import { NextResponse } from 'next/server';
import { authClient } from '@/server/auth/client';
import { getEnv } from '@/server/config';
import { isAllowedOrigin } from '@/server/auth/origin';
export async function POST(request: Request) {
  const base = new URL(getEnv().APP_BASE_URL);
  if (!isAllowedOrigin(request.headers.get('origin'), base.origin)) return new Response('Origen no permitido', { status: 403 });
  const client = await authClient();
  await client.auth.signOut();
  return NextResponse.redirect(new URL('/login', base), 303);
}
