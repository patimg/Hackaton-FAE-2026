import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { incomingEventSchema, type IncomingEvent } from '../../contracts/ingest';
import { normalizeEmail, normalizePhone } from '../../domain/identity';
import { AppError } from '../errors';

export type IngestLimits = {
  MAX_FILES_PER_MESSAGE: number; MAX_FILE_BYTES: number;
  MAX_TOTAL_ATTACHMENT_BYTES: number; MAX_REQUEST_BYTES: number; DEFAULT_PHONE_COUNTRY: string;
};
export type ValidatedAttachment = IncomingEvent['attachments'][number] & { bytes: Buffer; sha256: string; safe_filename: string };
export type ValidatedMessage = { event: IncomingEvent; attachments: ValidatedAttachment[]; payloadHash: string; email: string | null; phone: string | null };
export function sha256(bytes: Uint8Array) { return createHash('sha256').update(bytes).digest('hex'); }
export function safeFilename(name: string, mime: string) {
  const extension = { 'image/png':'png', 'image/jpeg':'jpg', 'application/pdf':'pdf', 'text/plain':'txt' }[mime];
  if (!extension) throw new AppError('UNSUPPORTED_MIME', 'Tipo de archivo no admitido.', 415);
  const leaf = name.replaceAll('\\', '/').split('/').pop() || 'archivo';
  const stem = leaf.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'archivo';
  return `${stem}.${extension}`;
}
export async function readBoundedBody(request: Request, maxBytes: number) {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw new AppError('REQUEST_TOO_LARGE', 'El mensaje supera el tamaño permitido.', 413);
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError('REQUEST_TOO_LARGE', 'El mensaje supera el tamaño permitido.', 413);
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function parseIngest(request: Request, limits: IngestLimits): Promise<ValidatedMessage> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data;')) throw new AppError('INVALID_MULTIPART', 'Se requiere multipart/form-data.', 400);
  const bytes = await readBoundedBody(request, limits.MAX_REQUEST_BYTES);
  let form: FormData;
  try { form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type':contentType } }).formData(); }
  catch { throw new AppError('INVALID_MULTIPART', 'No se pudo leer el formulario multipart.', 400); }
  if (form.getAll('event').length !== 1 || typeof form.get('event') !== 'string') throw new AppError('INVALID_EVENT', 'Incluye exactamente un campo event JSON.');
  let input: unknown;
  try { input = JSON.parse(form.get('event') as string); }
  catch { throw new AppError('INVALID_EVENT', 'El campo event no contiene JSON válido.'); }
  const parsed = incomingEventSchema.safeParse(input);
  if (!parsed.success) throw new AppError('INVALID_EVENT', `Evento inválido: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}.`);
  const event = parsed.data;
  if (event.attachments.length > limits.MAX_FILES_PER_MESSAGE) throw new AppError('TOO_MANY_FILES', 'Hay más archivos que el máximo permitido.', 413);
  const email = normalizeEmail(event.sender.email);
  const phone = normalizePhone(event.sender.phone, limits.DEFAULT_PHONE_COUNTRY);
  const expectedParts = new Set(['event', ...event.attachments.map(file => file.file_field)]);
  for (const key of form.keys()) if (!expectedParts.has(key)) throw new AppError('UNEXPECTED_PART', 'El formulario contiene partes no declaradas.');
  const attachments: ValidatedAttachment[] = [];
  let total = 0;
  for (const meta of event.attachments) {
    const file = form.get(meta.file_field);
    if (!(file instanceof File) || form.getAll(meta.file_field).length !== 1) throw new AppError('MISSING_ATTACHMENT', 'Falta un adjunto declarado o su parte está repetida.');
    if (!file.size || file.size > limits.MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', 'Un archivo está vacío o supera el límite permitido.', 413);
    total += file.size;
    if (total > limits.MAX_TOTAL_ATTACHMENT_BYTES) throw new AppError('FILES_TOO_LARGE', 'Los adjuntos superan el límite total.', 413);
    if (file.size !== meta.size_bytes || file.type !== meta.mime_type) throw new AppError('ATTACHMENT_MISMATCH', 'El tamaño o MIME declarado no coincide con el adjunto.');
    const data = Buffer.from(await file.arrayBuffer());
    let detected: string | undefined;
    try { detected = (await fileTypeFromBuffer(data))?.mime; } catch { /* Truncado/no reconocible. */ }
    if (meta.mime_type === 'text/plain' && !detected) {
      try {
        const text = new TextDecoder('utf-8', { fatal:true }).decode(data);
        const invalidControl = [...text].some(char => { const code = char.charCodeAt(0); return code < 32 && ![9,10,13].includes(code); });
        if (!invalidControl) detected = 'text/plain';
      } catch { /* Binario o codificación distinta. */ }
    }
    if (detected !== meta.mime_type) throw new AppError('UNSUPPORTED_MIME', 'El contenido del archivo no corresponde a un formato permitido.', 415);
    attachments.push({ ...meta, bytes:data, sha256:sha256(data), safe_filename:safeFilename(meta.filename, detected) });
  }
  // Propiedades con orden fijo; fechas y remitente normalizados; sin frontera multipart ni fecha de recepción.
  const canonical = {
    ...event, occurred_at:new Date(event.occurred_at).toISOString(),
    sender:{ ...event.sender, email, phone },
    attachments:attachments.map(({ external_attachment_id, filename, mime_type, size_bytes, sha256:hash }) => ({ external_attachment_id, filename, mime_type, size_bytes, sha256:hash }))
      .sort((a,b) => a.external_attachment_id.localeCompare(b.external_attachment_id)),
  };
  return { event, attachments, email, phone, payloadHash:sha256(Buffer.from(JSON.stringify(canonical))) };
}
