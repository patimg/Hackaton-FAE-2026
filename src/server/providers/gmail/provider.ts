import { google, type gmail_v1 } from 'googleapis';
import { createHash } from 'node:crypto';
import { incomingEventSchema, type IncomingEvent } from '@/contracts/ingest';
import { safeFilename, type ValidatedAttachment } from '@/server/files/validate';

const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);
type GmailPart = gmail_v1.Schema$MessagePart;

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
  constructor(options: { clientId: string; clientSecret: string; refreshToken: string }) {
    const auth = new google.auth.OAuth2(options.clientId, options.clientSecret);
    auth.setCredentials({ refresh_token: options.refreshToken });
    this.client = google.gmail({ version: 'v1', auth });
  }

  async listUnread(query: string, maxResults: number) {
    const response = await this.client.users.messages.list({ userId: 'me', q: query, maxResults });
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
      const mime = (part.mimeType ?? 'application/octet-stream').toLowerCase();
      if (!allowedMime.has(mime)) continue;
      const bytes = part.body?.attachmentId
        ? (await this.client.users.messages.attachments.get({ userId: 'me', messageId: id, id: part.body.attachmentId })).data.data
        : part.body?.data;
      const data = decode(bytes);
      if (!data.length) continue;
      const filename = part.filename || `adjunto-${attachments.length + 1}`;
      attachments.push({
        external_attachment_id: `${id}:${part.partId ?? attachments.length}`,
        file_field: `file_${attachments.length}`,
        filename,
        mime_type: mime as 'application/pdf' | 'image/jpeg' | 'image/png' | 'text/plain',
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
    await this.client.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
  }
}
