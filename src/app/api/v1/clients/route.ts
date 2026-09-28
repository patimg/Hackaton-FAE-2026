import { getOperator } from '@/server/auth/operator';
import { listClients } from '@/server/db/clients';
export async function GET() {
  if (!await getOperator()) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  try { return Response.json({ items: await listClients() }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ error: 'DATABASE_UNAVAILABLE' }, { status: 503 }); }
}
