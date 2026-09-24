import 'server-only';
import { database } from '../db/client';
import { getEnv } from '../config';
import { DeterministicAIProvider } from '../providers/ai/deterministic';
import { LocalFileStorage } from '../providers/storage/local';
import { AppError } from '../errors';
export function ingestDependencies() {
  const env = getEnv();
  if (env.STORAGE_PROVIDER !== 'local' || env.AI_PROVIDER !== 'deterministic') throw new AppError('PROVIDER_NOT_IMPLEMENTED','Esta fase solo admite almacenamiento local y clasificación determinista.',503);
  return {db:database(),ai:new DeterministicAIProvider(),storage:new LocalFileStorage(env.LOCAL_FILES_DIR),
    staging:new LocalFileStorage(env.STAGING_DIR),timezone:env.APP_TIMEZONE,confidenceThreshold:env.CLASSIFICATION_CONFIDENCE_THRESHOLD};
}
