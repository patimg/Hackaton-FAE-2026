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

Completa `.env.local` con Supabase, Google OAuth, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, IA, `INGEST_API_TOKEN`, `GMAIL_USER`, `GMAIL_START_DATE` y `OPERATOR_USER_ID`. No compartas ni publiques este archivo. La cuenta de Supabase debe tener las migraciones aplicadas y el usuario debe estar autorizado como operadora.

```powershell
npm run supabase:start
npm run db:migrate
npm run dev
```

La interfaz privada queda en **http://localhost:3000**. La vista principal reúne el directorio de clientes, la búsqueda IA y los documentos recientes. La revisión manual se mantiene en **/review**.

Los clientes nuevos se crean como `provisional` hasta que una operadora los confirme. El panel principal muestra los clientes `active` y solo una muestra breve de provisionales; la gestión completa está en `/clients`, con filtros para activos, provisionales y archivados. Desde la ficha o el gestor se puede confirmar, archivar o restaurar un registro. Archivar solo lo oculta del directorio activo: conserva interacciones, identidades y documentos.

La aplicación necesita credenciales reales de Drive e IA para iniciar; ya no existe almacenamiento local de documentos finales ni proveedor determinista en tiempo de ejecución. Los archivos pasan por `.data/staging` mientras se procesan, se eliminan de ahí tras guardarse correctamente en Drive y se conservan si el procesamiento falla para permitir su revisión.

Los fallos temporales de Drive o dependencias quedan marcados como `retryable_failed`. Si el mismo conector vuelve a entregar el evento, el pipeline reutiliza staging y evita duplicar documentos ya almacenados. La resolución de identidades pendientes se realiza desde `/review`; por ahora actualiza la asociación en la base, pero no mueve físicamente originales antiguos dentro de Drive.

`GMAIL_START_DATE` es opcional y usa formato `AAAA-MM-DD`. Configúralo antes de la primera sincronización para excluir mensajes no leídos anteriores a esa fecha. La consulta predeterminada usa `category:primary`, pero no usa `has:attachment`: también pueden existir interacciones válidas sin archivos. La clasificación de relevancia del correo y la sincronización incremental durable siguen pendientes.

## Estado operativo verificado

El 26 de septiembre de 2026 se verificó una importación real de Gmail con un adjunto `text/markdown` y una imagen recibida por WhatsApp. Ambos generaron documentos con estado `stored` y sus archivos se comprobaron en Google Drive. Gmail normaliza Markdown UTF-8 a texto plano para el pipeline.

La identidad WhatsApp quedó como cliente provisional y no se fusionó con el cliente de Gmail: el proyecto vincula clientes solo mediante email o teléfono normalizados y coincidentes, nunca por el nombre. Para relacionar ambos canales de una persona, registra y verifica la misma identidad en el cliente correspondiente.

Esta comprobación confirma el procesamiento de esos mensajes, no que los workers sigan ejecutándose ahora. Gmail requiere iniciar su worker; WhatsApp requiere que el listener permanezca conectado. No se procesó el backlog general de mensajes antiguos/no leídos de Gmail.

## Conectores

WhatsApp importa imágenes y documentos compatibles recibidos en conversaciones
individuales. También conserva mensajes de texto de chats individuales como
interacciones sin crear documentos ni carpetas en Drive. Ignora grupos, estados,
difusiones, canales y mensajes propios antes de crear clientes o descargar archivos.
El servidor vuelve a validar que el evento pertenezca a un chat individual. El texto
que acompaña un archivo se conserva como contexto. Esta regla no elimina registros
importados anteriormente; reinicia el listener para activarla.

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
npm run ai:check
npm run lint
npm run typecheck
npm test
```

Las pruebas de integración requieren Supabase local y las E2E credenciales locales `LOCAL_OPERATOR_EMAIL` y `LOCAL_OPERATOR_PASSWORD`. Las pruebas de pipeline generan archivos en memoria y utilizan una base y almacenamiento temporal aislados.

No uses `supabase db reset` ni `npm run supabase:stop -- --no-backup` para el arranque normal: conserva los datos locales. Nunca publiques `.env.local`, credenciales OAuth, claves de Supabase ni `.data/whatsapp-auth`.
