import { z } from 'zod';
import { getOperator } from '@/server/auth/operator';
import { database } from '@/server/db/client';
import { findDocument } from '@/server/db/documents';
import { LocalFileStorage } from '@/server/providers/storage/local';
import { GoogleDriveStorage } from '@/server/providers/storage/google-drive';
import { getEnv } from '@/server/config';
import { AppError,errorResponse } from '@/server/errors';
export const runtime = 'nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    if (!await getOperator()) throw new AppError('UNAUTHORIZED','Acceso no autorizado.',401);
    const {id} = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND','Documento no encontrado.',404);
    const doc = await findDocument(database(),id);
    if (!doc) throw new AppError('NOT_FOUND','Documento no encontrado.',404);
    if (doc.storage_status !== 'stored' || !doc.storage_key) throw new AppError('FILE_NOT_AVAILABLE','El original aún no está disponible para descarga.',409);
    let body:ReadableStream<Uint8Array>;
    try {
      const env = getEnv();
      const storage = doc.storage_provider === 'google-drive'
        ? new GoogleDriveStorage({clientId:env.GOOGLE_CLIENT_ID!,clientSecret:env.GOOGLE_CLIENT_SECRET!,refreshToken:env.GOOGLE_REFRESH_TOKEN!,rootFolderId:env.GOOGLE_DRIVE_ROOT_FOLDER_ID!})
        : new LocalFileStorage(env.LOCAL_FILES_DIR);
      body = await storage.read({key:doc.storage_key});
    }
    catch { throw new AppError('FILE_UNAVAILABLE','El archivo no está disponible en el almacenamiento local.',503); }
    return new Response(body,{headers:{'Content-Type':doc.mime_type,'Content-Length':String(doc.size_bytes),
      'Content-Disposition':`attachment; filename="${doc.safe_filename}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  } catch (error) { return errorResponse(error); }
}
