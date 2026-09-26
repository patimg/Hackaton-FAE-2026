import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../../src/config/env';
const valid = {
  SUPABASE_URL:'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY:'test-public-key',
  SUPABASE_SERVICE_ROLE_KEY:'test-secret-do-not-echo',
  OPERATOR_USER_ID:'10000000-0000-4000-8000-000000000001',
  GOOGLE_CLIENT_ID:'test-client',
  GOOGLE_CLIENT_SECRET:'test-secret',
  GOOGLE_REFRESH_TOKEN:'test-refresh-token',
  GOOGLE_DRIVE_ROOT_FOLDER_ID:'test-folder',
  GMAIL_USER:'operator@example.test',
  AI_API_KEY:'test-ai-key',
  AI_MODEL:'test-model',
  INGEST_API_TOKEN:'test-ingest-token',
};
test('la configuración operativa exige Drive, OAuth, IA y token de ingestión', () => {
  assert.equal(parseEnv(valid).STORAGE_PROVIDER, 'google-drive');
  assert.equal(parseEnv(valid).AI_PROVIDER, 'openai');
  assert.throws(() => parseEnv({ ...valid, STORAGE_PROVIDER:'local' }), /STORAGE_PROVIDER/);
  assert.throws(() => parseEnv({ ...valid, AI_PROVIDER:'deterministic' }), /AI_PROVIDER/);
  assert.throws(() => parseEnv({ ...valid, GOOGLE_REFRESH_TOKEN:undefined }), /GOOGLE_CLIENT_ID/);
  assert.throws(() => parseEnv({ ...valid, INGEST_API_TOKEN:'' }), /INGEST_API_TOKEN/);
  assert.throws(() => parseEnv({ ...valid, GMAIL_USER:undefined }), /GMAIL_USER/);
});
test('error de configuración identifica campos sin revelar secretos', () => {
  assert.throws(() => parseEnv({ ...valid, OPERATOR_USER_ID:'invalid' }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /OPERATOR_USER_ID/);
    assert.ok(!error.message.includes(valid.SUPABASE_SERVICE_ROLE_KEY));
    return true;
  });
});
test('claves vacías, zona horaria y origen inválidos impiden arranque', () => {
  assert.throws(() => parseEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY:'' }));
  assert.throws(() => parseEnv({ ...valid, APP_TIMEZONE:'invalid' }));
  assert.throws(() => parseEnv({ ...valid, APP_BASE_URL:'javascript:alert(1)' }));
});

test('URLs malformadas fallan sin incluir su contenido en el mensaje', () => {
  const secret = 'not-a-url-private-value';
  assert.throws(() => parseEnv({ ...valid, SUPABASE_URL:secret }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message,/SUPABASE_URL/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});
