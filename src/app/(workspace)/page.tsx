import Link from 'next/link';
import { z } from 'zod';
import { categoryLabels, displayDate, statusLabels } from '@/domain/presentation';
import { listClients } from '@/server/db/clients';
import { listDocuments } from '@/server/db/documents';
import { searchDependencies } from '@/server/services/dependencies';
import { SearchService } from '@/server/services/search';

type WorkspaceSearchParams = Promise<{ q?: string; client?: string }>;

export default async function Home({ searchParams }: { searchParams: WorkspaceSearchParams }) {
  const params = await searchParams;
  const query = (params.q || '').trim().slice(0, 500);
  const selectedClient = z.uuid().safeParse(params.client).success ? params.client! : null;
  const { db, ai, timezone } = searchDependencies();
  const [clients, documents] = await Promise.all([
    listClients(),
    listDocuments(db, { page: 1 }),
  ]);
  const results = query ? await new SearchService(db, ai, timezone).search(query, selectedClient) : null;
  const recentDocuments = documents.items.slice(0, 8);

  return (
    <div className="organizer">
      <aside className="organizer-panel clients-panel" aria-labelledby="clients-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Directorio</p>
            <h2 id="clients-heading">Clientes</h2>
          </div>
          <span className="count">{clients.length}</span>
        </div>
        {clients.length ? (
          <ul className="client-list">
            {clients.map(client => (
              <li key={client.id}>
                <Link href={`/clients/${client.id}`}>
                  <span className="client-avatar" aria-hidden="true">{client.display_name.slice(0, 1).toLocaleUpperCase('es-CL')}</span>
                  <span className="client-copy">
                    <span className="client-name">{client.display_name}</span>
                    <span className="client-code">CLI-{String(client.client_number).padStart(4, '0')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-empty">Los clientes aparecerán aquí cuando llegue su primer mensaje.</p>
        )}
      </aside>

      <section className="organizer-panel search-panel" aria-labelledby="search-heading">
        <div className="search-intro">
          <p className="eyebrow">Espacio de trabajo</p>
          <h1 id="search-heading">¿Qué documento necesitas?</h1>
          <p className="muted">Busca por cliente, tipo de archivo, canal o fecha. La búsqueda interpreta tu consulta en lenguaje natural.</p>
        </div>
        <form className="ai-search" action="/" role="search">
          <label htmlFor="workspace-query">Buscar en Gmail, WhatsApp y documentos</label>
          <div className="search-input-row">
            <input
              id="workspace-query"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Ej.: cotizaciones de este mes enviadas por Gmail"
              maxLength={500}
            />
            <button type="submit">Buscar</button>
          </div>
        </form>

        {results ? (
          <div className="search-results" aria-live="polite">
            {results.fallback && (
              <p className="notice">La interpretación con IA no estuvo disponible; se muestran coincidencias por texto.</p>
            )}
            <details className="query-details">
              <summary>Ver interpretación de la búsqueda</summary>
              <dl>
                <dt>Cliente</dt><dd>{results.plan.clientName || 'Cualquiera'}</dd>
                <dt>Categoría</dt><dd>{results.plan.category ? categoryLabels[results.plan.category] : 'Cualquiera'}</dd>
                <dt>Canal</dt><dd>{results.plan.sourceChannel ? (results.plan.sourceChannel === 'gmail' ? 'Gmail' : 'WhatsApp') : 'Cualquiera'}</dd>
                <dt>Periodo</dt><dd>{results.plan.dateFrom && results.plan.dateTo ? `${results.plan.dateFrom} – ${results.plan.dateTo}` : 'Cualquier fecha'}</dd>
                <dt>Términos</dt><dd>{results.plan.keywords.join(', ') || 'Sin términos adicionales'}</dd>
              </dl>
            </details>
            {results.ambiguousClients.length ? (
              <section className="ambiguity" aria-labelledby="ambiguous-heading">
                <h2 id="ambiguous-heading">¿A cuál cliente te refieres?</h2>
                <p>Hay más de una coincidencia. Selecciona una para filtrar los resultados.</p>
                <ul>
                  {results.ambiguousClients.map(client => (
                    <li key={client.id}>
                      <Link href={`/?q=${encodeURIComponent(query)}&client=${client.id}`}>{client.display_name}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <section aria-labelledby="results-heading">
                <h2 id="results-heading" className="results-heading">Resultados <span>({results.rows.length})</span></h2>
                {results.rows.length ? (
                  <div className="result-list">
                    {results.rows.map(row => (
                      <article className="result-card" key={row.document_id}>
                        <div className="result-title-row">
                          <h3><Link href={`/documents/${row.document_id}`}>{row.original_filename}</Link></h3>
                          <span className="result-category">{categoryLabels[row.category] || 'Otro'}</span>
                        </div>
                        <p className="result-context">
                          {row.client_id ? <Link href={`/clients/${row.client_id}`}>{row.client_name}</Link> : 'Sin cliente asignado'}
                          {' · '}{row.source === 'gmail' ? 'Gmail' : 'WhatsApp'}
                          {' · '}{displayDate(row.occurred_at, timezone)}
                        </p>
                        <p>{row.summary || row.message_text || 'Sin descripción disponible.'}</p>
                        <span className="status-label">{statusLabels[row.classification_status] || row.classification_status}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="panel-empty">No encontramos documentos para esta consulta.</p>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="search-guidance">
            <span className="search-mark" aria-hidden="true">IA</span>
            <div>
              <h2>Una búsqueda para todos tus canales</h2>
              <p>Los archivos recibidos por correo o WhatsApp se organizan junto al historial de cada cliente.</p>
            </div>
          </div>
        )}
      </section>

      <aside className="organizer-panel documents-panel" aria-labelledby="documents-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Actividad</p>
            <h2 id="documents-heading">Documentos recientes</h2>
          </div>
          <span className="count">{documents.total}</span>
        </div>
        {recentDocuments.length ? (
          <ul className="recent-list">
            {recentDocuments.map(document => (
              <li key={document.id}>
                <Link href={`/documents/${document.id}`}>
                  <span className="file-mark" aria-hidden="true">{document.mime_type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <span className="recent-copy">
                    <span className="recent-name">{document.original_filename}</span>
                    <span className="recent-context">{document.interaction.client?.display_name || 'Sin cliente'} · {document.interaction.source === 'gmail' ? 'Gmail' : 'WhatsApp'}</span>
                    <span className="recent-date">{displayDate(document.created_at, timezone)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-empty">Los documentos recibidos aparecerán aquí.</p>
        )}
      </aside>
    </div>
  );
}
