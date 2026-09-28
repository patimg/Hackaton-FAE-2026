# Decisiones de arquitectura vigentes

## PostgreSQL conserva el estado; Drive conserva los originales

Supabase/PostgreSQL es la fuente de verdad para clientes, identidades, interacciones, documentos y estados. Google Drive almacena los binarios finales. La aplicación exige credenciales de Drive; no hay fallback local para almacenamiento final.

## Gmail y WhatsApp son los canales de entrada

Gmail usa Gmail API con OAuth y procesa mensajes sin leer. WhatsApp usa Baileys como proceso independiente autenticado con `INGEST_API_TOKEN`. No hay ruta, componente ni cuenta de simulación.

## Un contrato y un pipeline para los conectores

El evento multipart normalizado es validado una vez. Gmail invoca el servicio directamente y WhatsApp usa `POST /api/v1/ingest`; ambos comparten resolución de identidad, idempotencia, clasificación y almacenamiento.

## Identidad exacta; ambigüedad visible

Email y teléfono se normalizan y se comparan exactamente. El nombre no fusiona clientes. Contactos contradictorios o insuficientes quedan para revisión humana.

## Idempotencia por mensaje y hash por archivo

La clave única `(source, source_account_id, external_message_id)` evita duplicar un reenvío técnico. El SHA-256 conserva la integridad del binario. Enviar el mismo archivo en mensajes diferentes conserva cada contexto.

Si un mensaje registrado requiere recuperación con contenido corregido, no se debe cambiar su manifiesto bajo el mismo ID ni reintentarlo a ciegas: el hash protege la idempotencia y el evento puede estar parcialmente procesado. La recuperación debe ser explícita, acotada al evento, preservar la asociación válida del cliente y verificar el resultado en Drive.

## Adjuntos Markdown de Gmail

Gmail puede etiquetar archivos Markdown como `text/markdown`. Para mantener un único contrato de ingesta, el conector valida su contenido como UTF-8 y lo normaliza a `text/plain`; el nombre original se conserva y el nombre seguro de almacenamiento usa la extensión permitida `.txt`. Los MIME desconocidos y los textos inválidos no se descartan silenciosamente ni se marcan como leídos.

## IA sin autoridad sobre datos ni consultas

La IA entrega categorías, resúmenes y un plan de búsqueda validado. La base ejecuta SQL parametrizado; el modelo no genera consultas ejecutables, permisos ni rutas. Los resultados inciertos se pueden revisar manualmente.

## Staging temporal con retención ante fallos

Los bytes se conservan en staging durante el procesamiento y se retiran al confirmar su almacenamiento en Drive. Si la operación falla, el original permanece disponible localmente para investigar el evento.

## Baileys es una dependencia no oficial, no una API de producción

Baileys puede romperse o exponer la cuenta a restricciones. Para una operación estable se debe usar WhatsApp Business Cloud API y mantener fuera de Git la sesión local y los secretos.
