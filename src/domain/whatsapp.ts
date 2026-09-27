import type { WAMessage } from '@whiskeysockets/baileys';
import { allowedMimeTypes } from '../contracts/ingest';

// Only individual chats: exclude groups, broadcasts, statuses and channels.
export function isDirectWhatsAppChat(jid: string | null | undefined): boolean {
  return typeof jid === 'string' && /^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/.test(jid);
}

export function unwrapWhatsAppMessage(message: WAMessage) {
  const raw = message.message;
  return raw?.ephemeralMessage?.message
    ?? raw?.viewOnceMessage?.message
    ?? raw?.viewOnceMessageV2?.message
    ?? raw;
}

export function shouldIngestWhatsAppMessage(message: WAMessage): boolean {
  if (message.key.fromMe || !isDirectWhatsAppChat(message.key.remoteJid)) return false;
  const content = unwrapWhatsAppMessage(message);
  const media = content?.documentMessage || content?.imageMessage;
  return Boolean(media?.mimetype && allowedMimeTypes.some(mime => mime === media.mimetype));
}
