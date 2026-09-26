import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, requireLocalUrl } from '../../scripts/local-env';

loadLocalEnv();

async function connection() {
  const client = new pg.Client({ connectionString: requireLocalUrl(process.env.DATABASE_URL, 'DATABASE_URL') });
  await client.connect();
  return client;
}

test('restricciones de identidad, relaciones y documentos se aplican transaccionalmente', async () => {
  const db = await connection();
  const firstClient = randomUUID();
  const secondClient = randomUUID();
  const eventId = randomUUID();
  try {
    await db.query('begin');
    await db.query("insert into clients(id,display_name) values($1,'DB-TEST-UNO'),($2,'DB-TEST-DOS')", [firstClient, secondClient]);
    await db.query("insert into client_identities(client_id,kind,value_raw,value_normalized,verification_source) values($1,'email','uno@example.test','uno@example.test','manual')", [firstClient]);
    const rejects = async (sql: string, values: unknown[], code: string) => {
      await db.query('savepoint invalid_input');
      await assert.rejects(db.query(sql, values), (error: unknown) => (error as { code: string }).code === code);
      await db.query('rollback to savepoint invalid_input');
    };
    await rejects("insert into client_identities(client_id,kind,value_raw,value_normalized,verification_source) values($1,'email','uno@example.test','uno@example.test','manual')", [secondClient], '23505');
    await rejects("insert into processed_events(source,source_account_id,external_message_id,payload_sha256) values('gmail','database-test','duplicate',$1)", ['invalid'], '23514');
    const event = await db.query("insert into processed_events(id,source,source_account_id,external_message_id,payload_sha256) values($1,'gmail','database-test','event-1',$2) returning id", [eventId, 'a'.repeat(64)]);
    await rejects("insert into orders(client_id,request_id,reference,title) values($1,$2,'DB-TEST','Test')", [secondClient, (await db.query("insert into requests(client_id,title) values($1,'Solicitud DB test') returning id", [firstClient])).rows[0].id], '23503');
    const interaction = await db.query("insert into interactions(event_id,client_id,source,source_account_id,external_message_id,occurred_at,identity_status) values($1,$2,'gmail','database-test','event-1',now(),'resolved') returning id", [event.rows[0].id, firstClient]);
    const insertDoc = "insert into documents(interaction_id,external_attachment_id,original_filename,safe_filename,mime_type,size_bytes,sha256,category) values($1,'attachment-1','sample.txt','sample.txt','text/plain',12,$2,$3)";
    await rejects(insertDoc, [interaction.rows[0].id, 'b'.repeat(64), 'categoria-invalida'], '23514');
    await rejects(insertDoc, [interaction.rows[0].id, 'invalid', 'otro'], '23514');
    await db.query(insertDoc, [interaction.rows[0].id, 'b'.repeat(64), 'entregable']);
    await rejects(insertDoc, [interaction.rows[0].id, 'b'.repeat(64), 'entregable'], '23505');
    await rejects('update clients set client_number=99 where id=$1', [firstClient], '23514');
  } finally {
    await db.query('rollback');
    await db.end();
  }
});

test('anon y authenticated no acceden directamente a tablas de negocio', async () => {
  const db = await connection();
  try {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['clients', 'client_identities', 'requests', 'orders', 'processed_events', 'interactions', 'documents']) {
        await db.query('begin');
        await db.query(`set local role ${role}`);
        await assert.rejects(db.query(`select * from public.${table}`), (error: unknown) => (error as { code: string }).code === '42501');
        await db.query('rollback');
      }
    }
  } finally {
    await db.query('rollback');
    await db.end();
  }
});

test('Auth real acepta a la operadora local; sesión no da acceso directo a negocio', async () => {
  const url = requireLocalUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: process.env.LOCAL_OPERATOR_EMAIL!, password: process.env.LOCAL_OPERATOR_PASSWORD! });
  assert.equal(error, null);
  assert.equal(data.user?.id, process.env.OPERATOR_USER_ID);
  const rows = await client.from('clients').select('id');
  assert.ok(rows.error);
  await client.auth.signOut();
});

test('registro público permanece cerrado con proveedor email habilitado', async () => {
  const url = requireLocalUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({
    email: `signup-disabled-${randomUUID()}@example.test`,
    password: process.env.LOCAL_OPERATOR_PASSWORD!,
  });
  assert.equal(error?.code, 'signup_disabled');
  assert.ok(!data.session);
  assert.ok(!data.user);
});
