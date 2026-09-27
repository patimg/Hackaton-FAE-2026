import { mkdir } from 'node:fs/promises';
import { GoogleDriveStorage } from '../src/server/providers/storage/google-drive';
import { loadLocalEnv } from './local-env';
loadLocalEnv();
import { incomingEventSchema } from '../src/contracts/ingest';
import { normalizePhoneIfValid } from '../src/domain/identity';
import { shouldIngestWhatsAppMessage, unwrapWhatsAppMessage as unwrapMessage } from '../src/domain/whatsapp';
import {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  makeWASocket,
  useMultiFileAuthState as loadAuthState,
  type WAMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

const authDirectory = process.env.WHATSAPP_AUTH_DIR || '.data/whatsapp-auth';
const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestUrl = process.env.WHATSAPP_INGEST_URL || `${baseUrl}/api/v1/ingest`;
const ingestToken = process.env.INGEST_API_TOKEN;

function requireCredentials() {
  if (!ingestToken) throw new Error('Configura INGEST_API_TOKEN para autenticar el conector de WhatsApp.');
  const configuredAccountId = process.env.WHATSAPP_SOURCE_ACCOUNT_ID?.trim();
  if (configuredAccountId && !/^\+?\d{3,20}$/.test(configuredAccountId)) {
    throw new Error('WHATSAPP_SOURCE_ACCOUNT_ID debe ser un número real en formato internacional.');
  }
}

function messageText(message: WAMessage): string {
  const content = unwrapMessage(message);
  return content?.conversation
    || content?.extendedTextMessage?.text
    || content?.imageMessage?.caption
    || content?.documentMessage?.caption
    || '';
}

function senderPhone(message: WAMessage): string | null {
  const jid = message.key.participant || message.key.remoteJid || '';
  const number = jid.split('@')[0].split(':')[0];
  if (!/^\d{3,20}$/.test(number)) return null;
  const phone = normalizePhoneIfValid(`+${number}`, process.env.DEFAULT_PHONE_COUNTRY || 'CL');
  if (!phone) console.warn('El remitente no tiene un número telefónico verificable; se guardará como cliente provisional.');
  return phone;
}

function sourceAccountId(socket: ReturnType<typeof makeWASocket>): string {
  const configured = process.env.WHATSAPP_SOURCE_ACCOUNT_ID?.trim();
  if (configured) return configured;
  const number = socket.user?.id.split('@')[0].split(':')[0];
  if (!number || !/^\d{3,20}$/.test(number)) {
    throw new Error('No se pudo determinar el número de la cuenta conectada de WhatsApp.');
  }
  return `+${number}`;
}

async function createForm(message: WAMessage, socket: ReturnType<typeof makeWASocket>) {
  if (!shouldIngestWhatsAppMessage(message)) return null;
  const content = unwrapMessage(message);
  const attachments: Array<{
    external_attachment_id: string;
    file_field: string;
    filename: string;
    mime_type: 'application/pdf' | 'image/jpeg' | 'image/png' | 'text/plain';
    size_bytes: number;
  }> = [];
  const files: Array<{ field: string; name: string; type: string; bytes: Buffer }> = [];
  const media = content?.documentMessage || content?.imageMessage;
  if (media) {
    const mime = media.mimetype;
    if (mime === 'application/pdf' || mime === 'image/jpeg' || mime === 'image/png' || mime === 'text/plain') {
      const bytes = await downloadMediaMessage(message, 'buffer', {}, {
        reuploadRequest: next => socket.updateMediaMessage(next),
        logger: pino({ level: 'silent' }),
      });
      const field = 'file_0';
      const filename = ('fileName' in media ? media.fileName : undefined)
        || `whatsapp-${message.key.id || 'archivo'}`;
      attachments.push({
        external_attachment_id: `${message.key.id || 'message'}:media`,
        file_field: field,
        filename: filename.slice(0, 255),
        mime_type: mime,
        size_bytes: bytes.length,
      });
      files.push({ field, name: filename, type: mime, bytes });
    } else {
      console.warn(`Adjunto omitido: MIME no admitido (${mime || 'desconocido'}).`);
    }
  }
  const text = messageText(message).slice(0, 10000);
  if (attachments.length === 0 && !text.trim()) return null;
  const remoteJid = message.key.remoteJid || 'unknown';
  const event = {
    schema_version: '1' as const,
    source: 'whatsapp' as const,
    source_account_id: sourceAccountId(socket),
    external_message_id: message.key.id || `${remoteJid}:${message.messageTimestamp || Date.now()}`,
    external_thread_id: remoteJid,
    occurred_at: new Date(Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    sender: { display_name: message.pushName?.slice(0, 150) || null, email: null, phone: senderPhone(message) },
    subject: null,
    text,
    attachments,
  };
  const validation = incomingEventSchema.safeParse(event);
  if (!validation.success) {
    const fields = [...new Set(validation.error.issues.map(issue => issue.path.join('.') || 'event'))];
    throw new Error(`WhatsApp produjo un evento inválido (${fields.join(', ')}).`);
  }
  return { event: validation.data, files };
}

async function dispatch(message: WAMessage, socket: ReturnType<typeof makeWASocket>) {
  const payload = await createForm(message, socket);
  if (!payload) {
    console.info('Mensaje omitido: se requieren archivos compatibles en un chat individual.');
    return;
  }
  const { event, files } = payload;
  const form = new FormData();
  form.set('event', JSON.stringify(event));
  for (const file of files) form.append(file.field, new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: { Authorization: ['Bearer', ingestToken].join(' '), Origin: baseUrl },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ingestión rechazada (${response.status})${body ? `: ${body.slice(0, 500)}` : '.'}`);
  }
  console.info(`Mensaje procesado: ${event.external_message_id}.`);
}

async function run() {
  requireCredentials();
  const driveStorage = new GoogleDriveStorage({
    clientId:process.env.GOOGLE_CLIENT_ID || '',
    clientSecret:process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken:process.env.GOOGLE_REFRESH_TOKEN || '',
    rootFolderId:process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '',
  });
  await driveStorage.assertReady();
  await mkdir(authDirectory, { recursive: true });
  const { state, saveCreds } = await loadAuthState(authDirectory);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
    browser: Browsers.ubuntu('FAE WhatsApp listener'),
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
  });
  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true });
    if (connection === 'open') console.info('WhatsApp conectado.');
    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('WhatsApp cerró la sesión; elimina .data/whatsapp-auth y vuelve a vincular.');
        process.exitCode = 1;
      } else {
        console.warn('WhatsApp desconectado; reconectando.');
        void run().catch(error => { console.error(error instanceof Error ? error.message : 'Error de reconexión.'); process.exitCode = 1; });
      }
    }
  });
  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (!shouldIngestWhatsAppMessage(message)) continue;
      try { await dispatch(message, socket); }
      catch (error) { console.error(error instanceof Error ? error.message : 'Falló la ingestión.'); }
    }
  });
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el listener.');
  process.exitCode = 1;
});
