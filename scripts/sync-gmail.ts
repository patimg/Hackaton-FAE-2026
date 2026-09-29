import { loadLocalEnv } from './local-env';
loadLocalEnv();
import { getEnv } from '@/server/config';
import { GmailProvider } from '@/server/providers/gmail/provider';
import { ingestDependencies } from '@/server/services/dependencies';
import { ingestMessage, type IngestDependencies } from '@/server/services/ingest';

async function poll(provider: GmailProvider, accountId: string, query: string, max: number, startDate: string | undefined, dependencies: IngestDependencies) {
  const messages = await provider.listUnread(query, max, startDate);
  for (const message of messages) {
    if (!message.id) continue;
    try {
      const input = await provider.read(message.id, accountId);
      const result = await ingestMessage(input, { operatorId: getEnv().OPERATOR_USER_ID }, dependencies);
      await provider.markRead(message.id);
      console.log(`Gmail ${message.id}: ${result.result.status}${result.result.duplicate ? ' (duplicate)' : ''}`);
    } catch (error) {
      console.error(`Gmail ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main() {
  const env = getEnv();
  const accountId = env.GMAIL_ACCOUNT_ID || env.GMAIL_USER;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN || !accountId) {
    throw new Error('Gmail requiere credenciales OAuth y GMAIL_ACCOUNT_ID (o GMAIL_USER).');
  }
  const provider = new GmailProvider({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: env.GOOGLE_REFRESH_TOKEN });
  const queryArgument = process.argv.find(argument => argument.startsWith('--query='));
  const query = queryArgument?.slice('--query='.length).trim() || env.GMAIL_QUERY;
  const maxArgument = process.argv.find(argument => argument.startsWith('--max='));
  const max = maxArgument ? Number(maxArgument.slice('--max='.length)) : env.GMAIL_MAX_MESSAGES;
  if (!query || query.length > 500 || !Number.isInteger(max) || max < 1 || max > 100) {
    throw new Error('Usa una búsqueda Gmail de hasta 500 caracteres y un --max entre 1 y 100.');
  }
  if (process.argv.includes('--check')) {
    console.log('Gmail worker configuration and server-only imports are ready.');
    return;
  }
  const dependencies = ingestDependencies();
  await dependencies.storage.assertReady();
  do {
    await poll(provider, accountId, query, max, env.GMAIL_START_DATE, dependencies);
    if (process.argv.includes('--once')) break;
    await new Promise(resolve => setTimeout(resolve, env.GMAIL_POLL_INTERVAL_MS));
  } while (true);
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
