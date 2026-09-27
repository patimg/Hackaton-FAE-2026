import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WAMessage } from '@whiskeysockets/baileys';
import { isDirectWhatsAppChat, shouldIngestWhatsAppMessage } from '../../src/domain/whatsapp';
import { ingestMessage, type IngestDependencies } from '../../src/server/services/ingest';
import { AppError } from '../../src/server/errors';
import { parseIngest } from '../../src/server/files/validate';
import { createTestMessage, requestFor, limits } from '../helpers/ingest';

const image = { imageMessage: { mimetype: 'image/png', caption: 'Referencia' } };
function message(jid: string, content: WAMessage['message'] = image): WAMessage {
  return { key: { remoteJid: jid, fromMe: false, id: 'test-message' }, message: content };
}

test('ignora grupos incluso con archivos, estados, difusiones y canales', () => {
  for (const jid of ['123-456@g.us', '120363123456@g.us', 'status@broadcast', '123@broadcast', '123@newsletter', '']) {
    assert.equal(shouldIngestWhatsAppMessage(message(jid)), false, jid);
    assert.equal(shouldIngestWhatsAppMessage(message(jid, { conversation: 'Hola' })), false, jid);
  }
  assert.equal(isDirectWhatsAppChat(null), false);
});

test('acepta archivos compatibles de chats individuales con teléfono o LID', () => {
  for (const jid of ['56987654321@s.whatsapp.net', '123456789@lid']) {
    assert.equal(shouldIngestWhatsAppMessage(message(jid)), true);
    assert.equal(shouldIngestWhatsAppMessage(message(jid, { documentMessage: { mimetype: 'application/pdf' } })), true);
    assert.equal(shouldIngestWhatsAppMessage(message(jid, { ephemeralMessage: { message: image } })), true);
  }
});

test('ignora texto sin adjuntos, archivos no compatibles y mensajes propios', () => {
  const jid = '56987654321@s.whatsapp.net';
  for (const content of [{ conversation: 'Hola' }, { extendedTextMessage: { text: 'Hola' } },
    { documentMessage: { mimetype: 'application/zip', caption: 'Archivo' } }, {}]) {
    assert.equal(shouldIngestWhatsAppMessage(message(jid, content)), false);
  }
  const own = message(jid);
  own.key.fromMe = true;
  assert.equal(shouldIngestWhatsAppMessage(own), false);
});

test('el servidor bloquea grupos y texto sin adjuntos antes de acceder a dependencias', async () => {
  const deps = new Proxy({} as IngestDependencies, {
    get() { throw new Error('No debe acceder a DB, IA ni almacenamiento'); },
  });
  for (const [jid, withFiles, expected] of [
    ['120363123456@g.us', true, 'WHATSAPP_CHAT_NOT_ALLOWED'],
    ['120363123456@g.us', false, 'WHATSAPP_CHAT_NOT_ALLOWED'],
    ['56987654321@s.whatsapp.net', false, 'WHATSAPP_ATTACHMENT_REQUIRED'],
  ] as const) {
    const { event, files } = await createTestMessage();
    event.source = 'whatsapp';
    event.external_thread_id = jid;
    if (!withFiles) event.attachments = [];
    const input = await parseIngest(requestFor(event, withFiles ? files : []), limits);
    await assert.rejects(ingestMessage(input, { operatorId: 'unused' }, deps),
      (error: unknown) => error instanceof AppError && error.code === expected);
  }
});
