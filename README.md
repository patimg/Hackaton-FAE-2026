# Archivo · Gestión documental

Aplicación privada para recibir documentos desde Gmail y WhatsApp, relacionarlos con clientes, almacenarlos en Google Drive y buscarlos en lenguaje natural.

## Requisitos

- Node.js 22.23.3, según `.nvmrc`, y npm.
- Docker Desktop para ejecutar Supabase local.
- Proyecto de Google Cloud con Gmail API y Drive API, credenciales OAuth de usuario y carpeta raíz de Drive.
- Proveedor de IA compatible con la API de OpenAI.
- Cuenta local de Auth habilitada como operadora y su UUID configurado en `OPERATOR_USER_ID`.

## Preparación local

```powershell
npm ci
Copy-Item .env.example .env.local
```

Completa `.env.local` con Supabase, Google OAuth, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, IA, `INGEST_API_TOKEN`, `GMAIL_USER` y `OPERATOR_USER_ID`. No compartas ni publiques este archivo. La cuenta de Supabase debe tener las migraciones aplicadas y el usuario debe estar autorizado como operadora.

```powershell
npm run supabase:start
npm run db:migrate
npm run dev
```

La interfaz privada queda en **http://localhost:3000**. La vista principal reúne el directorio de clientes, la búsqueda IA y los documentos recientes. La revisión manual se mantiene en **/review**.

La aplicación necesita credenciales reales de Drive e IA para iniciar; ya no existe almacenamiento local de documentos finales ni proveedor determinista en tiempo de ejecución. Los archivos pasan por `.data/staging` mientras se procesan, se eliminan de ahí tras guardarse correctamente en Drive y se conservan si el procesamiento falla para permitir su revisión.

## Estado operativo verificado

El 26 de septiembre de 2026 se verificó una importación real de Gmail con un adjunto `text/markdown` y una imagen recibida por WhatsApp. Ambos generaron documentos con estado `stored` y sus archivos se comprobaron en Google Drive. Gmail normaliza Markdown UTF-8 a texto plano para el pipeline.

La identidad WhatsApp quedó como cliente provisional y no se fusionó con el cliente de Gmail: el proyecto vincula clientes solo mediante email o teléfono normalizados y coincidentes, nunca por el nombre. Para relacionar ambos canales de una persona, registra y verifica la misma identidad en el cliente correspondiente.

Esta comprobación confirma el procesamiento de esos mensajes, no que los workers sigan ejecutándose ahora. Gmail requiere iniciar su worker; WhatsApp requiere que el listener permanezca conectado. No se procesó el backlog general de mensajes antiguos/no leídos de Gmail.

## Conectores

WhatsApp solo importa imágenes y documentos compatibles recibidos en conversaciones
individuales. Ignora grupos, estados, difusiones, canales, mensajes propios y texto
sin adjuntos antes de descargar archivos o crear clientes. El servidor también
rechaza eventos de WhatsApp sin un chat individual o sin archivos. El texto que
acompaña un archivo se conserva como contexto. Esta regla no elimina registros
importados anteriormente; reinicia el listener para activar el filtro.

Consulta [docs/INTEGRATIONS_SETUP.md](docs/INTEGRATIONS_SETUP.md) para crear las credenciales OAuth y vincular WhatsApp.

En terminales separadas, con Supabase y Next.js iniciados:

```powershell
npm run sync:gmail -- --once
npm run sync:gmail
npm run dev:whatsapp
```

`--once` procesa una pasada de Gmail; sin esa opción el worker consulta periódicamente según `GMAIL_POLL_INTERVAL_MS`. WhatsApp muestra un QR la primera vez y conserva su sesión en `.data/whatsapp-auth/`. No borres ese directorio si quieres mantener la vinculación.

El token interno de ingestión autoriza al listener de WhatsApp; mantenlo privado y usa el mismo `INGEST_API_TOKEN` en el servidor y el worker. Gmail se conecta directamente con OAuth y el pipeline de la aplicación.

## Comprobaciones

```powershell
npm run lint
npm run typecheck
npm test
```

Las pruebas de integración requieren Supabase local y las E2E credenciales locales `LOCAL_OPERATOR_EMAIL` y `LOCAL_OPERATOR_PASSWORD`. Las pruebas de pipeline generan archivos en memoria y utilizan una base y almacenamiento temporal aislados.

No uses `supabase db reset` ni `npm run supabase:stop -- --no-backup` para el arranque normal: conserva los datos locales. Nunca publiques `.env.local`, credenciales OAuth, claves de Supabase ni `.data/whatsapp-auth`.
