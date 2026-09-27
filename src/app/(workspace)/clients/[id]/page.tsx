import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findClient } from '@/server/db/clients';
import { database } from '@/server/db/client';
import { listDocuments,interactionSelect,type Interaction } from '@/server/db/documents';
import { DocumentList } from '@/components/document-list';
import { displayDate } from '@/domain/presentation';
import { getEnv } from '@/server/config';
export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await findClient(id);
  if (!client) notFound();
  const db=database();
  const docs=await listDocuments(db,{clientId:id});
  const {data:interactions,error}=await db.from('interactions').select(interactionSelect).eq('client_id',id).order('received_at',{ascending:false}).limit(50).returns<Interaction[]>();
  if (error) throw new Error('No se pudo consultar el historial.');
  const timezone=getEnv().APP_TIMEZONE;
  return <><Link href="/clients">← Clientes</Link><h1>{client.display_name}</h1><section className="card"><dl><dt>Código</dt><dd>CLI-{String(client.client_number).padStart(4, '0')}</dd><dt>Estado</dt><dd>{client.status === 'active' ? 'Activo' : 'Provisional'}</dd><dt>Carpeta prevista</dt><dd>{client.folder_name}</dd>{client.identities.map(identity => <div key={identity.id} style={{ display: 'contents' }}><dt>{identity.kind === 'email' ? 'Correo' : 'Teléfono'}</dt><dd>{identity.value_normalized}</dd></div>)}</dl>{client.notes && <p className="muted">{client.notes}</p>}</section><h2>Documentos relacionados</h2><DocumentList documents={docs.items} timezone={timezone}/><h2>Interacciones recientes</h2>{!interactions.length && <p className="empty">Todavía no hay mensajes de este cliente.</p>}{interactions.map(interaction=><section className="card" key={interaction.id}><h3>{interaction.subject || 'Mensaje sin asunto'}</h3><p className="muted">{interaction.source} · {displayDate(interaction.received_at,timezone)}</p><p className="message">{interaction.message_text || '(Sin texto)'}</p><p>Interacción: <code>{interaction.id}</code></p><ul>{docs.items.filter(doc=>doc.interaction_id===interaction.id).map(doc=><li key={doc.id}><Link href={`/documents/${doc.id}`}>{doc.original_filename}</Link></li>)}</ul></section>)}<p className="muted">Se muestran hasta 50 documentos y 50 interacciones recientes.</p></>;
}
