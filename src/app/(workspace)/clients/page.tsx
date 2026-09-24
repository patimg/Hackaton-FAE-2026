import Link from 'next/link';
import { listClients } from '@/server/db/clients';
import { EmptyState } from '@/components/empty-state';
export default async function Clients() {
  const clients = await listClients();
  return <><h1>Clientes</h1><p className="muted">Contactos y contexto de los documentos recibidos.</p>{clients.length ? <div className="card table-scroll"><table><thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}><td>CLI-{String(client.client_number).padStart(4, '0')}</td><td><Link href={`/clients/${client.id}`}>{client.display_name}</Link></td><td>{client.status === 'active' ? 'Activo' : 'Provisional'}</td></tr>)}</tbody></table></div> : <EmptyState title="Todavía no hay clientes">Los clientes aparecerán cuando recibas sus mensajes. En demo puedes cargar los datos sintéticos mediante el seed.</EmptyState>}</>;
}
