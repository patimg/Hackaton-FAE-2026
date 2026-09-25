import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../../src/config/env';
const valid = { APP_MODE:'demo', SUPABASE_URL:'http://127.0.0.1:54321', SUPABASE_PUBLISHABLE_KEY:'test-public-key', SUPABASE_SERVICE_ROLE_KEY:'test-secret-do-not-echo', OPERATOR_USER_ID:'10000000-0000-4000-8000-000000000001' };
test('demo arranca sin variables Google ni LLM', () => {
  assert.equal(parseEnv(valid).STORAGE_PROVIDER, 'local');
});
test('demo rechaza una base remota y adaptadores externos', () => {
  assert.throws(() => parseEnv({ ...valid, SUPABASE_URL:'https://external.example.test' }), /SUPABASE_URL/);
  assert.throws(() => parseEnv({ ...valid, AI_PROVIDER:'external' }), /AI_PROVIDER/);
  assert.throws(() => parseEnv({ ...valid, STORAGE_PROVIDER:'google-drive' }), /APP_MODE/);
});
test('live exige proveedor y credenciales de IA reales',()=>{
  const live={...valid,APP_MODE:'live',AI_PROVIDER:'openai'};
  assert.throws(()=>parseEnv(live),/AI_API_KEY/);
  assert.equal(parseEnv({...live,AI_MODEL:'gpt-4.1-mini',AI_API_KEY:'test-key'}).AI_PROVIDER,'openai');
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
