import { z } from 'zod';
import { authorizeMutation } from '@/server/auth/mutation';
import { database } from '@/server/db/client';
import { findDocument } from '@/server/db/documents';
import { categories } from '@/domain/documents';
import { AppError,errorResponse } from '@/server/errors';
import { readBoundedBody } from '@/server/files/validate';
import { folderFor } from '@/server/files/folder';
import { getEnv } from '@/server/config';
const reviewSchema = z.strictObject({category:z.enum(categories),tags:z.array(z.string().trim().min(1).max(40)).max(8),version:z.number().int().positive()});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const operator = await authorizeMutation(request);
    const {id} = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError('NOT_FOUND','Documento no encontrado.',404);
    let input:unknown;
    try { input=JSON.parse((await readBoundedBody(request,8192)).toString('utf8')); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError('INVALID_REVIEW','Se requiere JSON válido.'); }
    const parsed=reviewSchema.safeParse(input);
    if (!parsed.success) throw new AppError('INVALID_REVIEW','Revisa categoría, etiquetas (máximo 8) y versión.');
    const db=database();
    const doc=await findDocument(db,id);
    if (!doc) throw new AppError('NOT_FOUND','Documento no encontrado.',404);
    const unresolved=doc.interaction.identity_status === 'conflict' || doc.interaction.identity_resolution.missing_identity;
    const {data,error}=await db.from('documents').update({category:parsed.data.category,tags:[...new Set(parsed.data.tags)],
      classification_status:unresolved ? 'needs_review' : 'reviewed',review_reasons:unresolved ? doc.review_reasons.filter(reason => ['IDENTITY_CONFLICT','MISSING_IDENTITY'].includes(reason)) : [],
      reviewed_at:new Date().toISOString(),reviewed_by:operator.id,version:doc.version+1,
      desired_folder_key:folderFor({clientFolder:doc.interaction.client?.folder_name || null,receivedAt:doc.interaction.received_at,
        timezone:getEnv().APP_TIMEZONE,category:parsed.data.category,needsReview:unresolved}),
    }).eq('id',id).eq('version',parsed.data.version).eq('classification_status','needs_review').select('id').maybeSingle();
    if (error) throw new AppError('DATABASE_UNAVAILABLE','No se pudo guardar la revisión.',503);
    if (!data) throw new AppError('REVIEW_CONFLICT','El documento cambió. Recarga antes de confirmar.',409);
    return Response.json({id,identity_pending:unresolved},{headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return errorResponse(error); }
}
