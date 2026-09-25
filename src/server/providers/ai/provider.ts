import { z } from 'zod';
import { categories } from '../../../domain/documents';

export const classificationSchema = z.strictObject({
  document_id:z.uuid(), category:z.enum(categories), summary:z.string().min(1).max(500),
  tags:z.array(z.string().min(1).max(40)).max(8), confidence:z.number().min(0).max(1), reason:z.string().min(1).max(300),
});
export type Classification = z.infer<typeof classificationSchema>;
export type ClassificationInput = { document_id:string; filename:string; mime_type:string; document_text:string|null; message_text:string; subject:string|null; source:'gmail'|'whatsapp'; client_name:string|null };
export const searchPlanSchema = z.strictObject({
  clientName:z.string().min(1).max(150).nullable(), category:z.enum(categories).nullable(), sourceChannel:z.enum(['gmail','whatsapp']).nullable(),
  dateFrom:z.iso.date().nullable(), dateTo:z.iso.date().nullable(), keywords:z.array(z.string().min(1).max(80)).max(8), freeText:z.string().min(1).max(500).nullable(),
});
export type SearchPlan = z.infer<typeof searchPlanSchema>;
export type SearchInput = { query:string; today:string; timezone:string };
export type AIProviderInfo = { kind:'deterministic'|'ai'; provider:string; model:string|null; promptVersion:string };
export interface AIProvider {
  readonly info:AIProviderInfo;
  classifyDocument(input:ClassificationInput):Promise<Classification>;
  interpretSearchQuery(input:SearchInput):Promise<SearchPlan>;
  classifyDocuments(input:{text:string;subject:string|null;documents:{document_id:string;filename:string;mime_type:string;text:string|null}[]}):Promise<{schema_version:'1';results:Classification[]}>;
  interpretSearch(input:{query:string}):Promise<{schema_version:'1';terms:string[];mode:'lexical'}>;
}
// Compatibilidad de transición para tests/adaptadores de la fase 2.
export type LegacyAIProvider = { classifyDocuments(input:{text:string;subject:string|null;documents:{document_id:string;filename:string;mime_type:string;text:string|null}[]}):Promise<{schema_version:'1';results:Classification[]}>; interpretSearch(input:{query:string}):Promise<{schema_version:'1';terms:string[];mode:'lexical'}> };
