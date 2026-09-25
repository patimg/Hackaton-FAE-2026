import 'server-only';
import { database } from '../db/client';
import { getEnv } from '../config';
import { DeterministicAIProvider } from '../providers/ai/deterministic';
import { RealAIProvider } from '../providers/ai/real';
import { LocalFileStorage } from '../providers/storage/local';
import { AppError } from '../errors';

function aiDependency() { const env=getEnv(); return env.AI_PROVIDER==='deterministic' ? new DeterministicAIProvider() : new RealAIProvider({apiKey:env.AI_API_KEY!,model:env.AI_MODEL!,baseUrl:env.AI_BASE_URL,timeoutMs:env.AI_TIMEOUT_MS}); }
export function ingestDependencies() {
  const env=getEnv();
  if(env.STORAGE_PROVIDER!=='local') throw new AppError('PROVIDER_NOT_IMPLEMENTED','Esta fase solo admite almacenamiento local.',503);
  return {db:database(),ai:aiDependency(),storage:new LocalFileStorage(env.LOCAL_FILES_DIR),staging:new LocalFileStorage(env.STAGING_DIR),timezone:env.APP_TIMEZONE,confidenceThreshold:env.CLASSIFICATION_CONFIDENCE_THRESHOLD};
}
export function searchDependencies() { const env=getEnv(); return {db:database(),ai:aiDependency(),timezone:env.APP_TIMEZONE}; }
