import { z } from 'zod';

export const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain'] as const;
const id = z.string().trim().min(1).max(255);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
export const incomingEventSchema = z.strictObject({
  schema_version: z.literal('1'),
  source: z.enum(['gmail', 'whatsapp']),
  source_account_id: id,
  external_message_id: id,
  external_thread_id: id.nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
  sender: z.strictObject({
    display_name: nullableText(150),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()).nullable(),
    phone: z.string().trim().min(1).max(50).nullable(),
  }),
  subject: nullableText(500),
  text: z.string().max(10000),
  attachments: z.array(z.strictObject({
    external_attachment_id: id,
    file_field: z.string().regex(/^file_[0-9]+$/),
    filename: z.string().min(1).max(255),
    mime_type: z.enum(allowedMimeTypes),
    size_bytes: z.number().int().positive(),
  })),
}).superRefine((event, ctx) => {
  for (const field of ['external_attachment_id', 'file_field'] as const) {
    if (new Set(event.attachments.map(file => file[field])).size !== event.attachments.length) {
      ctx.addIssue({ code: 'custom', path: ['attachments'], message: `${field} repetido` });
    }
  }
  if (!event.text.trim() && event.attachments.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'Incluye un mensaje o un archivo' });
  }
});
export type IncomingEvent = z.infer<typeof incomingEventSchema>;
export type IngestDocumentResult = {
  id: string; original_filename: string; category: string; sha256: string;
  classification_status: string; storage_status: string; confidence: number | null;
};
export type IngestResult = {
  event_id: string; status: string; duplicate: boolean; interaction_id: string;
  client: { id: string; display_name: string } | null;
  client_resolution: 'existing' | 'created' | 'conflict';
  documents: IngestDocumentResult[]; warnings: string[];
};
