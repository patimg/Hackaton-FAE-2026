import { loadLocalEnv } from './local-env';
loadLocalEnv();
import { google } from 'googleapis';
import { createInterface } from 'node:readline/promises';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('Define GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.');
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';
const auth = new google.auth.OAuth2(clientId,clientSecret,redirectUri);
const url = auth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:[
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.modify',
]});
console.log(`Abre esta URL:\n${url}`);
const input = createInterface({input:process.stdin,output:process.stdout});
const code = await input.question('Código OAuth: ');
input.close();
const { tokens } = await auth.getToken(code.trim());
if (!tokens.refresh_token) throw new Error('Google no devolvió refresh token; revoca el acceso y vuelve a ejecutar.');
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
