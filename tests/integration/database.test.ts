import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { loadLocalEnv, requireLocalUrl } from '../../scripts/local-env';
loadLocalEnv();
async function connection() {
  if (process.env.APP_MODE !== 'demo') throw new Error('Pruebas solo en demo local.');
  const client = new pg.Client({ connectionString: requireLocalUrl(process.env.DATABASE_URL, 'DATABASE_URL') });
  await client.connect();
  return client;
}
test('seed aditivo, códigos visibles y persistencia de clientes', async () => {
  const db = await connection();
  try {
    const sql = await readFile('supabase/seed.sql','utf8');
    await db.query(sql);
    const first = await db.query('select id,display_name,folder_name from clients order by id');
    await db.query(sql);
    const second = await db.query('select id,display_name,folder_name from clients order by id');
    assert.deepEqual(second.rows,first.rows);
    assert.ok(second.rows.some(row => row.folder_name === 'CLI-0012 - Carolina Perez'));
    assert.ok(second.rows.some(row => row.display_name === 'Juan Soto'));
  } finally { await db.end(); }
});
test('UNIQUE, hashes, taxonomía y relaciones rechazan datos inválidos', async () => {
  const db = await connection();
  try {
    await db.query('begin');
    const rejects = async (sql: string, values: unknown[], code: string) => {
      await db.query('savepoint invalid_input');
      await assert.rejects(db.query(sql,values), (error: unknown) => (error as {code:string}).code === code);
      await db.query('rollback to savepoint invalid_input');
    };
    const event = await db.query("insert into processed_events(source,source_account_id,external_message_id,payload_sha256) values('gmail','integration-test','event-1',$1) returning id", ['a'.repeat(64)]);
    await rejects("insert into processed_events(source,source_account_id,external_message_id,payload_sha256) values('gmail','integration-test','event-1',$1)", ['a'.repeat(64)], '23505');
    await rejects("insert into processed_events(source,source_account_id,external_message_id,payload_sha256) values('gmail','integration-test','bad-hash','invalid')", [], '23514');
    await rejects("insert into client_identities(client_id,kind,value_raw,value_normalized,verification_source) values($1,'email','carolina@example.test','carolina@example.test','manual')", ['10000000-0000-4000-8000-000000000012'], '23505');
    const request = await db.query("insert into requests(client_id,title) values($1,'Prueba transaccional') returning id", ['10000000-0000-4000-8000-000000000012']);
    await rejects("insert into orders(client_id,request_id,reference,title) values($1,$2,'TEST','Test')", ['10000000-0000-4000-8000-000000000013',request.rows[0].id], '23503');
    const interaction = await db.query("insert into interactions(event_id,client_id,source,source_account_id,external_message_id,occurred_at,identity_status) values($1,$2,'gmail','integration-test','event-1',now(),'resolved') returning id", [event.rows[0].id,'10000000-0000-4000-8000-000000000012']);
    const insertDoc = "insert into documents(interaction_id,external_attachment_id,original_filename,safe_filename,mime_type,size_bytes,sha256,category) values($1,'attachment-1','sample.txt','sample.txt','text/plain',12,$2,$3)";
    await rejects(insertDoc,[interaction.rows[0].id,'b'.repeat(64),'identificacion'],'23514');
    await rejects(insertDoc,[interaction.rows[0].id,'invalid','otro'],'23514');
    await db.query(insertDoc,[interaction.rows[0].id,'b'.repeat(64),'entregable']);
    await rejects(insertDoc,[interaction.rows[0].id,'b'.repeat(64),'entregable'],'23505');
    await rejects("update clients set client_number=99 where id=$1",['10000000-0000-4000-8000-000000000012'],'23514');
  } finally { await db.query('rollback'); await db.end(); }
});
test('anon y authenticated no acceden directamente a tablas de negocio', async () => {
  const db = await connection();
  try {
    for (const role of ['anon','authenticated']) {
      for (const table of ['clients','client_identities','requests','orders','processed_events','interactions','documents']) {
        await db.query('begin');
        await db.query(`set local role ${role}`);
        await assert.rejects(db.query(`select * from public.${table}`), (error: unknown) => (error as {code:string}).code === '42501');
        await db.query('rollback');
      }
    }
  } finally { await db.query('rollback'); await db.end(); }
});
test('Auth real acepta a operadora local; sesión no da acceso directo a negocio', async () => {
  const url = requireLocalUrl(process.env.SUPABASE_URL,'SUPABASE_URL');
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth:{persistSession:false,autoRefreshToken:false} });
  const { data,error } = await client.auth.signInWithPassword({ email:process.env.DEMO_AUTH_EMAIL!,password:process.env.DEMO_AUTH_PASSWORD! });
  assert.equal(error,null);
  assert.equal(data.user?.id,process.env.OPERATOR_USER_ID);
  const rows = await client.from('clients').select('id');
  assert.ok(rows.error);
  await client.auth.signOut();
});


test('registro público permanece cerrado con proveedor email habilitado', async () => {
  const url = requireLocalUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  const client = createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY!, { auth:{persistSession:false,autoRefreshToken:false} });
  const { data, error } = await client.auth.signUp({ email:'registro-bloqueado@example.test', password:process.env.DEMO_AUTH_PASSWORD! });
  assert.equal(error?.code, 'signup_disabled');
  assert.ok(!data.session);
  assert.ok(!data.user);
});
