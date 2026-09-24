"use client";
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { IncomingEvent, IngestResult } from '@/contracts/ingest';
import { categoryLabels,statusLabels } from '@/domain/presentation';

type Draft = {source:'gmail'|'whatsapp';name:string;email:string;phone:string;subject:string;text:string};
type Snapshot = {event:IncomingEvent;files:File[]};
const initial:Draft={source:'gmail',name:'',email:'',phone:'',subject:'',text:''};
const presets:Record<string,Draft>={
  A:{...initial,name:'Carolina Pérez',email:'carolina@example.test',subject:'Tarjetas',text:'Hola, necesito nuevamente las tarjetas del mes pasado. Te envío el logo actualizado.'},
  B:{...initial,name:'Cliente Demo Transferencia',email:'transferencia@example.test',text:'Adjunto el comprobante de la transferencia.'},
  C:{...initial,name:'Carolina Pérez',email:'carolina@example.test',text:'Te mando esto.'},
};
export function Simulator({limits}:{limits:{files:number;fileBytes:number;totalBytes:number}}) {
  const [draft,setDraft]=useState(initial);
  const [files,setFiles]=useState<File[]>([]);
  const [last,setLast]=useState<Snapshot|null>(null);
  const [result,setResult]=useState<IngestResult|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const field=(key:keyof Draft,value:string)=>setDraft(old=>({...old,[key]:value}));
  async function send(snapshot:Snapshot) {
    setBusy(true);setError('');setResult(null);
    const form=new FormData();
    form.set('event',JSON.stringify(snapshot.event));
    snapshot.files.forEach((file,index)=>form.set(`file_${index}`,file));
    try {
      const response=await fetch('/api/v1/ingest',{method:'POST',body:form});
      const payload=await response.json();
      if (!response.ok) throw new Error(`${payload.error?.code || response.status}: ${payload.error?.message || 'No se pudo procesar el mensaje.'}${payload.event_id ? ` Evento: ${payload.event_id}` : ''}`);
      setResult(payload as IngestResult);
    } catch(error) { setError(error instanceof Error ? error.message : 'No se pudo enviar. Conservamos el evento para reenviarlo.'); }
    finally {setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length>limits.files || files.some(file=>file.size>limits.fileBytes) || files.reduce((sum,file)=>sum+file.size,0)>limits.totalBytes) {
      setError('Los archivos superan los límites indicados.');return;
    }
    const nullable=(text:string)=>text.trim() || null;
    const snapshot:Snapshot={files:[...files],event:{schema_version:'1',source:draft.source,source_account_id:`demo-${draft.source}`,
      external_message_id:crypto.randomUUID(),external_thread_id:null,occurred_at:new Date().toISOString(),
      sender:{display_name:nullable(draft.name),email:nullable(draft.email),phone:nullable(draft.phone)},subject:nullable(draft.subject),text:draft.text,
      attachments:files.map((file,index)=>({external_attachment_id:crypto.randomUUID(),file_field:`file_${index}`,filename:file.name,mime_type:file.type as IncomingEvent['attachments'][number]['mime_type'],size_bytes:file.size}))}};
    setLast(snapshot);
    await send(snapshot);
  }
  return <>
    <p className="notice">Demo: clasificación simulada por reglas deterministas y archivos locales. No se envían mensajes ni archivos a servicios externos.</p>
    <div className="actions">{Object.keys(presets).map(key=><button type="button" className="secondary" disabled={busy} key={key} onClick={()=>setDraft(presets[key])}>Cargar caso {key}</button>)}</div>
    <p className="muted">A: logo_nuevo.png · B: comprobante.pdf · C: referencia.png. Selecciona el archivo correspondiente en fixtures/files.</p>
    <form onSubmit={submit} className="card">
      <fieldset disabled={busy}>
        <label htmlFor="source">Canal</label><select id="source" value={draft.source} onChange={event=>field('source',event.target.value)}><option value="gmail">Gmail</option><option value="whatsapp">WhatsApp</option></select>
        <div className="grid"><div><label htmlFor="sender-name">Nombre</label><input id="sender-name" value={draft.name} maxLength={150} onChange={event=>field('name',event.target.value)}/></div>
        <div><label htmlFor="sender-email">Email del remitente</label><input id="sender-email" type="email" value={draft.email} maxLength={254} onChange={event=>field('email',event.target.value)}/></div>
        <div><label htmlFor="sender-phone">Teléfono</label><input id="sender-phone" type="tel" value={draft.phone} maxLength={50} placeholder="+1 202 555 0112" onChange={event=>field('phone',event.target.value)}/></div></div>
        <label htmlFor="subject">Asunto</label><input id="subject" value={draft.subject} maxLength={500} onChange={event=>field('subject',event.target.value)}/>
        <label htmlFor="message">Mensaje</label><textarea id="message" value={draft.text} maxLength={10000} rows={4} onChange={event=>field('text',event.target.value)}/>
        <label htmlFor="attachments">Archivos adjuntos</label><input id="attachments" type="file" multiple accept="application/pdf,image/png,image/jpeg,text/plain" onChange={event=>setFiles(Array.from(event.target.files || []))}/>
        <p className="muted">PDF, PNG, JPEG o TXT UTF-8. Máximo {limits.files} archivos; {limits.fileBytes/1048576} MiB por archivo y {limits.totalBytes/1048576} MiB en total. También puedes enviar solo texto.</p>
        <button type="submit">{busy ? 'Procesando mensaje…' : 'Enviar nuevo evento'}</button>
      </fieldset>
    </form>
    <div className="actions"><button type="button" disabled={!last || busy} onClick={()=>last && send(last)}>Reenviar mismo evento</button><span className="muted">Reutiliza mensaje, IDs y archivos del último envío, aunque edites el formulario.</span></div>
    {error && <p className="error" role="alert">{error}</p>}
    {result && <section className="card" aria-label="Resultado de ingestión"><h2>{result.duplicate ? 'Evento ya procesado: sin duplicados' : 'Mensaje procesado'}</h2>
      <p>Cliente: <strong>{({existing:'Existente',created:'Creado provisional',conflict:'Conflicto de identidades'})[result.client_resolution]}</strong>{result.client && <> · <Link href={`/clients/${result.client.id}`}>Abrir ficha de {result.client.display_name}</Link></>}</p>
      <p>Interacción: <code>{result.interaction_id}</code></p><p>Evento: <code>{result.event_id}</code></p>
      {result.warnings.length>0 && <p className="notice">Hay casos pendientes de revisión: {result.warnings.join(', ')}.</p>}
      {!result.documents.length ? <p>Mensaje registrado sin adjuntos. No se creó ningún documento.</p> : <div className="table-scroll"><table><thead><tr><th>Archivo</th><th>Categoría</th><th>SHA-256</th><th>Clasificación</th><th>Almacenamiento</th><th>Confianza</th><th>Acciones</th></tr></thead><tbody>{result.documents.map(doc=><tr key={doc.id} data-document-id={doc.id}><td>{doc.original_filename}</td><td>{categoryLabels[doc.category]}</td><td><code>{doc.sha256.slice(0,12)}…</code></td><td>{statusLabels[doc.classification_status]}</td><td>{statusLabels[doc.storage_status]}</td><td>{doc.confidence === null ? '—' : `${Math.round(doc.confidence*100)} %`}</td><td><Link href={`/documents/${doc.id}`}>Abrir detalle</Link>{doc.storage_status === 'stored' && <> · <a href={`/api/v1/documents/${doc.id}/content`}>Descargar original</a></>}</td></tr>)}</tbody></table></div>}
    </section>}
  </>;
}
