import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireOperator } from '@/server/auth/operator';
import { database } from '@/server/db/client';
import { findDocument } from '@/server/db/documents';
import { categoryLabels,statusLabels,displayDate } from '@/domain/presentation';
import { getEnv } from '@/server/config';
export default async function DocumentDetail({params}:{params:Promise<{id:string}>}) {
  await requireOperator();
  const {id}=await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const doc=await findDocument(database(),id);
  if (!doc) notFound();
  const timezone=getEnv().APP_TIMEZONE;
  return <><Link href="/documents">← Documentos</Link><h1>{doc.original_filename}</h1>
    <p className="notice">Clasificación simulada/determinista. No se utilizó un LLM ni OCR.</p>
    <div className="actions">{doc.storage_status === 'stored' && <a className="button" href={`/api/v1/documents/${id}/content`}>Descargar original</a>}{doc.classification_status === 'needs_review' && <Link href="/review">Ir a revisión</Link>}</div>
    <section className="card"><h2>Documento</h2><dl>
      <dt>Cliente</dt><dd>{doc.interaction.client ? <Link href={`/clients/${doc.interaction.client.id}`}>{doc.interaction.client.display_name}</Link> : 'Sin asignar · conflicto de identidades'}</dd>
      <dt>Categoría</dt><dd>{categoryLabels[doc.category]}</dd><dt>Clasificación</dt><dd>{statusLabels[doc.classification_status]}</dd>
      <dt>Almacenamiento</dt><dd>{statusLabels[doc.storage_status]} · local</dd><dt>Tipo / tamaño</dt><dd>{doc.mime_type} · {doc.size_bytes} bytes</dd>
      <dt>SHA-256</dt><dd><code>{doc.sha256}</code></dd><dt>Resumen</dt><dd>{doc.summary || 'Sin resumen'}</dd><dt>Etiquetas</dt><dd>{doc.tags.join(', ') || 'Sin etiquetas'}</dd>
      <dt>Confianza inicial</dt><dd>{doc.confidence === null ? 'Pendiente' : `${Math.round(doc.confidence*100)} % (regla simulada)`}</dd>
      <dt>Motivo inicial</dt><dd>{doc.classification_evidence.reason || 'Pendiente de clasificación'}</dd>
      <dt>Clave almacenada</dt><dd><code>{doc.storage_key || 'No disponible'}</code></dd>
      {doc.desired_folder_key !== doc.stored_folder_key && <><dt>Carpeta deseada</dt><dd><code>{doc.desired_folder_key}</code> (el original no se mueve al revisar)</dd></>}
      {doc.reviewed_at && <><dt>Última revisión</dt><dd>{displayDate(doc.reviewed_at,timezone)}</dd></>}
    </dl>{doc.review_reasons.length>0 && <p className="notice">Pendientes: {doc.review_reasons.join(', ')}</p>}</section>
    <section className="card"><h2>Mensaje original</h2><dl><dt>Canal</dt><dd>{doc.interaction.source === 'gmail' ? 'Gmail' : 'WhatsApp'}</dd><dt>Remitente</dt><dd>{[doc.interaction.sender_snapshot.display_name,doc.interaction.sender_snapshot.email,doc.interaction.sender_snapshot.phone].filter(Boolean).join(' · ') || 'Sin identidad'}</dd>
      <dt>Fecha del mensaje</dt><dd>{displayDate(doc.interaction.occurred_at,timezone)}</dd><dt>Recibido</dt><dd>{displayDate(doc.interaction.received_at,timezone)}</dd><dt>ID externo</dt><dd><code>{doc.interaction.external_message_id}</code></dd><dt>Interacción</dt><dd><code>{doc.interaction.id}</code></dd>
    </dl>{doc.interaction.subject && <h3>{doc.interaction.subject}</h3>}<p className="message">{doc.interaction.message_text || '(Mensaje sin texto)'}</p></section>
  </>;
}
