import Link from 'next/link';
import { requireOperator } from '@/server/auth/operator';
import { getEnv } from '@/server/config';
export const dynamic = 'force-dynamic';
const links = [['/', 'Inicio'], ['/clients', 'Clientes'], ['/documents', 'Documentos'], ['/review', 'Revisión'], ['/search', 'Búsqueda'], ['/simulator', 'Simulador de entrada']];
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  const demo = getEnv().APP_MODE === 'demo';
  return <><a className="skip" href="#content">Ir al contenido</a><header><strong>Archivo · Gestión documental</strong><span className="badge">{demo ? 'DEMO · Archivos locales · Clasificación determinista' : 'Aplicación · Base documental'}</span><form action="/auth/logout" method="post"><button type="submit">Cerrar sesión</button></form></header><nav aria-label="Navegación principal">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav><main id="content">{children}</main></>;
}
