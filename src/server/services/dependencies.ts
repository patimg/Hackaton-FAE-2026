import 'server-only';
import { database } from '../db/client';
import { getEnv } from '../config';
import { RealAIProvider } from '../providers/ai/real';
import { LocalFileStorage } from '../providers/storage/local';
import { GoogleDriveStorage } from '../providers/storage/google-drive';

function aiDependency() { const env=getEnv(); return new RealAIProvider({apiKey:env.AI_API_KEY!,model:env.AI_MODEL!,baseUrl:env.AI_BASE_URL,timeoutMs:env.AI_TIMEOUT_MS}); }
export function ingestDependencies() {
  const env=getEnv();
  const storage = new GoogleDriveStorage({clientId:env.GOOGLE_CLIENT_ID!,clientSecret:env.GOOGLE_CLIENT_SECRET!,refreshToken:env.GOOGLE_REFRESH_TOKEN!,rootFolderId:env.GOOGLE_DRIVE_ROOT_FOLDER_ID!});
  return {db:database(),ai:aiDependency(),storage,staging:new LocalFileStorage(env.STAGING_DIR),timezone:env.APP_TIMEZONE,confidenceThreshold:env.CLASSIFICATION_CONFIDENCE_THRESHOLD};
}
export function searchDependencies() { const env=getEnv(); return {db:database(),ai:aiDependency(),timezone:env.APP_TIMEZONE}; }
