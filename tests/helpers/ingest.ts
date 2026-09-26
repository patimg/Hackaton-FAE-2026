import { randomUUID } from 'node:crypto';
import type { IncomingEvent } from '../../src/contracts/ingest';

export const limits = {
  MAX_FILES_PER_MESSAGE:5,
  MAX_FILE_BYTES:5242880,
  MAX_TOTAL_ATTACHMENT_BYTES:15728640,
  MAX_REQUEST_BYTES:16777216,
  DEFAULT_PHONE_COUNTRY:'CL',
};
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6ioAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');

export const integrationAccountId = 'automated-integration';
export function pdfBytes() { return Buffer.from(pdf); }

export async function createTestMessage(kind: 'logo'|'receipt'|'ambiguous' = 'logo', identity?: { email: string; phone: string }) {
  const sample: { filename:string; mime:'application/pdf'|'image/png'; bytes:Buffer; text:string } = kind === 'receipt'
    ? { filename: 'comprobante.pdf', mime: 'application/pdf', bytes: pdf, text: 'Adjunto comprobante de transferencia.' }
    : kind === 'ambiguous'
      ? { filename: 'referencia.png', mime: 'image/png', bytes: image, text: 'Adjunto este archivo para que lo revises.' }
      : { filename: 'logo_nuevo.png', mime: 'image/png', bytes: image, text: 'Adjunto el logo actualizado para el proyecto.' };
  const event: IncomingEvent = {
    schema_version: '1',
    source: 'gmail',
    source_account_id: integrationAccountId,
    external_message_id: `integration-${randomUUID()}`,
    external_thread_id: `thread-${randomUUID()}`,
    occurred_at: new Date().toISOString(),
    sender: {
      display_name: 'TEST-INGEST-Contacto',
      email: identity?.email || 'contacto@example.test',
      phone: null,
    },
    subject: sample.text,
    text: sample.text,
    attachments: [{
      external_attachment_id: `attachment-${randomUUID()}`,
      file_field: 'file_0',
      filename: sample.filename,
      mime_type: sample.mime,
      size_bytes: sample.bytes.length,
    }],
  };
  return { event, files: [Buffer.from(sample.bytes)] };
}

export function requestFor(event: IncomingEvent, files: Uint8Array[], extra?: { name: string; value: string }) {
  const form = new FormData();
  form.set('event', JSON.stringify(event));
  event.attachments.forEach((file, index) => {
    if (files[index]) form.append(file.file_field, new File([new Uint8Array(files[index])], file.filename, { type: file.mime_type }));
  });
  if (extra) form.append(extra.name, extra.value);
  return new Request('http://localhost:3000/api/v1/ingest', { method: 'POST', body: form });
}
