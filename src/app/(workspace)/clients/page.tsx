import Link from 'next/link';
import { listClients } from '@/server/db/clients';
import { ClientStatusForm } from '@/components/client-status-form';

type Status='all'|'active'|'provisional'|'archived';

export default async function Clients({searchParams}:{searchParams:Promise<{status?:string}>}) {
	const clients=await listClients();
	const requested=(await searchParams).status;
	const status:Status=requested==='active'||requested==='provisional'||requested==='archived'?requested:'all';
	const visible=clients.filter(client=>status==='all'||client.status===status);
	const counts={all:clients.length,active:clients.filter(client=>client.status==='active').length,provisional:clients.filter(client=>client.status==='provisional').length,archived:clients.filter(client=>client.status==='archived').length};
	return <main className="clients-workspace"><section className="clients-hero"><div><p className="eyebrow">Directorio</p><h1>Gestión de clientes</h1><p className="muted">Confirma remitentes reales y aparta el ruido histórico sin borrar conversaciones ni documentos.</p></div><div className="clients-total"><strong>{counts.all}</strong><span>registros</span></div></section><nav className="client-filters" aria-label="Filtrar clientes">{(['all','active','provisional','archived'] as const).map(filter=><Link className={status===filter?'selected':''} href={filter==='all'?'/clients':`/clients?status=${filter}`} key={filter}>{filter==='all'?'Todos':filter==='active'?'Activos':filter==='provisional'?'Provisionales':'Archivados'} <strong>{counts[filter]}</strong></Link>)}</nav>{visible.length?<section className="client-management-grid">{visible.map(client=><article className={`managed-client ${client.status}`} key={client.id}><div className="managed-client-top"><span className="managed-avatar">{client.display_name.slice(0,1).toLocaleUpperCase('es-CL')}</span><div><p className="managed-status">{client.status==='active'?'Activo':client.status==='provisional'?'Provisional':'Archivado'}</p><h2><Link href={`/clients/${client.id}`}>{client.display_name}</Link></h2><p>CLI-{String(client.client_number).padStart(4,'0')}</p></div></div><dl><dt>Carpeta</dt><dd>{client.folder_name}</dd><dt>Creado</dt><dd>{new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(client.created_at))}</dd></dl><div className="managed-client-actions"><Link className="text-action" href={`/clients/${client.id}`}>Ver ficha</Link><ClientStatusForm clientId={client.id} status={client.status}/></div></article>)}</section>:<p className="empty">No hay clientes en este estado.</p>}</main>;
}
