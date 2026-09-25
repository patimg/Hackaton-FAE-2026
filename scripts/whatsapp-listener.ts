import { mkdir } from 'node:fs/promises';
import { loadLocalEnv } from './local-env';
loadLocalEnv();
import { createServerClient } from '@supabase/ssr';
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
const accountId = process.env.WHATSAPP_SOURCE_ACCOUNT_ID || 'demo-whatsapp';
const baseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ingestUrl = process.env.WHATSAPP_INGEST_URL || `${baseUrl}/api/v1/ingest`;
const ingestToken = process.env.INGEST_API_TOKEN;
const email = process.env.WHATSAPP_INGEST_EMAIL || process.env.DEMO_AUTH_EMAIL;
const password = process.env.WHATSAPP_INGEST_PASSWORD || process.env.DEMO_AUTH_PASSWORD;

type CookieStore = Map<string, string>;

function requireCredentials() {
  if (!email || !password) throw new Error('Configura WHATSAPP_INGEST_EMAIL y WHATSAPP_INGEST_PASSWORD.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY para autenticar la ingestión.');
  }
}

async function authenticationCookie(): Promise<string> {
  if (ingestToken) return '';
  requireCredentials();
  const cookies: CookieStore = new Map();
  const client = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: items => items.forEach(({ name, value }) => cookies.set(name, value)),
    },
    cookieOptions: { secure: baseUrl.startsWith('https:') },
  });
  const { error } = await client.auth.signInWithPassword({ email: email!, password: password! });
  if (error) throw new Error('No se pudo autenticar la cuenta de ingestión.');
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

function unwrapMessage(message: WAMessage) {
  const raw = message.message;
  return raw?.ephemeralMessage?.message
    ?? raw?.viewOnceMessage?.message
    ?? raw?.viewOnceMessageV2?.message
    ?? raw;
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
  return /^\d{3,20}$/.test(number) ? `+${number}` : null;
}

async function createForm(message: WAMessage, socket: ReturnType<typeof makeWASocket>) {
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
        filename,
        mime_type: mime,
        size_bytes: bytes.length,
      });
      files.push({ field, name: filename, type: mime, bytes });
    } else {
      console.warn(`Adjunto omitido: MIME no admitido (${mime || 'desconocido'}).`);
    }
  }
  const remoteJid = message.key.remoteJid || 'unknown';
  const event = {
    schema_version: '1' as const,
    source: 'whatsapp' as const,
    source_account_id: accountId,
    external_message_id: message.key.id || `${remoteJid}:${message.messageTimestamp || Date.now()}`,
    external_thread_id: remoteJid,
    occurred_at: new Date(Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    sender: { display_name: message.pushName || null, email: null, phone: senderPhone(message) },
    subject: null,
    text: messageText(message),
    attachments,
  };
  return { event, files };
}

async function dispatch(message: WAMessage, socket: ReturnType<typeof makeWASocket>, cookie: string) {
  const { event, files } = await createForm(message, socket);
  if (!event.text.trim() && files.length === 0) return;
  const form = new FormData();
  form.set('event', JSON.stringify(event));
  for (const file of files) form.append(file.field, new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: { ...(ingestToken ? { Authorization: `Bearer ${ingestToken}` } : {}), Cookie: cookie, Origin: baseUrl },
    body: form,
  });
  if (!response.ok) throw new Error(`Ingestión rechazada (${response.status}).`);
  console.info(`Mensaje procesado: ${event.external_message_id}.`);
}

async function run() {
  await mkdir(authDirectory, { recursive: true });
  let cookie = await authenticationCookie();
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
      if (message.key.fromMe || !message.message) continue;
      try { await dispatch(message, socket, cookie); }
      catch (error) {
        if (error instanceof Error && error.message.includes('(401)')) {
          cookie = await authenticationCookie();
          try { await dispatch(message, socket, cookie); } catch (retryError) {
            console.error(retryError instanceof Error ? retryError.message : 'Falló la ingestión.');
          }
        } else console.error(error instanceof Error ? error.message : 'Falló la ingestión.');
      }
    }
  });
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el listener.');
  process.exitCode = 1;
});
