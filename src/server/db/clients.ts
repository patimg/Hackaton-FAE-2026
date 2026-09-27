import "server-only";
import { database } from './client';
import { requireOperator } from '@/server/auth/operator';
import { z } from 'zod';

export type Client = { id: string; client_number: number; display_name: string; folder_name: string; status: 'provisional' | 'active' | 'archived'; notes: string | null; created_at: string };
export type ClientIdentity = { id: string; kind: 'email' | 'phone'; value_normalized: string };
const fields = 'id,client_number,display_name,folder_name,status,notes,created_at';

export async function listClients() {
  await requireOperator();
  const { data, error } = await database().from('clients').select(fields).order('client_number').limit(100).returns<Client[]>();
  if (error) throw new Error('No se pudieron consultar los clientes. Comprueba Supabase y las migraciones.');
  return data;
}
export async function findClient(id: string) {
  await requireOperator();
  if (!z.uuid().safeParse(id).success) return null;
  const db = database();
  const { data: client, error } = await db.from('clients').select(fields).eq('id', id).maybeSingle<Client>();
  if (error) throw new Error('No se pudo consultar el cliente.');
  if (!client) return null;
  const { data: identities, error: identitiesError } = await db.from('client_identities').select('id,kind,value_normalized').eq('client_id', id).returns<ClientIdentity[]>();
  if (identitiesError) throw new Error('No se pudieron consultar las identidades.');
  return { ...client, identities };
}
