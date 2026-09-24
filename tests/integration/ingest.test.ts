import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readFile,readdir } from 'node:fs/promises';
import { loadLocalEnv,requireLocalUrl } from '../../scripts/local-env';
import { parseEnv } from '../../src/config/env';
import { parseIngest,sha256 } from '../../src/server/files/validate';
import { ingestMessage,type IngestDependencies } from '../../src/server/services/ingest';
import { LocalFileStorage } from '../../src/server/providers/storage/local';
import { DeterministicAIProvider } from '../../src/server/providers/ai/deterministic';
import { AppError } from '../../src/server/errors';
import { fixture,requestFor } from '../helpers/ingest';
import type { IncomingEvent } from '../../src/contracts/ingest';
loadLocalEnv();
const env=parseEnv(process.env);
requireLocalUrl(env.SUPABASE_URL,'SUPABASE_URL');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const deps:IngestDependencies={db,ai:new DeterministicAIProvider(),storage:new LocalFileStorage(env.LOCAL_FILES_DIR),staging:new LocalFileStorage(env.STAGING_DIR),timezone:env.APP_TIMEZONE,confidenceThreshold:env.CLASSIFICATION_CONFIDENCE_THRESHOLD};
const context={operatorId:env.OPERATOR_USER_ID,origin:'simulator' as const};
async function message(name='A') {const data=await fixture(name);data.event.external_message_id=`integration-${randomUUID()}`;return data;}
async function ingest(event:IncomingEvent,files:Uint8Array[],dependencies=deps) {return ingestMessage(await parseIngest(requestFor(event,files),env),context,dependencies);}
async function counts() {
  return Promise.all(['clients','interactions','documents','processed_events'].map(async table=>{
    const {count,error}=await db.from(table).select('id',{count:'exact',head:true});assert.equal(error,null);return count;
  }));
}

