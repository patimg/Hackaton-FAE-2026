import Link from 'next/link';
import { requireOperator } from '@/server/auth/operator';
import { database } from '@/server/db/client';
import { listDocuments } from '@/server/db/documents';
import { ReviewForm } from '@/components/review-form';
export default async function Review({searchParams}:{searchParams:Promise<{page?:string}>}) {
  await requireOperator();
  const query=await searchParams;
  const page=Math.max(1,Number.parseInt(query.page || '1',10) || 1);
  const result=await listDocuments(database(),{needsReview:true,page});
  return <><h1>Revisión</h1><p>{result.total} documentos pendientes. La confirmación guarda categoría y etiquetas; no borra ni mueve el original.</p>
    {result.items.length===0 && <p className="empty">No hay documentos pendientes de revisión en esta página.</p>}
    {result.items.map(doc=><section className="card" key={`${doc.id}-${doc.version}`} data-document-id={doc.id}><h2><Link href={`/documents/${doc.id}`}>{doc.original_filename}</Link></h2><p>{doc.interaction.client?.display_name || 'Sin asignar'} · {doc.classification_evidence.reason}</p>
      <p className="message">{doc.interaction.message_text}</p><ReviewForm document={{id:doc.id,category:doc.category,tags:doc.tags,version:doc.version,identityPending:doc.interaction.identity_status === 'conflict' || doc.interaction.identity_resolution.missing_identity}}/></section>)}
    <div className="actions">{page>1 && <Link href={`/review?page=${page-1}`}>Anterior</Link>}{page*50<result.total && <Link href={`/review?page=${page+1}`}>Siguiente</Link>}</div>
  </>;
}
