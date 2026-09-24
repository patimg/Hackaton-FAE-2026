import Link from 'next/link';
import { requireOperator } from '@/server/auth/operator';
import { database } from '@/server/db/client';
import { listDocuments } from '@/server/db/documents';
import { DocumentList } from '@/components/document-list';
import { getEnv } from '@/server/config';
export default async function Documents({searchParams}:{searchParams:Promise<{page?:string}>}) {
  await requireOperator();
  const query=await searchParams;
  const page=Math.max(1,Math.min(10000,Number.parseInt(query.page || '1',10) || 1));
  const result=await listDocuments(database(),{page});
  return <><h1>Documentos</h1><p>{result.total} documentos registrados. <Link href="/simulator">Recibir un mensaje de prueba</Link></p>
    <DocumentList documents={result.items} timezone={getEnv().APP_TIMEZONE}/>
    <div className="actions">{page>1 && <Link href={`/documents?page=${page-1}`}>Anterior</Link>}{page*50<result.total && <Link href={`/documents?page=${page+1}`}>Siguiente</Link>}</div></>;
}