test('pipeline: cliente existente por email, original persistido, duplicado y conflicto de payload',async()=>{
  const {event,files}=await message();event.sender.email=' CAROLINA@EXAMPLE.TEST ';
  const result=await ingest(event,files);
  assert.equal(result.httpStatus,201);assert.equal(result.result.client_resolution,'existing');
  assert.equal(result.result.client?.id,'10000000-0000-4000-8000-000000000012');
  const doc=result.result.documents[0];assert.equal(doc.category,'diseno');assert.equal(doc.sha256,sha256(files[0]));assert.equal(doc.storage_status,'stored');
  const stored=await db.from('documents').select('storage_key').eq('id',doc.id).single();assert.equal(stored.error,null);
  const bytes=Buffer.from(await new Response(await new LocalFileStorage(env.LOCAL_FILES_DIR).read({key:stored.data!.storage_key})).arrayBuffer());assert.ok(bytes.equals(files[0]));
  const filesBefore=await readdir(env.LOCAL_FILES_DIR,{recursive:true});
  const stagingBefore=await readdir(env.STAGING_DIR,{recursive:true});
  const before=await counts();const duplicate=await ingest(event,files);
  assert.deepEqual(await readdir(env.LOCAL_FILES_DIR,{recursive:true}),filesBefore);
  assert.deepEqual(await readdir(env.STAGING_DIR,{recursive:true}),stagingBefore);
  assert.equal(duplicate.httpStatus,200);assert.ok(duplicate.result.duplicate);assert.equal(duplicate.result.documents[0].id,doc.id);assert.deepEqual(await counts(),before);
  await assert.rejects(ingest({...event,text:event.text+' distinto'},files),error=>error instanceof AppError && error.code==='EVENT_PAYLOAD_CONFLICT');
  assert.deepEqual(await counts(),before);
});
test('pipeline: teléfono existente y mensaje sin adjuntos',async()=>{
  const {event}=await message();event.source='whatsapp';event.source_account_id='demo-whatsapp';event.sender={display_name:'Carolina',email:null,phone:'+1 (202) 555-0112'};event.attachments=[];
  const result=await ingest(event,[]);assert.equal(result.result.client?.id,'10000000-0000-4000-8000-000000000012');assert.equal(result.result.documents.length,0);
  const saved=await db.from('interactions').select('message_text,external_message_id').eq('id',result.result.interaction_id).single();
  assert.equal(saved.data?.message_text,event.text);assert.equal(saved.data?.external_message_id,event.external_message_id);
});
test('pipeline: nuevo cliente y mismo nombre con otra identidad no se fusionan',async()=>{
  const {event,files}=await message('B');event.sender={display_name:'Carolina Pérez',email:`test-${randomUUID()}@example.test`,phone:null};
  const result=await ingest(event,files);assert.equal(result.result.client_resolution,'created');assert.notEqual(result.result.client?.id,'10000000-0000-4000-8000-000000000012');
  assert.equal(result.result.documents[0].category,'comprobante_pago');
  const client=await db.from('clients').select('status').eq('id',result.result.client!.id).single();assert.equal(client.data?.status,'provisional');
  const next=await ingest({...event,external_message_id:randomUUID()},files);assert.equal(next.result.client?.id,result.result.client?.id);assert.equal(next.result.client_resolution,'existing');
});
test('pipeline: email y teléfono contradictorios dejan cliente null y revisión',async()=>{
  const {event,files}=await message();event.sender.phone='+12025550113';
  const before=(await counts())[0];const result=await ingest(event,files);
  assert.equal(result.result.client,null);assert.equal(result.result.client_resolution,'conflict');assert.equal(result.result.documents[0].classification_status,'needs_review');assert.equal((await counts())[0],before);
  const doc=await db.from('documents').select('storage_key').eq('id',result.result.documents[0].id).single();assert.match(doc.data!.storage_key,/^sin_asignar\/\d{4}\/\d{2}\/por_revisar\//);
});
test('pipeline: varios archivos y mismos bytes en mensajes distintos conservan contexto',async()=>{
  const {event,files}=await message();const pdf=await readFile('fixtures/files/comprobante.pdf');
  event.attachments.push({external_attachment_id:'other',file_field:'file_1',filename:'comprobante.pdf',mime_type:'application/pdf',size_bytes:pdf.length});
  event.text='Adjunto el logo actualizado y el comprobante de la transferencia.';
  const first=await ingest(event,[...files,pdf]);assert.equal(first.result.documents.length,2);assert.deepEqual(new Set(first.result.documents.map(doc=>doc.category)),new Set(['diseno','comprobante_pago']));
  const second=await ingest({...event,external_message_id:randomUUID(),text:'El logo y el comprobante corresponden a otro pedido.'},[...files,pdf]);
  assert.notEqual(first.result.interaction_id,second.result.interaction_id);
  for(const doc of first.result.documents) {const match=second.result.documents.find(other=>other.original_filename===doc.original_filename)!;assert.equal(match.sha256,doc.sha256);assert.notEqual(match.id,doc.id);}
});
test('pipeline: ambiguo, identidad ausente y clasificador fallido conservan originales para revisión',async()=>{
  const data=await message('C');const ambiguous=await ingest(data.event,data.files);assert.equal(ambiguous.result.documents[0].classification_status,'needs_review');
  const noIdentity=await ingest({...data.event,external_message_id:randomUUID(),sender:{display_name:'Sin contacto',email:null,phone:null}},data.files);assert.equal(noIdentity.result.client_resolution,'created');assert.ok(noIdentity.result.warnings.includes('MISSING_IDENTITY'));
  const broken={...deps,ai:{...deps.ai,classifyDocuments:async()=>{throw new Error('Fallo inducido');},interpretSearch:deps.ai.interpretSearch.bind(deps.ai)}};
  const failed=await ingest({...data.event,external_message_id:randomUUID()},data.files,broken);
  const invalid={...broken,ai:{...broken.ai,classifyDocuments:async()=>({schema_version:'1' as const,results:[{document_id:randomUUID(),category:'otro' as const,summary:'Salida inválida',tags:[],confidence:9,reason:'Confianza fuera de rango'}]})}};
  const fallback=await ingest({...data.event,external_message_id:randomUUID()},data.files,invalid);
  assert.equal(fallback.result.documents[0].storage_status,'stored');assert.equal(fallback.result.documents[0].classification_status,'needs_review');assert.ok(fallback.result.warnings.includes('CLASSIFIER_FAILED'));
  assert.equal(failed.result.documents[0].storage_status,'stored');assert.equal(failed.result.documents[0].classification_status,'needs_review');assert.ok(failed.result.warnings.includes('CLASSIFIER_FAILED'));
});
