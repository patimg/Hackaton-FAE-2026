import { test,expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { randomBytes, randomUUID } from 'node:crypto';
import { requireLocalUrl } from '../../scripts/local-env';

test('sin sesión: páginas y API privadas; formulario valida origen', async ({page,request}) => {
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.get('/api/v1/clients')).status()).toBe(401);
  expect((await request.post('/auth/login', { headers:{Origin:'https://untrusted.example.test'}, form:{email:'operadora@example.test',password:'not-a-real-password'} })).status()).toBe(403);
});
test('login real, clientes persistidos, navegación, 404 y logout', async ({page}) => {
  if (!process.env.DEMO_AUTH_EMAIL || !process.env.DEMO_AUTH_PASSWORD) throw new Error('Ejecuta demo:setup antes de E2E.');
  await page.goto('/login');
  await page.getByLabel('Correo',{exact:true}).fill(process.env.DEMO_AUTH_EMAIL);
  await page.getByLabel('Contraseña',{exact:true}).fill(process.env.DEMO_AUTH_PASSWORD);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Documentos con contexto'})).toBeVisible();
  await page.getByRole('navigation').getByRole('link',{name:'Clientes',exact:true}).click();
  await expect(page.locator('a[href="/clients/10000000-0000-4000-8000-000000000012"]')).toBeVisible();
  await expect(page.getByRole('link',{name:'Juan Soto'})).toBeVisible();
  await page.locator('a[href="/clients/10000000-0000-4000-8000-000000000012"]').click();
  await expect(page.getByText('carolina@example.test',{exact:true})).toBeVisible();
  await expect(page.getByText('CLI-0012 - Carolina Perez',{exact:true})).toBeVisible();
  for (const [path,title] of [['/documents','Documentos'],['/review','Revisión'],['/search','Búsqueda'],['/simulator','Simulador de entrada']]) {
    await page.goto(path);
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
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
