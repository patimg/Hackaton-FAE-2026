import { loadLocalEnv } from './local-env';
import { RealAIProvider } from '../src/server/providers/ai/real';

loadLocalEnv();

async function main() {
  const apiKey=process.env.AI_API_KEY;
  const model=process.env.AI_MODEL;
  const baseUrl=process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const timeoutMs=Number(process.env.AI_TIMEOUT_MS || 10000);
  if (!apiKey || !model) throw new Error('Configura AI_API_KEY y AI_MODEL en .env.local.');
  const provider=new RealAIProvider({apiKey,model,baseUrl,timeoutMs});
  await provider.healthCheck();
  console.log(`IA disponible: ${baseUrl} / ${model}`);
}

main().catch(error=>{
  console.error(error instanceof Error ? error.message : 'No se pudo verificar la IA.');
  process.exitCode=1;
});