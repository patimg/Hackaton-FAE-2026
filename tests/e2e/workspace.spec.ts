import { test,expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { randomBytes, randomUUID } from 'node:crypto';
import { requireLocalUrl } from '../../scripts/local-env';

test('sin sesión: páginas y API privadas; formulario valida origen', async ({page,request}) => {
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get('/api/v1/clients')).status()).toBe(401);
  expect((await request.post('/api/v1/ingest',{multipart:{event:'{}'}})).status()).toBe(401);
  expect((await request.post('/api/v1/ingest',{headers:{Authorization:'Bearer invalid'},multipart:{event:'{}'}})).status()).toBe(401);
  expect((await request.get('/simulator')).status()).toBe(404);
  expect((await request.post('/auth/login', { headers:{Origin:'https://untrusted.example.test'}, form:{email:'operadora@example.test',password:'not-a-real-password'} })).status()).toBe(403);
  const loopbackLogin = await request.post('/auth/login', {
    headers:{Origin:'http://127.0.0.1:3000'},
    form:{email:'operadora@example.test',password:'not-a-real-password'},
    maxRedirects:0,
  });
  expect(loopbackLogin.status()).toBe(303);
  expect(loopbackLogin.headers().location).toBe('http://127.0.0.1:3000/login?error=credentials');
});
test('login real, panel principal, navegación, 404 y logout', async ({page}) => {
  if (!process.env.LOCAL_OPERATOR_EMAIL || !process.env.LOCAL_OPERATOR_PASSWORD) throw new Error('Configura las credenciales de operadora para E2E.');
  await page.goto('/login');
  await page.getByLabel('Correo',{exact:true}).fill(process.env.LOCAL_OPERATOR_EMAIL);
  await page.getByLabel('Contraseña',{exact:true}).fill(process.env.LOCAL_OPERATOR_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'¿Qué documento necesitas?'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Documentos recientes'})).toBeVisible();
  await expect(page.getByRole('searchbox',{name:'Buscar en Gmail, WhatsApp y documentos'})).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link',{name:'Simulador de entrada'})).toHaveCount(0);
  for (const path of ['/clients','/documents','/search']) {
    await page.goto(path);
    await expect(page).toHaveURL('/');
  }
  await page.goto('/review');
  await expect(page.getByRole('heading',{name:'Revisión',exact:true})).toBeVisible();
  await page.goto('/clients/10000000-0000-4000-8000-000000000099');
  await expect(page.getByRole('heading',{name:'No encontramos esta página'})).toBeVisible();
  await page.goto('/');
  await page.getByRole('button',{name:'Cerrar sesión'}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/login$/);
});


test('cuenta Auth válida sin permiso de operadora no accede a páginas ni API', async ({ page, context }) => {
  const url = requireLocalUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false,autoRefreshToken:false} });
  const email = `e2e-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm:true });
  expect(created.error).toBeNull();
  const userId = created.data.user!.id;
  try {
    // Sesión real creada por Auth: comprobar autorización aunque se eluda el formulario.
    let sessionCookies: { name:string; value:string; options:CookieOptions }[] = [];
    const client = createServerClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      cookies:{ getAll:() => [], setAll:items => { sessionCookies = items; } },
    });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(sessionCookies.length).toBeGreaterThan(0);
    await context.addCookies(sessionCookies.map(({ name,value }) => ({ name,value,url:process.env.APP_BASE_URL || 'http://localhost:3000',httpOnly:true,sameSite:'Lax' })));
    await page.goto('/clients');
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/v1/clients')).status()).toBe(401);
    await page.getByLabel('Correo',{exact:true}).fill(email);
    await page.getByLabel('Contraseña',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page).toHaveURL(/error=credentials/);
    await expect(page.getByRole('alert').filter({hasText:'No se pudo iniciar sesión'})).toBeVisible();
  } finally {
    // Únicamente la cuenta temporal creada por esta prueba; no tocar operadora ni clientes.
    const removed = await admin.auth.admin.deleteUser(userId);
    expect(removed.error).toBeNull();
  }
});
