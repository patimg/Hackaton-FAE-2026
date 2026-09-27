import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv,requireLocalUrl } from '../../scripts/local-env';
import { parseEnv } from '../../src/config/env';
import { parseIngest,sha256 } from '../../src/server/files/validate';
import { ingestMessage,type IngestDependencies } from '../../src/server/services/ingest';
import { LocalFileStorage } from '../../src/server/providers/storage/local';
import { DeterministicAIProvider } from '../helpers/deterministic-ai';
import { AppError } from '../../src/server/errors';
import { createTestMessage,integrationAccountId,pdfBytes,requestFor } from '../helpers/ingest';
import type { IncomingEvent } from '../../src/contracts/ingest';
import { after,before } from 'node:test';
loadLocalEnv();
const env=parseEnv(process.env);
requireLocalUrl(env.SUPABASE_URL,'SUPABASE_URL');
const db=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const testNamespace=randomUUID().replaceAll('-','');
const testEmail=`itest-${testNamespace}@example.test`;
const phoneSuffix=100+Number.parseInt(testNamespace.slice(0,4),16)%100;
const testPhone=`+1202555${String(phoneSuffix).padStart(4,'0')}`;
const otherPhone=`+1202555${String(phoneSuffix===199?100:phoneSuffix+1).padStart(4,'0')}`;
const testClientName=`TEST-INGEST-${testNamespace}`;
const localTestRoot=join(tmpdir(),`fae-ingest-${testNamespace}`);
const testClientIds:string[]=[];
const testFileStorage=new LocalFileStorage(join(localTestRoot,'files'));
class FailingStorage extends LocalFileStorage { async ensureStored(input:Parameters<LocalFileStorage['ensureStored']>[0]):Promise<never>{void input;throw new Error('temporary storage failure');} }
const deps:IngestDependencies={db,ai:new DeterministicAIProvider(),storage:testFileStorage,staging:new LocalFileStorage(join(localTestRoot,'staging')),timezone:env.APP_TIMEZONE,confidenceThreshold:env.CLASSIFICATION_CONFIDENCE_THRESHOLD};
const context={operatorId:env.OPERATOR_USER_ID};
before(async()=>{
  for(const [name,identities] of [[`${testClientName}-base`,[{kind:'email',value:testEmail},{kind:'phone',value:testPhone}]], [`${testClientName}-other`,[{kind:'phone',value:otherPhone}]]] as const){
    const client=await db.from('clients').insert({display_name:name}).select('id').single();
    assert.equal(client.error,null);
    testClientIds.push(client.data!.id);
    const rows=await db.from('client_identities').insert(identities.map(identity=>({client_id:client.data!.id,kind:identity.kind,value_raw:identity.value,value_normalized:identity.value,verification_source:'manual'})));
    assert.equal(rows.error,null);
  }
});
after(async()=>{
  const events=await db.from('processed_events').select('id').eq('source_account_id',integrationAccountId);
  assert.equal(events.error,null);
  const eventIds=events.data.map(event=>event.id);
  if(eventIds.length){
    const interactions=await db.from('interactions').select('id').in('event_id',eventIds);
    assert.equal(interactions.error,null);
    const interactionIds=interactions.data.map(interaction=>interaction.id);
    if(interactionIds.length){
      const documents=await db.from('documents').delete().in('interaction_id',interactionIds);
      assert.equal(documents.error,null);
      const removedInteractions=await db.from('interactions').delete().in('id',interactionIds);
      assert.equal(removedInteractions.error,null);
    }
    const removedEvents=await db.from('processed_events').delete().in('id',eventIds);
    assert.equal(removedEvents.error,null);
  }
  const generated=await db.from('clients').select('id').ilike('display_name',`${testClientName}%`);
  assert.equal(generated.error,null);
  const ids=[...new Set([...testClientIds,...generated.data.map(client=>client.id)])];
  if(ids.length){
    const identities=await db.from('client_identities').delete().in('client_id',ids);
    assert.equal(identities.error,null);
    const clients=await db.from('clients').delete().in('id',ids);
    assert.equal(clients.error,null);
  }
  await rm(localTestRoot,{recursive:true,force:true});
});
async function message(kind:'logo'|'receipt'|'ambiguous'='logo') {
  const data=await createTestMessage(kind);
  data.event.sender={display_name:`${testClientName}-contact`,email:testEmail,phone:null};
  return data;
}
async function ingest(event:IncomingEvent,files:Uint8Array[],dependencies=deps) {
  return ingestMessage(await parseIngest(requestFor(event,files),env),context,dependencies);
}
async function counts() {
  return Promise.all(['clients','interactions','documents','processed_events'].map(async table=>{
    const {count,error}=await db.from(table).select('id',{count:'exact',head:true});assert.equal(error,null);return count;
  }));
}

