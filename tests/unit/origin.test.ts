import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin } from '../../src/server/auth/origin';

test('acepta mismo origen y alias de loopback local', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000', 'http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000', 'http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://[::1]:3000', 'http://127.0.0.1:3000'), true);
});

test('rechaza orígenes remotos y diferencias de esquema o puerto', () => {
  assert.equal(isAllowedOrigin('https://attacker.example', 'http://localhost:3000'), false);
  assert.equal(isAllowedOrigin('http://localhost:3001', 'http://127.0.0.1:3000'), false);
  assert.equal(isAllowedOrigin('https://localhost:3000', 'http://127.0.0.1:3000'), false);
  assert.equal(isAllowedOrigin(null, 'http://localhost:3000'), false);
});
