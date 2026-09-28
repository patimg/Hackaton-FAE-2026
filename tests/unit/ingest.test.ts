import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,rm,symlink,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIngest,sha256 } from '../../src/server/files/validate';
import { normalizeEmail,normalizePhone,normalizePhoneIfValid } from '../../src/domain/identity';
import { AppError } from '../../src/server/errors';
import { LocalFileStorage } from '../../src/server/providers/storage/local';
import { ingestionMimeType } from '../../src/server/providers/gmail/provider';
import { DeterministicAIProvider } from '../helpers/deterministic-ai';
import { createTestMessage,requestFor,limits } from '../helpers/ingest';
const code=(expected:string)=>(error:unknown)=>error instanceof AppError && error.code===expected;

test('normaliza identidades sin borrar puntos ni sufijos +',()=>{
  assert.equal(normalizeEmail(' A.Na+tag@Example.TEST '),'a.na+tag@example.test');
  assert.equal(normalizePhone('+1 (202) 555-0112','CL'),'+12025550112');
  assert.equal(normalizePhone('9 8765 4321','CL'),'+56987654321');
  assert.equal(normalizePhoneIfValid('+12025550112','CL'),'+12025550112');
  assert.equal(normalizePhoneIfValid('+999123456789','CL'),null);
  assert.throws(()=>normalizePhone('no es un teléfono','CL'));
});
test('Gmail normaliza Markdown como texto y rechaza MIME no compatibles',()=>{
  assert.equal(ingestionMimeType('text/markdown'),'text/plain');
  assert.equal(ingestionMimeType('TEXT/PLAIN'),'text/plain');
  assert.equal(ingestionMimeType('image/webp'),null);
});
test('multipart válido conserva bytes, calcula SHA-256 y elimina rutas del nombre',async()=>{
  const {event,files}=await createTestMessage();event.attachments[0].filename='../../logo_nuevo.exe';
  const data=await parseIngest(requestFor(event,files),limits);
  assert.equal(data.attachments[0].safe_filename,'logo_nuevo.png');
  assert.equal(data.attachments[0].filename,'../../logo_nuevo.exe');
  assert.equal(data.attachments[0].sha256,sha256(files[0]));
});
test('huella estable ante frontera multipart y cambio de orden de propiedades',async()=>{
  const {event,files}=await createTestMessage();
  const a=await parseIngest(requestFor(event,files),limits);
  const reordered=Object.fromEntries(Object.entries(event).reverse()) as typeof event;
  const b=await parseIngest(requestFor(reordered,files),limits);
  assert.equal(a.payloadHash,b.payloadHash);
  event.text+=' Otro contexto';
  const c=await parseIngest(requestFor(event,files),limits);
  assert.notEqual(a.payloadHash,c.payloadHash);
});
test('rechaza adjuntos ausentes, campos extra e IDs repetidos',async()=>{
  const {event,files}=await createTestMessage();
  await assert.rejects(parseIngest(requestFor(event,[]),limits),code('MISSING_ATTACHMENT'));
  await assert.rejects(parseIngest(requestFor(event,files,{name:'intruso',value:'x'}),limits),code('UNEXPECTED_PART'));
  event.attachments.push({...event.attachments[0],file_field:'file_1'});
  await assert.rejects(parseIngest(requestFor(event,[...files,...files]),limits),code('INVALID_EVENT'));
});
test('rechaza fuente, ID y fecha inválidos antes de procesar',async()=>{
  const {event,files}=await createTestMessage();
  for(const invalid of [{source:'telegram'},{external_message_id:'  '},{occurred_at:'ayer'}]) {
    await assert.rejects(parseIngest(requestFor({...event,...invalid} as typeof event,files),limits),code('INVALID_EVENT'));
  }
});
test('MIME detectado por contenido y MIME declarado deben coincidir',async()=>{
  const {event,files}=await createTestMessage();
  event.attachments[0].mime_type='application/pdf';
  await assert.rejects(parseIngest(requestFor(event,files),limits),code('UNSUPPORTED_MIME'));
  event.attachments[0].mime_type='image/png';
  const garbage=Buffer.alloc(files[0].length,0);
  await assert.rejects(parseIngest(requestFor(event,[garbage]),limits),code('UNSUPPORTED_MIME'));
});
test('rechaza tamaño individual, total, cantidad y cuerpo HTTP excesivos',async()=>{
  const {event,files}=await createTestMessage();
  await assert.rejects(parseIngest(requestFor(event,files),{...limits,MAX_FILE_BYTES:10}),code('FILE_TOO_LARGE'));
  await assert.rejects(parseIngest(requestFor(event,files),{...limits,MAX_TOTAL_ATTACHMENT_BYTES:10}),code('FILES_TOO_LARGE'));
  await assert.rejects(parseIngest(requestFor(event,files),{...limits,MAX_FILES_PER_MESSAGE:0}),code('TOO_MANY_FILES'));
  const oversizedRequest=new Request('http://localhost/api/v1/ingest',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=test','content-length':'101'}});
  await assert.rejects(parseIngest(oversizedRequest,{...limits,MAX_REQUEST_BYTES:100}),code('REQUEST_TOO_LARGE'));
  event.attachments[0].size_bytes++;
  await assert.rejects(parseIngest(requestFor(event,files),limits),code('ATTACHMENT_MISMATCH'));
});
test('archivo ambiguo no se clasifica con certeza solo por su nombre',async()=>{
  const ai=new DeterministicAIProvider();
  const result=await ai.classifyDocuments({text:'Te mando esto.',subject:null,documents:[{document_id:randomUUID(),filename:'referencia.png',mime_type:'image/png',text:null}]});
  assert.equal(result.results[0].category,'otro');assert.ok(result.results[0].confidence<0.8);
});
test('almacenamiento persiste bytes, impide sobrescritura y rechaza traversal/enlaces externos',async()=>{
  const root=await mkdtemp(join(tmpdir(),'fae-storage-test-'));
  const outside=await mkdtemp(join(tmpdir(),'fae-storage-outside-'));
  try {
    const store=new LocalFileStorage(root);const bytes=Buffer.from('original sintético');
    const reservation=await store.reserve({documentId:randomUUID(),folderKey:'clientes/CLI-0001 - Test/2026/09/otros',filename:'nota.txt'});
    await store.ensureStored({reservation,bytes,sha256:sha256(bytes),mimeType:'text/plain'});
    const persisted=Buffer.from(await new Response(await new LocalFileStorage(root).read({key:reservation.key})).arrayBuffer());
    assert.ok(persisted.equals(bytes));
    await assert.rejects(store.ensureStored({reservation,bytes,sha256:sha256(bytes),mimeType:'text/plain'}));
    await store.remove({key:reservation.key});
    await assert.rejects(store.read({key:reservation.key}));
    await store.remove({key:reservation.key});
    await assert.rejects(store.read({key:'../outside.txt'}));
    try {
      await symlink(outside,join(root,'escape'));
      await assert.rejects(store.read({key:'escape/file.txt'}));
      await assert.rejects(store.reserve({documentId:randomUUID(),folderKey:'escape/new-directory',filename:'nota.txt'}));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
    assert.deepEqual(await readdir(outside),[]);

    assert.throws(()=>new LocalFileStorage('public/originales'));
  } finally {await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('varios adjuntos se desambiguan con nombres que contienen guiones bajos',async()=>{
  const ai=new DeterministicAIProvider();
  const result=await ai.classifyDocuments({text:'Adjunto el logo y el comprobante de la transferencia.',subject:null,documents:[
    {document_id:randomUUID(),filename:'logo_nuevo.png',mime_type:'image/png',text:null},
    {document_id:randomUUID(),filename:'comprobante.pdf',mime_type:'application/pdf',text:null},
  ]});
  assert.deepEqual(result.results.map(item=>item.category),['diseno','comprobante_pago']);
});
