import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { loadLocalEnv, requireLocalUrl } from './local-env';
async function main() {
  loadLocalEnv();
  if (process.env.APP_MODE !== 'demo') throw new Error('El seed sintético solo se permite en demo.');
  const connectionString = requireLocalUrl(process.env.DATABASE_URL, 'DATABASE_URL');
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query(await readFile('supabase/seed.sql', 'utf8'));
    const result = await client.query('select display_name,folder_name from public.clients order by client_number');
    console.log('Seed aditivo completado:', result.rows);
  } finally { await client.end(); }
}
main().catch(() => { console.error('No se pudo ejecutar el seed. Revisa Supabase local, demo:setup y las migraciones.'); process.exitCode=1; });
