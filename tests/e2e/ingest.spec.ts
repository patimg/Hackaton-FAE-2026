import { test,expect,type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fixture } from '../helpers/ingest';
import type { IngestResult } from '../../src/contracts/ingest';
import { requireLocalUrl } from '../../scripts/local-env';

async function login(page:Page) {
  await page.goto('/login');
  await page.getByLabel('Correo',{exact:true}).fill(process.env.DEMO_AUTH_EMAIL!);
  await page.getByLabel('Contraseña',{exact:true}).fill(process.env.DEMO_AUTH_PASSWORD!);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Documentos con contexto'})).toBeVisible();
}
async function submit(page:Page,button='Enviar nuevo evento') {
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/v1/ingest') && response.request().method()==='POST');
  await page.getByRole('button',{name:button,exact:true}).click();
  const response=await responsePromise;
  expect(response.ok()).toBeTruthy();
  return await response.json() as IngestResult;
}
function adminDb() {
  return createClient(requireLocalUrl(process.env.SUPABASE_URL,'SUPABASE_URL'),process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}

test('recorrido: login → Carolina → logo → detalle → cliente → descarga → reenvío → revisión',async({page,request})=>{
  test.setTimeout(90000);
  await login(page);
  await page.getByRole('navigation').getByRole('link',{name:'Simulador de entrada'}).click();
  await page.getByRole('button',{name:'Cargar caso A'}).click();
  await page.getByLabel('Archivos adjuntos').setInputFiles('fixtures/files/logo_nuevo.png');
  const first=await submit(page);
  expect(first.client_resolution).toBe('existing');
  expect(first.client?.id).toBe('10000000-0000-4000-8000-000000000012');
  expect(first.documents).toHaveLength(1);
  const doc=first.documents[0];
  expect(doc.category).toBe('diseno');expect(doc.storage_status).toBe('stored');
  await expect(page.getByRole('heading',{name:'Mensaje procesado'})).toBeVisible();
  // Abrir en otra pestaña conserva el snapshot del simulador para el reenvío exacto.
  const detail=await page.context().newPage();
  await detail.goto(`/documents/${doc.id}`);
  await expect(detail.getByRole('heading',{name:'logo_nuevo.png',exact:true})).toBeVisible();
  await expect(detail.getByText(doc.sha256,{exact:true})).toBeVisible();
  const downloadPromise=detail.waitForEvent('download');
  await detail.getByRole('link',{name:'Descargar original',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('logo_nuevo.png');
  const stream=await download.createReadStream();
  const chunks:Buffer[]=[];for await(const chunk of stream!) chunks.push(Buffer.from(chunk));
  const original=await readFile('fixtures/files/logo_nuevo.png');
  expect(Buffer.concat(chunks).equals(original)).toBeTruthy();
  expect(createHash('sha256').update(original).digest('hex')).toBe(doc.sha256);
  // Contexto compartido sí está autorizado; request sin cookies no.
  expect((await request.get(`/api/v1/documents/${doc.id}/content`)).status()).toBe(401);
  await detail.getByRole('link',{name:'Carolina Pérez',exact:true}).click();
  await expect(detail.getByRole('heading',{name:'Carolina Pérez',exact:true})).toBeVisible();
  await expect(detail.getByText(first.interaction_id,{exact:true})).toBeVisible();
  await expect(detail.locator(`a[href="/documents/${doc.id}"]`).first()).toBeVisible();
  const db=adminDb();
  const before=await db.from('documents').select('id',{count:'exact',head:true});
  // Cambiar campos no cambia el snapshot que se reenvía.
  await page.getByLabel('Mensaje',{exact:true}).fill('Este texto nuevo no debe enviarse al pulsar reenviar.');
  const duplicate=await submit(page,'Reenviar mismo evento');
  expect(duplicate.duplicate).toBeTruthy();expect(duplicate.documents[0].id).toBe(doc.id);expect(duplicate.interaction_id).toBe(first.interaction_id);
  expect((await db.from('documents').select('id',{count:'exact',head:true})).count).toBe(before.count);
  await expect(page.getByRole('heading',{name:'Evento ya procesado: sin duplicados'})).toBeVisible();
  await page.getByRole('button',{name:'Cargar caso C'}).click();
  await page.getByLabel('Archivos adjuntos').setInputFiles('fixtures/files/referencia.png');
  const ambiguous=await submit(page);const pending=ambiguous.documents[0];
  expect(pending.classification_status).toBe('needs_review');
  await detail.goto('/review');
  const card=detail.locator(`[data-document-id="${pending.id}"]`);
  await expect(card).toBeVisible();
  await card.getByLabel('Categoría',{exact:true}).selectOption('referencia');
  await card.getByLabel('Etiquetas separadas por coma').fill('tarjetas, confirmado');
  const reviewResponse=detail.waitForResponse(response=>response.url().endsWith(`/documents/${pending.id}/review`) && response.request().method()==='PATCH');
  await card.getByRole('button',{name:'Confirmar revisión'}).click();
  expect((await reviewResponse).status()).toBe(200);
  await expect(card).toHaveCount(0);
  const saved=await db.from('documents').select('category,tags,classification_status,storage_key,classification_evidence,version').eq('id',pending.id).single();
  expect(saved.data?.category).toBe('referencia');expect(saved.data?.tags).toEqual(['tarjetas','confirmado']);expect(saved.data?.classification_status).toBe('reviewed');
  expect(saved.data?.classification_evidence.category).toBe('otro');expect(saved.data?.storage_key).toContain('/por_revisar/');
  const again=await submit(page,'Reenviar mismo evento');expect(again.documents[0].classification_status).toBe('reviewed');expect(again.documents[0].category).toBe('referencia');
  await detail.goto(`/documents/${pending.id}`);await expect(detail.getByText('tarjetas, confirmado',{exact:true})).toBeVisible();
  const stale=await page.context().request.patch(`/api/v1/documents/${pending.id}/review`,{headers:{Origin:process.env.APP_BASE_URL!},data:{category:'otro',tags:[],version:1}});
  expect(stale.status()).toBe(409);
  await detail.close();
});

test('endpoint exige sesión y rechaza multipart inválido sin crear filas',async({page,request})=>{
  expect((await request.post('/api/v1/ingest',{multipart:{event:'{}'}})).status()).toBe(401);
  await login(page);
  const {event,files}=await fixture();event.external_message_id=crypto.randomUUID();
  const db=adminDb();const before=await db.from('processed_events').select('id',{count:'exact',head:true});
  const badOrigin=await page.context().request.post('/api/v1/ingest',{headers:{Origin:'https://untrusted.example.test'},multipart:{event:JSON.stringify(event)}});
  expect(badOrigin.status()).toBe(403);
  const missing=await page.context().request.post('/api/v1/ingest',{headers:{Origin:process.env.APP_BASE_URL!},multipart:{event:JSON.stringify(event)}});
  expect(missing.status()).toBe(422);
  const wrong=await page.context().request.post('/api/v1/ingest',{headers:{Origin:process.env.APP_BASE_URL!},multipart:{event:JSON.stringify(event),file_0:{name:'fake.png',mimeType:'image/png',buffer:Buffer.alloc(files[0].length,0)}}});
  expect(wrong.status()).toBe(415);
  expect((await db.from('processed_events').select('id',{count:'exact',head:true})).count).toBe(before.count);
});
