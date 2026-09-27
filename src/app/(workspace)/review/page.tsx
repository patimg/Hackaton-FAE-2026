import Link from 'next/link';
import { requireOperator } from '@/server/auth/operator';
import { database } from '@/server/db/client';
import { listDocuments, listPendingIdentityInteractions } from '@/server/db/documents';
import { ReviewForm } from '@/components/review-form';
import { IdentityResolutionForm } from '@/components/identity-resolution-form';
import { listClients } from '@/server/db/clients';

export default async function Review({searchParams}:{searchParams:Promise<{page?:string;view?:string}>}) {
  await requireOperator();
  const query=await searchParams;
  const page=Math.max(1,Number.parseInt(query.page || '1',10) || 1);
  const view=query.view==='identities'?'identities':'documents';
  const db=database();
  const result=view==='documents'?await listDocuments(db,{needsReview:true,page}):null;
  const identities=view==='identities'?await listPendingIdentityInteractions(db):null;
  const clients=await listClients();
  const total=view==='documents'?result!.total:identities!.total;
  return <main className="review-workspace"><section className="review-hero"><div><p className="eyebrow">Control de calidad</p><h1>Revisión humana</h1><p className="muted">Confirma las decisiones de la IA y resuelve identidades antes de cerrar cada caso.</p></div><strong className="review-total">{total}<span>pendientes</span></strong></section><nav className="review-tabs" aria-label="Tipo de revisión"><Link className={view==='documents'?'selected':''} href="/review">Documentos <strong>{result?.total??0}</strong></Link><Link className={view==='identities'?'selected':''} href="/review?view=identities">Identidades <strong>{identities?.total??0}</strong></Link></nav>
    {view==='documents'?<><p className="review-note">La revisión guarda categoría y etiquetas; no borra ni mueve el original.</p>{result!.items.length===0&&<p className="empty">No hay documentos pendientes de revisión en esta página.</p>}{result!.items.map(doc=><section className="card" key={`${doc.id}-${doc.version}`} data-document-id={doc.id}><h2><Link href={`/documents/${doc.id}`}>{doc.original_filename}</Link></h2><p>{doc.interaction.client?.display_name || 'Sin asignar'} · {doc.classification_evidence.reason}</p><p className="message">{doc.interaction.message_text}</p>{(doc.interaction.identity_status === 'conflict' || doc.interaction.identity_resolution.missing_identity) && <IdentityResolutionForm interactionId={doc.interaction.id} clients={clients}/>}<ReviewForm document={{id:doc.id,category:doc.category,tags:doc.tags,version:doc.version,identityPending:doc.interaction.identity_status === 'conflict' || doc.interaction.identity_resolution.missing_identity}}/></section>)}<div className="actions">{page>1&&<Link href={`/review?page=${page-1}`}>Anterior</Link>}{page*50<result!.total&&<Link href={`/review?page=${page+1}`}>Siguiente</Link>}</div></>:<><p className="review-note">Estas interacciones no tienen una identidad confirmada. Asignarlas no elimina el historial.</p>{identities!.items.length===0&&<p className="empty">No hay identidades pendientes de resolución.</p>}{identities!.items.map(interaction=><section className="card identity-review-card" key={interaction.id}><div className="identity-review-top"><div><p className="eyebrow">{interaction.source==='gmail'?'Gmail':'WhatsApp'} · {new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(interaction.received_at))}</p><h2>{interaction.subject||'Mensaje sin asunto'}</h2><p className="muted">{interaction.sender_snapshot.display_name||'Remitente sin nombre'} · {interaction.sender_snapshot.email||interaction.sender_snapshot.phone||'Sin identidad verificable'}</p></div><span className="status-label">{interaction.identity_status==='conflict'?'Conflicto':'Sin confirmar'}</span></div><p className="message">{interaction.message_text||'(Mensaje sin texto)'}</p><IdentityResolutionForm interactionId={interaction.id} clients={clients}/></section>)}</>}
  </main>;
}
