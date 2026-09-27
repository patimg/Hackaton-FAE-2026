import Link from 'next/link';
import { requireOperator } from '@/server/auth/operator';
export const dynamic = 'force-dynamic';
const links = [['/', 'Panel principal'], ['/clients', 'Clientes'], ['/review', 'Revisión']];
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return <><a className="skip" href="#content">Ir al contenido</a><header><Link className="brand" href="/">Archivo <span>Gestión documental</span></Link><span className="badge">Gmail · WhatsApp · Google Drive</span><form action="/auth/logout" method="post"><button type="submit">Cerrar sesión</button></form></header><nav aria-label="Navegación principal">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav><main id="content">{children}</main></>;
}
