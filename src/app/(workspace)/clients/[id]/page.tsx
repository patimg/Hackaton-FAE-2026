import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findClient } from '@/server/db/clients';
import { database } from '@/server/db/client';
import { listDocuments,interactionSelect,type Interaction } from '@/server/db/documents';
import { DocumentList } from '@/components/document-list';
import { categoryLabels, displayDate } from '@/domain/presentation';
import { getEnv } from '@/server/config';
import { ClientStatusForm } from '@/components/client-status-form';
import { GoogleDriveStorage } from '@/server/providers/storage/google-drive';
export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await findClient(id);
  if (!client) notFound();
  const db=database();
  const docs=await listDocuments(db,{clientId:id});
  const {data:interactions,error}=await db.from('interactions').select(interactionSelect).eq('client_id',id).order('received_at',{ascending:false}).limit(50).returns<Interaction[]>();
  if (error) throw new Error('No se pudo consultar el historial.');
  const timezone=getEnv().APP_TIMEZONE;
  let driveFolderUrl:string|null=null;
  try { const env=getEnv(); const storage=new GoogleDriveStorage({clientId:env.GOOGLE_CLIENT_ID!,clientSecret:env.GOOGLE_CLIENT_SECRET!,refreshToken:env.GOOGLE_REFRESH_TOKEN!,rootFolderId:env.GOOGLE_DRIVE_ROOT_FOLDER_ID!}); driveFolderUrl=await storage.findFolderUrl(`clientes/${client.folder_name}`); } catch { driveFolderUrl=null; }
  const gmailCount=interactions.filter(interaction=>interaction.source==='gmail').length;
  const whatsappCount=interactions.filter(interaction=>interaction.source==='whatsapp').length;
  const categoryCounts=docs.items.reduce<Record<string,number>>((counts,doc)=>{counts[doc.category]=(counts[doc.category]||0)+1;return counts;},{});
  return <main className="client-workspace">
    <Link className="back-link" href="/clients">← Directorio de clientes</Link>
    <section className="client-hero">
      <div className="client-identity"><span className="client-hero-avatar" aria-hidden="true">{client.display_name.slice(0,1).toLocaleUpperCase('es-CL')}</span><div><p className="eyebrow">Ficha de cliente · CLI-{String(client.client_number).padStart(4,'0')}</p><h1>{client.display_name}</h1><p className="muted">{client.status === 'active' ? 'Cliente activo' : client.status === 'archived' ? 'Cliente archivado' : 'Cliente provisional'} · {client.folder_name}</p></div></div>
      <div className="client-hero-actions"><span className={`client-state ${client.status}`}>{client.status === 'active' ? 'Activo' : client.status === 'archived' ? 'Archivado' : 'Provisional'}</span><ClientStatusForm clientId={client.id} status={client.status}/></div>
    </section>
    <section className="client-metrics" aria-label="Resumen del cliente"><div><strong>{docs.total}</strong><span>Documentos</span></div><div><strong>{interactions.length}</strong><span>Interacciones</span></div><div><strong>{client.identities.length}</strong><span>Identidades</span></div></section>
    <div className="client-grid">
      <aside className="client-sidebar">
        <section className="info-panel"><p className="eyebrow">Identidad</p><h2>Datos de contacto</h2>{client.identities.length ? <ul className="identity-list">{client.identities.map(identity=><li key={identity.id}><span className="identity-kind">{identity.kind === 'email' ? 'Correo' : 'Teléfono'}</span><strong>{identity.value_normalized}</strong></li>)}</ul> : <p className="muted">No hay identidades verificadas.</p>}{client.notes&&<p className="client-notes">{client.notes}</p>}</section>
        <section className="info-panel"><p className="eyebrow">Canales</p><h2>Actividad por origen</h2><div className="channel-row"><span>Gmail</span><strong>{gmailCount}</strong></div><div className="channel-row"><span>WhatsApp</span><strong>{whatsappCount}</strong></div></section>
        <section className="info-panel"><p className="eyebrow">Archivo</p><h2>Tipos recibidos</h2>{Object.keys(categoryCounts).length ? <ul className="category-list">{Object.entries(categoryCounts).map(([category,count])=><li key={category}><span>{categoryLabels[category]||category}</span><strong>{count}</strong></li>)}</ul> : <p className="muted">Todavía no hay documentos.</p>}{driveFolderUrl?<a className="drive-folder-link" href={driveFolderUrl} target="_blank" rel="noreferrer">Abrir carpeta en Drive ↗</a>:<p className="panel-hint">La carpeta de Drive aparecerá cuando se guarde el primer documento.</p>}</section>
      </aside>
      <div className="client-content">
        <section className="section-heading"><div><p className="eyebrow">Archivo asociado</p><h2>Documentos relacionados</h2></div><span className="section-count">{docs.total} total</span></section>
        <DocumentList documents={docs.items} timezone={timezone}/>
        <section className="section-heading activity-heading"><div><p className="eyebrow">Historial</p><h2>Actividad reciente</h2></div><span className="section-count">Últimas {Math.min(interactions.length,50)}</span></section>
        {!interactions.length && <p className="empty">Todavía no hay mensajes de este cliente.</p>}
        <div className="activity-list">{interactions.map(interaction=>{const related=docs.items.filter(doc=>doc.interaction_id===interaction.id);return <article className="activity-item" key={interaction.id}><span className={`activity-marker ${interaction.source}`} aria-hidden="true"/><div className="activity-body"><div className="activity-topline"><span className="activity-source">{interaction.source === 'gmail' ? 'Gmail' : 'WhatsApp'}</span><time>{displayDate(interaction.received_at,timezone)}</time></div><h3>{interaction.subject || 'Mensaje sin asunto'}</h3><p className="message">{interaction.message_text || '(Mensaje sin texto)'}</p>{related.length>0&&<ul className="activity-files">{related.map(doc=><li key={doc.id}><Link href={`/documents/${doc.id}`}>{doc.original_filename}</Link><span>{categoryLabels[doc.category]||doc.category}</span></li>)}</ul>}</div></article>})}</div>
      </div>
    </div>
  </main>;
}
