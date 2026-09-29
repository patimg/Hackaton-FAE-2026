import { google, type gmail_v1 } from 'googleapis';
import { createHash } from 'node:crypto';
import { allowedMimeTypes, incomingEventSchema, type IncomingEvent } from '@/contracts/ingest';
import { safeFilename, type ValidatedAttachment } from '@/server/files/validate';

const allowedMime = new Set<string>(allowedMimeTypes);
type GmailPart = gmail_v1.Schema$MessagePart;

function isAllowedMime(value: string): value is IncomingEvent['attachments'][number]['mime_type'] {
  return allowedMime.has(value);
}

export function ingestionMimeType(value: string): IncomingEvent['attachments'][number]['mime_type'] | null {
  const mime = value.toLowerCase();
  if (mime === 'text/markdown') return 'text/plain';
  return isAllowedMime(mime) ? mime : null;
}

function validatePlainText(bytes: Buffer, messageId: string, filename: string) {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal:true }).decode(bytes); }
  catch { throw new Error(`El adjunto de texto "${filename}" en Gmail ${messageId} no es UTF-8 válido; quedó sin marcar como leído.`); }
  const invalidControl = [...text].some(char => {
    const code = char.charCodeAt(0);
    return code < 32 && ![9, 10, 13].includes(code);
  });
  if (invalidControl) throw new Error(`El adjunto de texto "${filename}" en Gmail ${messageId} contiene caracteres no admitidos; quedó sin marcar como leído.`);
}

function decode(data: string | null | undefined) {
  return data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64') : Buffer.alloc(0);
}
function headers(message: gmail_v1.Schema$Message) {
  return new Map((message.payload?.headers ?? []).map(header => [header.name?.toLowerCase() ?? '', header.value ?? '']));
}
function htmlToText(value: string) {
  return value.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function collect(part: GmailPart, text: string[], html: string[], files: GmailPart[]) {
  if (part.filename && (part.body?.attachmentId || part.body?.data)) files.push(part);
  const mime = (part.mimeType ?? '').toLowerCase();
  const body = decode(part.body?.data);
  if (mime === 'text/plain' && body.length) text.push(body.toString('utf8'));
  if (mime === 'text/html' && body.length) html.push(body.toString('utf8'));
  for (const child of part.parts ?? []) collect(child, text, html, files);
}
function payloadHash(event: IncomingEvent, attachments: ValidatedAttachment[]) {
  const canonical = {
    ...event,
    occurred_at: new Date(event.occurred_at).toISOString(),
    sender: event.sender,
    attachments: attachments.map(({ external_attachment_id, filename, mime_type, size_bytes, sha256 }) =>
      ({ external_attachment_id, filename, mime_type, size_bytes, sha256 })).sort((a, b) =>
      a.external_attachment_id.localeCompare(b.external_attachment_id)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export type GmailMessage = { event: IncomingEvent; attachments: ValidatedAttachment[]; payloadHash: string; email: string | null; phone: string | null };

export class GmailProvider {
  readonly client: gmail_v1.Gmail;
  private processedLabelId: string | null = null;
  constructor(options: { clientId: string; clientSecret: string; refreshToken: string }) {
    const auth = new google.auth.OAuth2(options.clientId, options.clientSecret);
    auth.setCredentials({ refresh_token: options.refreshToken });
    this.client = google.gmail({ version: 'v1', auth });
  }

  async listUnread(query: string, maxResults: number, startDate?: string) {
    const after = startDate ? ` after:${startDate.replaceAll('-', '/')}` : '';
    const response = await this.client.users.messages.list({ userId: 'me', q: `${query}${after}`.trim(), maxResults });
    return response.data.messages ?? [];
  }

  async read(id: string, accountId: string): Promise<GmailMessage> {
    const response = await this.client.users.messages.get({ userId: 'me', id, format: 'full' });
    const message = response.data;
    const map = headers(message);
    const text: string[] = [], html: string[] = [], parts: GmailPart[] = [];
    collect(message.payload ?? {}, text, html, parts);
    const attachments: ValidatedAttachment[] = [];
    for (const part of parts) {
      const sourceMime = (part.mimeType ?? 'application/octet-stream').toLowerCase();
      const mime = ingestionMimeType(sourceMime);
      if (!mime) {
        throw new Error(`El adjunto "${part.filename || 'sin nombre'}" en Gmail ${id} tiene MIME no admitido (${sourceMime}); quedó sin marcar como leído.`);
      }
      const bytes = part.body?.attachmentId
        ? (await this.client.users.messages.attachments.get({ userId: 'me', messageId: id, id: part.body.attachmentId })).data.data
        : part.body?.data;
      const data = decode(bytes);
      if (!data.length) continue;
      const filename = part.filename || `adjunto-${attachments.length + 1}`;
      if (mime === 'text/plain') validatePlainText(data, id, filename);
      attachments.push({
        external_attachment_id: `${id}:${part.partId ?? attachments.length}`,
        file_field: `file_${attachments.length}`,
        filename,
        mime_type: mime,
        size_bytes: data.length,
        bytes: data,
        sha256: createHash('sha256').update(data).digest('hex'),
        safe_filename: safeFilename(filename, mime),
      });
    }
    const from = map.get('from') ?? '';
    const email = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    const displayName = from.match(/^"?([^"<]+?)"?\s*</)?.[1]?.trim().slice(0, 150) || null;
    const occurredAt = new Date(map.get('date') ?? Number(message.internalDate ?? Date.now()));
    if (Number.isNaN(occurredAt.getTime())) throw new Error(`Fecha inválida en Gmail ${id}`);
    const event = incomingEventSchema.parse({
      schema_version: '1', source: 'gmail', source_account_id: accountId,
      external_message_id: id, external_thread_id: message.threadId ?? null,
      occurred_at: occurredAt.toISOString(),
      sender: { display_name: displayName, email: email.includes('@') ? email : null, phone: null },
      subject: (map.get('subject') || '').slice(0, 500) || null,
      text: (text.join('\n').trim() || htmlToText(html.join('\n'))).slice(0, 10000),
      attachments: attachments.map(({ bytes, sha256, safe_filename, ...file }) => { void bytes; void sha256; void safe_filename; return file; }),
    });
    return { event, attachments, payloadHash: payloadHash(event, attachments), email: event.sender.email, phone: null };
  }

  async markRead(id: string) {
    if (!this.processedLabelId) {
      const labels=await this.client.users.labels.list({userId:'me'});
      const existing=labels.data.labels?.find(label=>label.name==='FAE_PROCESSED');
      if (existing?.id) this.processedLabelId=existing.id;
      else {
        const created=await this.client.users.labels.create({userId:'me',requestBody:{name:'FAE_PROCESSED',labelListVisibility:'labelShow',messageListVisibility:'show'}});
        this.processedLabelId=created.data.id||null;
      }
    }
    await this.client.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'], ...(this.processedLabelId ? {addLabelIds:[this.processedLabelId]} : {}) } });
  }
}
