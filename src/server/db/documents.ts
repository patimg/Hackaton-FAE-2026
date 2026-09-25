import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentCategory } from '../../domain/documents';
import { AppError } from '../errors';
export type Interaction = {
  id:string; event_id:string; client_id:string | null; source:'gmail'|'whatsapp'; source_account_id:string;
  external_message_id:string; external_thread_id:string|null; subject:string|null; message_text:string;
  sender_snapshot:{display_name:string|null;email:string|null;phone:string|null};
  occurred_at:string; received_at:string; identity_status:string;
  identity_resolution:{resolution:'existing'|'created'|'conflict';missing_identity:boolean};
  client:{id:string;display_name:string;folder_name:string}|null;
};
export type Document = {
  id:string; interaction_id:string; external_attachment_id:string; original_filename:string; safe_filename:string;
  mime_type:string; size_bytes:number; sha256:string; category:DocumentCategory; summary:string|null;
  tags:string[]; confidence:number|null; classification_status:string; storage_status:string; storage_provider:string;
  storage_key:string|null; staging_key:string|null; desired_folder_key:string|null; stored_folder_key:string|null;
  review_reasons:string[]; classification_evidence:{reason?:string;category?:string;confidence?:number};
  ai_provider:string|null; ai_model:string|null; prompt_version:string|null;
  version:number; reviewed_at:string|null; created_at:string; interaction:Interaction;
};
export const interactionSelect = '*,client:clients!interactions_client_id_fkey(id,display_name,folder_name)';
const documentSelect = `*,interaction:interactions!documents_interaction_id_fkey(${interactionSelect})`;
export async function listDocuments(db:SupabaseClient, options:{needsReview?:boolean;clientId?:string;page?:number} = {}) {
  const page = Math.max(1,options.page || 1);
  let query = db.from('documents').select(documentSelect,{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*50,page*50-1);
  if (options.needsReview) query = query.eq('classification_status','needs_review');
  // Filtrar primero IDs de interacción evita que un join opcional incluya documentos de otros clientes.
  if (options.clientId) {
    const {data,error} = await db.from('interactions').select('id').eq('client_id',options.clientId);
    if (error) throw new AppError('DATABASE_UNAVAILABLE','No se pudo consultar el historial.',503);
    if (!data.length) return {items:[] as Document[],total:0};
    query = query.in('interaction_id',data.map(item => item.id));
  }
  const {data,error,count} = await query.returns<Document[]>();
  if (error) throw new AppError('DATABASE_UNAVAILABLE','No se pudieron consultar los documentos.',503);
  return {items:data,total:count || 0};
}
export async function findDocument(db:SupabaseClient,id:string) {
  const {data,error} = await db.from('documents').select(documentSelect).eq('id',id).maybeSingle<Document>();
  if (error) throw new AppError('DATABASE_UNAVAILABLE','No se pudo consultar el documento.',503);
  return data;
}
export async function getEventContext(db:SupabaseClient,eventId:string) {
  const {data,error} = await db.from('interactions').select(interactionSelect).eq('event_id',eventId).single<Interaction>();
  if (error) throw new AppError('DATABASE_UNAVAILABLE','No se pudo recuperar la interacción.',503,eventId);
  const documents = await db.from('documents').select('*').eq('interaction_id',data.id).order('external_attachment_id').returns<Document[]>();
  if (documents.error) throw new AppError('DATABASE_UNAVAILABLE','No se pudieron recuperar los adjuntos.',503,eventId);
  return {interaction:data,documents:documents.data};
}
