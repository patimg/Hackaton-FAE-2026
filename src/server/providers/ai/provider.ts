import { z } from 'zod';
import { categories } from '../../../domain/documents';
export const classificationSchema = z.strictObject({
  document_id:z.uuid(), category:z.enum(categories), summary:z.string().max(500),
  tags:z.array(z.string().min(1).max(40)).max(8), confidence:z.number().min(0).max(1), reason:z.string().min(1).max(300),
});
export const batchResultSchema = z.strictObject({ schema_version:z.literal('1'), results:z.array(classificationSchema) });
export type Classification = z.infer<typeof classificationSchema>;
export type ClassificationBatch = { text:string; subject:string | null; documents:{ document_id:string; filename:string; mime_type:string; text:string | null }[] };
export type SearchInput = { query:string };
export type SearchPlan = { schema_version:'1'; terms:string[]; mode:'lexical' };
export interface AIProvider {
  classifyDocuments(input:ClassificationBatch): Promise<z.infer<typeof batchResultSchema>>;
  interpretSearch(input:SearchInput): Promise<SearchPlan>;
}
