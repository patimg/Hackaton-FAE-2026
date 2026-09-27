import { z } from 'zod';
import { authorizeMutation } from '@/server/auth/mutation';
import { database } from '@/server/db/client';
import { AppError, errorResponse } from '@/server/errors';

const schema=z.strictObject({status:z.enum(['provisional','active','archived'])});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    await authorizeMutation(request);
    const {id}=await params;
    if(!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND','Cliente no encontrado.',404);
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success) throw new AppError('INVALID_CLIENT_STATUS','Estado de cliente inválido.');
    const {data,error}=await database().from('clients').update({status:parsed.data.status}).eq('id',id).select('id,status').maybeSingle();
    if(error) throw new AppError('DATABASE_UNAVAILABLE','No se pudo actualizar el estado del cliente.',503);
    if(!data) throw new AppError('NOT_FOUND','Cliente no encontrado.',404);
    return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return errorResponse(error); }
}