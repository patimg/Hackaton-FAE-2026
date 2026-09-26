import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { loadLocalEnv, writeLocalEnv } from './local-env';
import { google } from 'googleapis';

async function main() {
  loadLocalEnv();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env.local.');

  const port = Number(process.env.GOOGLE_OAUTH_PORT || '3001');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('GOOGLE_OAUTH_PORT debe ser un puerto válido.');
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = randomBytes(24).toString('base64url');
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authorizationUrl = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    state,
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  });
  let callbackFailure: Error | undefined;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', redirectUri);
    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404).end('Ruta no encontrada.');
      return;
    }
    if (url.searchParams.get('state') !== state) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Estado OAuth inválido. Cierra esta pestaña y vuelve a iniciar el proceso.');
      return;
    }
    const providerError = url.searchParams.get('error');
    if (providerError) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google no concedió acceso. Puedes cerrar esta pestaña.');
      callbackFailure = new Error(`Google rechazó la autorización (${providerError}).`);
      server.close();
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No se recibió código de autorización.');
      return;
    }

    try {
      const { tokens } = await auth.getToken(code);
      if (!tokens.refresh_token) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google no devolvió refresh token. Revoca el acceso concedido a esta aplicación e inténtalo nuevamente.');
        callbackFailure = new Error('Google no devolvió refresh token. Revoca el acceso existente y vuelve a autorizar.');
        server.close();
        return;
      }
      writeLocalEnv({ GOOGLE_REFRESH_TOKEN: tokens.refresh_token });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(
        '<!doctype html><html lang="es"><meta charset="utf-8"><title>Autorización lista</title><body><h1>Autorización completada</h1><p>El refresh token quedó guardado en .env.local. Puedes cerrar esta pestaña.</p></body></html>',
      );
      console.log('Refresh token guardado de forma privada en .env.local. No se imprimió el valor.');
      server.close();
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No se pudo completar OAuth. Revisa el mensaje de error en la terminal.');
      }
      callbackFailure = error instanceof Error ? error : new Error('Falló el intercambio del código OAuth.');
      server.close();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`Callback OAuth disponible en ${redirectUri}`);
  console.log('Abre esta URL e inicia sesión con la cuenta de Google que autorizará Drive y Gmail:');
  console.log(authorizationUrl);

  await new Promise<void>((resolve, reject) => {
    server.once('close', resolve);
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Tiempo de autorización agotado después de 5 minutos.'));
    }, 5 * 60 * 1000);
    timeout.unref();
  });
  if (callbackFailure) throw callbackFailure;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Falló la autorización de Google.');
  process.exitCode = 1;
});
