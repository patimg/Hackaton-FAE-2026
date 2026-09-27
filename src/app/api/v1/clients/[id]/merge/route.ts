import { z } from 'zod';
import { authorizeMutation } from '@/server/auth/mutation';
import { database } from '@/server/db/client';
import { AppError,errorResponse } from '@/server/errors';
import { getEnv } from '@/server/config';
import { GoogleDriveStorage } from '@/server/providers/storage/google-drive';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const operator=await authorizeMutation(request);const {id}=await params;
    if(!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND','Cliente no encontrado.',404);
    const parsed=z.strictObject({merged_id:z.uuid()}).safeParse(await request.json());
    if(!parsed.success||parsed.data.merged_id===id) throw new AppError('INVALID_CLIENT_MERGE','Selecciona otro cliente para fusionar.');
    const db=database();const {data:clients,error:lookupError}=await db.from('clients').select('id,folder_name').in('id',[id,parsed.data.merged_id]);
    if(lookupError) throw new AppError('DATABASE_UNAVAILABLE','No se pudieron consultar los clientes.',503);
    if(clients.length!==2) throw new AppError('NOT_FOUND','Cliente no encontrado.',404);
    const survivor=clients.find(client=>client.id===id)!;const merged=clients.find(client=>client.id===parsed.data.merged_id)!;const env=getEnv();const storage=new GoogleDriveStorage({clientId:env.GOOGLE_CLIENT_ID!,clientSecret:env.GOOGLE_CLIENT_SECRET!,refreshToken:env.GOOGLE_REFRESH_TOKEN!,rootFolderId:env.GOOGLE_DRIVE_ROOT_FOLDER_ID!});
    await storage.mergeClientFolders(`clientes/${merged.folder_name}`,`clientes/${survivor.folder_name}`);
    const {data,error}=await db.rpc('merge_clients',{p_survivor_id:id,p_merged_id:parsed.data.merged_id,p_actor:operator.id});
    if(error){throw new AppError(error.code==='23505'?'IDENTITY_CONFLICT':'DATABASE_UNAVAILABLE',error.code==='23505'?'Las identidades no se pueden fusionar porque entran en conflicto.':'Drive se actualizó, pero no se pudo consolidar la base. Revisa el cliente superviviente.',error.code==='23505'?409:503,id);}
    return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error){return errorResponse(error);}
}