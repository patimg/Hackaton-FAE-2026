# Plan operativo

## Estado actual (26 de septiembre de 2026)

Verificado en el entorno local:

- Una importación dirigida de Gmail con adjunto Markdown se recuperó con el soporte `text/markdown` → `text/plain`; se conservó el cliente existente y se comprobó que el documento quedó en Google Drive.
- Una imagen recibida por WhatsApp se procesó y el archivo correspondiente se comprobó en Google Drive.
- La identidad de WhatsApp no coincidió con la identidad de Gmail; se creó/asignó un cliente provisional. No se deben fusionar esos clientes sin confirmar y registrar una identidad coincidente.
- Typecheck, lint y las 19 pruebas unitarias pasaron después de los cambios de ingesta.

La verificación de mensajes no implica que los procesos Gmail o WhatsApp continúen ejecutándose. El worker Gmail no se lanzó sin filtro: el buzón tiene mensajes antiguos sin leer y se debe acotar explícitamente cualquier importación de backlog.

## Arranque

1. Completar `.env.local` con Supabase local, una cuenta operadora autorizada, credenciales OAuth Google, la carpeta raíz de Drive, la cuenta de Gmail, el proveedor IA y `INGEST_API_TOKEN`.
2. Iniciar Supabase, aplicar migraciones y levantar Next.js.
3. Iniciar `npm run sync:gmail` y `npm run dev:whatsapp` como procesos separados; vincular WhatsApp por QR si no existe una sesión persistida.
4. Usar la vista principal para buscar y revisar documentos. Los originales completados están en Drive; los mensajes incompletos permanecen en revisión.

## Comprobaciones de desarrollo

```powershell
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:e2e
```

Integración y E2E requieren Supabase local y credenciales de operadora. Las pruebas crean eventos temporales bajo una cuenta de integración reservada, usan buffers generados en memoria y eliminan sus filas y archivos temporales al finalizar. No se cargan datos de clientes al iniciar la aplicación.

## Trabajo técnico pendiente

- Revisar en lote los clientes provisionales históricos y confirmar o archivar los que ya existían antes de la separación visual.
- Mover físicamente en Drive los originales después de resolver una identidad; la resolución actual corrige la relación de base, pero conserva la ubicación física original.
- Sincronización incremental durable de Gmail mediante `historyId`; `GMAIL_START_DATE` limita el backlog inicial, pero no reemplaza una marca de agua persistida.
- Clasificador de relevancia para Gmail que reduzca newsletters y correos comerciales sin eliminar interacciones de texto válidas.
- Recuperación/reintentos durables para fallos parciales de base de datos, IA o Drive.
- Extracción de texto/OCR de documentos escaneados y tratamiento explícito de formatos no admitidos.
- Migración de Baileys a WhatsApp Business Cloud API para despliegues de producción.
- Retención y limpieza de eventos fallidos según una política operacional acordada.
- Resolver manualmente la identidad provisional de WhatsApp si se confirma que pertenece al mismo cliente que una identidad de Gmail existente.
