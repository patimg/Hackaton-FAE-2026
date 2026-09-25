# Integraciones externas para la demo

Las integraciones reales se ejecutan como procesos Node separados del servidor Next.js. El simulador continúa disponible y usa sesión Supabase; los conectores usan `INGEST_API_TOKEN` para llamar al endpoint interno de ingestión.

## 1. Google Cloud

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto.
2. Habilita **Gmail API** y **Google Drive API**.
3. Configura la pantalla de consentimiento OAuth como aplicación externa o interna según tu cuenta de Workspace.
4. Crea un OAuth Client ID de tipo **Desktop app**. El script local usa el redirect `http://127.0.0.1:3001/oauth2callback`.
5. Solicita estos scopes:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
6. Copia el client ID y client secret en `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Ejecuta:

```powershell
npm run auth:google
```

Abre la URL mostrada, autoriza la cuenta y vuelve al callback local. El script guarda el refresh token en `.env.local`.

Para Drive crea o elige una carpeta raíz y configura:

```env
STORAGE_PROVIDER=google-drive
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
```

El proveedor conserva la estructura lógica de carpetas del pipeline y sube los originales como archivos privados. No uses `GOOGLE_API_KEY` para archivos privados: Drive requiere OAuth de usuario o una cuenta de servicio con una unidad compartida.

## 2. Gmail

Configura el usuario de Gmail que se leerá y un token de ingestión:

```env
GMAIL_USER=tu-cuenta@gmail.com
INGEST_API_TOKEN=un-token-largo-y-aleatorio
WHATSAPP_BACKEND_URL=http://127.0.0.1:3000
```

Con Next.js, Supabase y las credenciales cargadas, ejecuta:

```powershell
npm run sync:gmail
```

El conector consulta mensajes `INBOX` y `UNREAD`, descarga los adjuntos admitidos, crea un evento `source=gmail`, lo envía al endpoint interno y añade la etiqueta `FAE_PROCESSED` antes de quitar `UNREAD`. Los mensajes sin adjuntos también se conservan como interacciones si contienen texto.

Para una demo con polling:

```powershell
$env:GMAIL_POLL=true
npm run sync:gmail
```

`GMAIL_POLL_INTERVAL_MS` controla el intervalo, con un mínimo de un segundo.

## 3. WhatsApp por QR

Este conector usa Baileys, una librería no oficial que emula el protocolo de WhatsApp Web. Úsala solo para una demo y una cuenta de prueba; puede romperse por cambios del protocolo o provocar restricciones de la cuenta. Para producción debe preferirse WhatsApp Business Cloud API.

Configura:

```env
INGEST_API_TOKEN=un-token-largo-y-aleatorio
WHATSAPP_BACKEND_URL=http://127.0.0.1:3000
WHATSAPP_AUTH_DIR=./.data/whatsapp-auth
```

Inicia:

```powershell
npm run dev:whatsapp
```

Escanea el QR desde WhatsApp > Dispositivos vinculados. La sesión se conserva en `.data/whatsapp-auth`, que está ignorado por Git. El listener procesa mensajes entrantes con documentos, imágenes, audio o texto y los envía al mismo endpoint de ingestión.

## Orden recomendado para la demo

Terminal 1:

```powershell
npm run supabase:start
npm run dev
```

Terminal 2:

```powershell
npm run sync:gmail
```

Terminal 3:

```powershell
npm run dev:whatsapp
```

Nunca publiques `.env.local`, tokens OAuth, claves de Supabase ni `.data/whatsapp-auth`.
