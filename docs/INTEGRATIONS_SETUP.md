# Configuración de integraciones

Gmail y WhatsApp se ejecutan como procesos Node separados del servidor Next.js. Los documentos finales se guardan en Google Drive. El endpoint de ingestión acepta únicamente el bearer token interno configurado en `INGEST_API_TOKEN`.

## 1. Google Cloud

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto.
2. Habilita **Gmail API** y **Google Drive API**.
3. Configura la pantalla de consentimiento OAuth como aplicación externa o interna según tu cuenta de Workspace.
4. Crea un OAuth Client ID de tipo **Desktop app**. El script local usa el redirect `http://127.0.0.1:3001/oauth2callback`. Si usas un cliente OAuth de tipo Web, registra ese URI exactamente en sus URI de redirección autorizados.
5. Solicita estos scopes:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
6. Copia el client ID y client secret en `.env.local`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
STORAGE_PROVIDER=google-drive
```

Ejecuta el helper desde la raíz del repositorio:

```powershell
npm run auth:google
```

Abre la URL mostrada y autoriza la cuenta. Google vuelve automáticamente al callback local; el script guarda el refresh token en `.env.local` sin imprimirlo.

Para Drive crea o elige una carpeta raíz y configura:

```env
STORAGE_PROVIDER=google-drive
GOOGLE_DRIVE_ROOT_FOLDER_ID=...
```

El proveedor conserva la estructura lógica de carpetas del pipeline y sube los originales como archivos privados. No uses `GOOGLE_API_KEY` para archivos privados: Drive requiere OAuth de usuario o una cuenta de servicio con una unidad compartida.

## 2. Gmail

Configura la IA de búsqueda, la cuenta de Gmail y el token compartido con el listener de WhatsApp:

```env
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
AI_API_KEY=...
AI_BASE_URL=https://api.openai.com/v1
GMAIL_USER=tu-cuenta@gmail.com
GMAIL_ACCOUNT_ID=tu-cuenta@gmail.com
INGEST_API_TOKEN=un-token-largo-y-aleatorio
GMAIL_START_DATE=2026-09-27
```

Comprueba la conexión antes de iniciar los workers:

```powershell
npm run ai:check
```

El diagnóstico distingue errores de autenticación, modelo inexistente, límite de uso, timeout y disponibilidad del proveedor.

Con Next.js, Supabase y las credenciales cargadas, ejecuta:

```powershell
npm run sync:gmail
```

El conector consulta mensajes `INBOX` y `UNREAD`, descarga los adjuntos admitidos (PDF, JPEG, PNG y texto UTF-8). Los adjuntos MIME `text/markdown` se validan como UTF-8 y se ingieren como `text/plain`. Crea un evento `source=gmail` y lo envía directamente al pipeline. Si encuentra un adjunto con un MIME no admitido o texto inválido, informa el error y deja el correo sin marcar como leído para evitar perder el archivo. Al procesar correctamente un mensaje, añade la etiqueta `FAE_PROCESSED` y lo marca como leído. Los mensajes sin adjuntos también se conservan como interacciones si contienen texto. `--once` ejecuta una sola pasada; sin esa opción, el worker consulta periódicamente.

Para procesar una sola pasada:

```powershell
npm run sync:gmail -- --once
```

`GMAIL_START_DATE` es una fecha opcional `AAAA-MM-DD`; el worker la convierte en `after:AAAA/MM/DD` y la combina con `GMAIL_QUERY`. Úsala antes de la primera sincronización para excluir años de mensajes no leídos acumulados. `GMAIL_QUERY` por defecto es `is:unread category:primary`; no se añade `has:attachment`, porque también pueden interesar correos sin archivos. La clasificación de relevancia del correo y la sincronización incremental durable siguen pendientes.

`GMAIL_POLL_INTERVAL_MS` controla el intervalo del worker continuo, con un mínimo de un segundo.
Para probar un remitente sin procesar todo el backlog, puedes acotar la búsqueda y el máximo; Gmail marcará como leído el correo si la ingestión completa:

```powershell
npm run sync:gmail -- --once --max=1 --query="in:inbox from:remitente@example.com newer_than:2d"
```

Evita iniciar el worker continuo con una búsqueda amplia si no quieres importar todo el historial que coincida con ella. La verificación local del 26 de septiembre de 2026 procesó de forma dirigida un mensaje con adjunto Markdown y confirmó que el documento se guardó en Drive. El MIME `text/markdown` se valida como UTF-8 y se ingiere como texto plano; otros MIME no admitidos o texto inválido producen un error y el mensaje permanece sin leer.

En la primera conexión de una cuenta con muchos no leídos acumulados, el conector recorrerá todos los mensajes que coincidan con `GMAIL_QUERY` (incluidos boletines/promociones, aunque no generen ningún archivo en Drive por no traer adjunto admitido, sí crean una interacción y potencialmente un cliente provisional visibles en el panel). Se recomienda ajustar `GMAIL_QUERY` para acotar esto usando los propios operadores de búsqueda de Gmail, por ejemplo:
```
GMAIL_QUERY=is:unread category:primary after:2026/09/27
```
`category:primary` usa la clasificación de Gmail para excluir promociones/redes sociales/foros; `after:AAAA/MM/DD` evita procesar el backlog histórico de no leídos, dejando solo lo que llegue desde esa fecha. No hay actualmente un mecanismo automático de "solo mensajes nuevos" (marca de agua persistida) más allá de esto — es responsabilidad de quien configura `GMAIL_QUERY`.

## 3. WhatsApp por QR

Este conector usa Baileys, una librería no oficial que emula el protocolo de WhatsApp Web. Puede romperse por cambios del protocolo o provocar restricciones de la cuenta. Para un servicio de producción se recomienda WhatsApp Business Cloud API.

Configura:

```env
INGEST_API_TOKEN=el-mismo-token-configurado-en-el-servidor
APP_BASE_URL=http://127.0.0.1:3000
WHATSAPP_INGEST_URL=http://127.0.0.1:3000/api/v1/ingest
WHATSAPP_AUTH_DIR=./.data/whatsapp-auth
```

`WHATSAPP_SOURCE_ACCOUNT_ID` es opcional: por defecto se obtiene del número de la cuenta vinculada. Si se configura manualmente, usa el número real de esa cuenta en formato internacional.

Inicia:

```powershell
npm run dev:whatsapp
```

Escanea el QR desde WhatsApp > Dispositivos vinculados. La sesión se conserva en `.data/whatsapp-auth`, que está ignorado por Git. El listener envía texto y adjuntos compatibles (PDF, JPEG, PNG y texto plano) al endpoint de ingestión. Un mensaje de texto de un chat individual se conserva como interacción sin crear documento ni carpeta en Drive; los formatos no admitidos se omiten y grupos, estados, canales y mensajes propios se ignoran.

La comprobación local de esa fecha confirmó que una imagen recibida por WhatsApp llegó a Google Drive. En esa prueba el remitente no proporcionó un número verificable, por lo que el registro se vinculó a un cliente provisional y no se fusionó automáticamente con el cliente de Gmail. Confirma/actualiza la identidad del cliente desde el flujo de revisión antes de asumir que dos canales pertenecen a la misma persona.

## Orden de inicio local

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