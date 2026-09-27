import { redirect } from 'next/navigation';
import { getOperator } from '@/server/auth/operator';
export const dynamic = 'force-dynamic';
export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getOperator()) redirect('/');
  const { error } = await searchParams;
  const message = error === 'unavailable' ? 'No se pudo conectar con el servicio de acceso. Comprueba que Supabase esté iniciado.' : error ? 'No se pudo iniciar sesión. Revisa tus credenciales y que tu cuenta esté habilitada.' : null;
  return <main className="login"><h1>Tu archivo, en orden</h1><p className="muted">Accede a los documentos y al contexto de tus clientes.</p><section className="card"><h2>Iniciar sesión</h2>{message && <p role="alert" className="error">{message}</p>}<form action="/auth/login" method="post"><label htmlFor="email">Correo</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254}/><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128}/><button type="submit">Entrar</button></form></section><p className="muted">Acceso exclusivo para la operadora habilitada. No hay registro público.</p></main>;
}