test('pipeline: cliente existente por email, original persistido, duplicado y conflicto de payload',async()=>{
  const {event,files}=await message();event.sender.email=` ${testEmail.toUpperCase()} `;
  const result=await ingest(event,files);
  assert.equal(result.httpStatus,201);assert.equal(result.result.client_resolution,'existing');
  assert.equal(result.result.client?.id,testClientIds[0]);
  const doc=result.result.documents[0];assert.equal(doc.category,'diseno');assert.equal(doc.sha256,sha256(files[0]));assert.equal(doc.storage_status,'stored');
  const stored=await db.from('documents').select('storage_key,staging_key').eq('id',doc.id).single();assert.equal(stored.error,null);assert.equal(stored.data?.staging_key,null);
  const bytes=Buffer.from(await new Response(await testFileStorage.read({key:stored.data!.storage_key})).arrayBuffer());assert.ok(bytes.equals(files[0]));
  const filesBefore=await readdir(join(localTestRoot,'files'),{recursive:true});
  const stagingBefore=await readdir(join(localTestRoot,'staging'),{recursive:true});
  assert.equal(stagingBefore.length,0);
  const before=await counts();const duplicate=await ingest(event,files);
  assert.deepEqual(await readdir(join(localTestRoot,'files'),{recursive:true}),filesBefore);
  assert.deepEqual(await readdir(join(localTestRoot,'staging'),{recursive:true}),stagingBefore);
  assert.equal(duplicate.httpStatus,200);assert.ok(duplicate.result.duplicate);assert.equal(duplicate.result.documents[0].id,doc.id);assert.deepEqual(await counts(),before);
  await assert.rejects(ingest({...event,text:event.text+' distinto'},files),error=>error instanceof AppError && error.code==='EVENT_PAYLOAD_CONFLICT');
  assert.deepEqual(await counts(),before);
});
test('pipeline: un fallo de almacenamiento se puede reintentar sin duplicar documentos',async()=>{
  const data=await message();
  await assert.rejects(ingest(data.event,data.files,{...deps,storage:new FailingStorage(join(localTestRoot,'failed-files'))}),error=>error instanceof AppError && error.code==='STORAGE_FAILED');
  const savedEvent=await db.from('processed_events').select('id,status').eq('external_message_id',data.event.external_message_id).single();
  assert.equal(savedEvent.error,null);assert.equal(savedEvent.data?.status,'retryable_failed');
  const retried=await ingest(data.event,data.files);
  assert.equal(retried.result.documents.length,1);assert.equal(retried.result.documents[0].storage_status,'stored');
  const documents=await db.from('documents').select('id').eq('interaction_id',retried.result.interaction_id);assert.equal(documents.error,null);assert.equal(documents.data.length,1);
});
test('pipeline: teléfono existente y mensaje sin adjuntos',async()=>{
  const {event}=await message();event.sender={display_name:`${testClientName}-contact`,email:null,phone:testPhone};event.attachments=[];
  const result=await ingest(event,[]);assert.equal(result.result.client?.id,testClientIds[0]);assert.equal(result.result.documents.length,0);
  const saved=await db.from('interactions').select('message_text,external_message_id').eq('id',result.result.interaction_id).single();
  assert.equal(saved.data?.message_text,event.text);assert.equal(saved.data?.external_message_id,event.external_message_id);
});
test('pipeline: WhatsApp de chat individual conserva texto sin crear documentos',async()=>{
  const {event}=await message();event.source='whatsapp';event.external_thread_id='56987654321@s.whatsapp.net';event.sender={display_name:`${testClientName}-whatsapp`,email:null,phone:testPhone};event.attachments=[];
  const result=await ingest(event,[]);
  assert.equal(result.result.client?.id,testClientIds[0]);assert.equal(result.result.documents.length,0);
  const saved=await db.from('interactions').select('source,message_text').eq('id',result.result.interaction_id).single();
  assert.equal(saved.data?.source,'whatsapp');assert.equal(saved.data?.message_text,event.text);
});
test('pipeline: nuevo cliente y mismo nombre con otra identidad no se fusionan',async()=>{
  const {event,files}=await message('receipt');event.sender={display_name:`${testClientName}-new`,email:`itest-new-${randomUUID()}@example.test`,phone:null};
  const result=await ingest(event,files);assert.equal(result.result.client_resolution,'created');assert.notEqual(result.result.client?.id,testClientIds[0]);
  assert.equal(result.result.documents[0].category,'comprobante_pago');
  const client=await db.from('clients').select('status').eq('id',result.result.client!.id).single();assert.equal(client.data?.status,'provisional');
  const next=await ingest({...event,external_message_id:randomUUID()},files);assert.equal(next.result.client?.id,result.result.client?.id);assert.equal(next.result.client_resolution,'existing');
});
test('pipeline: email y teléfono contradictorios dejan cliente null y revisión',async()=>{
  const {event,files}=await message();event.sender.phone=otherPhone;
  const before=(await counts())[0];const result=await ingest(event,files);
  assert.equal(result.result.client,null);assert.equal(result.result.client_resolution,'conflict');assert.equal(result.result.documents[0].classification_status,'needs_review');assert.equal((await counts())[0],before);
  const doc=await db.from('documents').select('storage_key').eq('id',result.result.documents[0].id).single();assert.match(doc.data!.storage_key,/^sin_asignar\/\d{4}\/\d{2}\/por_revisar\//);
});
test('pipeline: varios archivos y mismos bytes en mensajes distintos conservan contexto',async()=>{
  const {event,files}=await message();const pdf=pdfBytes();
  event.attachments.push({external_attachment_id:'other',file_field:'file_1',filename:'comprobante.pdf',mime_type:'application/pdf',size_bytes:pdf.length});
  event.text='Adjunto el logo actualizado y el comprobante de la transferencia.';
  const first=await ingest(event,[...files,pdf]);assert.equal(first.result.documents.length,2);assert.deepEqual(new Set(first.result.documents.map(doc=>doc.category)),new Set(['diseno','comprobante_pago']));
  const second=await ingest({...event,external_message_id:randomUUID(),text:'El logo y el comprobante corresponden a otro pedido.'},[...files,pdf]);
  assert.notEqual(first.result.interaction_id,second.result.interaction_id);
  for(const doc of first.result.documents) {const match=second.result.documents.find(other=>other.original_filename===doc.original_filename)!;assert.equal(match.sha256,doc.sha256);assert.notEqual(match.id,doc.id);}
});
test('pipeline: ambiguo, identidad ausente y clasificador fallido conservan originales para revisión',async()=>{
  const data=await message('ambiguous');const ambiguous=await ingest(data.event,data.files);assert.equal(ambiguous.result.documents[0].classification_status,'needs_review');
  const noIdentity=await ingest({...data.event,external_message_id:`integration-${randomUUID()}`,sender:{display_name:`${testClientName}-no-identity`,email:null,phone:null}},data.files);assert.equal(noIdentity.result.client_resolution,'created');assert.ok(noIdentity.result.warnings.includes('MISSING_IDENTITY'));
  const broken={...deps,ai:{...deps.ai,classifyDocuments:async()=>{throw new Error('Fallo inducido');},interpretSearch:deps.ai.interpretSearch.bind(deps.ai)}};
  const failed=await ingest({...data.event,external_message_id:randomUUID()},data.files,broken);
  const invalid={...broken,ai:{...broken.ai,classifyDocuments:async()=>({schema_version:'1' as const,results:[{document_id:randomUUID(),category:'otro' as const,summary:'Salida inválida',tags:[],confidence:9,reason:'Confianza fuera de rango'}]})}};
  const fallback=await ingest({...data.event,external_message_id:randomUUID()},data.files,invalid);
  assert.equal(fallback.result.documents[0].storage_status,'stored');assert.equal(fallback.result.documents[0].classification_status,'needs_review');assert.ok(fallback.result.warnings.includes('CLASSIFIER_FAILED'));
  assert.equal(failed.result.documents[0].storage_status,'stored');assert.equal(failed.result.documents[0].classification_status,'needs_review');assert.ok(failed.result.warnings.includes('CLASSIFIER_FAILED'));
});
