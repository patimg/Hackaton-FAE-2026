import Link from 'next/link';
import type { Document } from '@/server/db/documents';
import { categoryLabels,displayDate,statusLabels } from '@/domain/presentation';
export function DocumentList({documents,timezone}:{documents:Document[];timezone:string}) {
  if (!documents.length) return <p className="empty">No hay documentos en esta vista.</p>;
  return <div className="card table-scroll"><table><thead><tr><th>Nombre</th><th>Cliente</th><th>Categoría</th><th>Canal</th><th>Recepción</th><th>Clasificación</th><th>Almacenamiento</th></tr></thead><tbody>{documents.map(doc=><tr key={doc.id}>
    <td><Link href={`/documents/${doc.id}`}>{doc.original_filename}</Link></td>
    <td>{doc.interaction.client ? <Link href={`/clients/${doc.interaction.client.id}`}>{doc.interaction.client.display_name}</Link> : 'Sin asignar'}</td>
    <td>{categoryLabels[doc.category]}</td><td>{doc.interaction.source === 'gmail' ? 'Gmail' : 'WhatsApp'}</td><td>{displayDate(doc.interaction.received_at,timezone)}</td>
    <td>{statusLabels[doc.classification_status]}</td><td>{statusLabels[doc.storage_status]}</td>
  </tr>)}</tbody></table></div>;
}
