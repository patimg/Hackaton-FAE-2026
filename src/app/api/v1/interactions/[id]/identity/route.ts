import { z } from 'zod';
import { authorizeMutation } from '@/server/auth/mutation';
import { database } from '@/server/db/client';
import { AppError,errorResponse } from '@/server/errors';

const schema=z.strictObject({client_id:z.uuid()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const operator=await authorizeMutation(request);
    const {id}=await params;
    if(!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND','Interacción no encontrada.',404);
    const body=await request.json();
    const parsed=schema.safeParse(body);
    if(!parsed.success) throw new AppError('INVALID_IDENTITY_RESOLUTION','Selecciona un cliente válido.');
    const {data,error}=await database().rpc('resolve_interaction_identity',{p_interaction_id:id,p_client_id:parsed.data.client_id,p_actor:operator.id});
    if(error) {
      if(error.code==='23505') throw new AppError('IDENTITY_CONFLICT','La identidad ya pertenece a otro cliente.',409);
      if(error.code==='P0002') throw new AppError('NOT_FOUND','Interacción o cliente no encontrado.',404);
      throw new AppError('DATABASE_UNAVAILABLE','No se pudo resolver la identidad.',503,id);
    }
    return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return errorResponse(error); }
}