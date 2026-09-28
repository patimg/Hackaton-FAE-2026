import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
export function loadLocalEnv() {
  if (existsSync('.env.local')) loadEnvFile('.env.local');
}
export function requireLocalUrl(value: string | undefined, key: string) {
  if (!value || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) {
    throw new Error(`${key} debe apuntar al entorno local; no se modificará un servidor remoto.`);
  }
  return value;
}
export function writeLocalEnv(values: Record<string, string>) {
  let text = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '# Configuración local generada. No versionar.\n';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync('.env.local', text, { mode: 0o600 });
  chmodSync('.env.local', 0o600);
}
