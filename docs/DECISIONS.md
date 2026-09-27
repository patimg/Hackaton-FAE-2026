# Decisiones de arquitectura vigentes

## PostgreSQL conserva el estado; Drive conserva los originales

Supabase/PostgreSQL es la fuente de verdad para clientes, identidades, interacciones, documentos y estados. Google Drive almacena los binarios finales. La aplicación exige credenciales de Drive; no hay fallback local para almacenamiento final.

## Gmail y WhatsApp son los canales de entrada

Gmail usa Gmail API con OAuth y procesa mensajes sin leer. WhatsApp usa Baileys como proceso independiente autenticado con `INGEST_API_TOKEN`. No hay ruta, componente ni cuenta de simulación.

Gmail combina `GMAIL_QUERY` con `GMAIL_START_DATE` cuando existe. La fecha limita el backlog inicial, mientras `category:primary` reduce promociones y redes sociales. No se usa `has:attachment` como regla global: los correos sin archivos pueden ser interacciones válidas. La clasificación de relevancia y la sincronización durable por `historyId` siguen pendientes.

## Un contrato y un pipeline para los conectores

El evento multipart normalizado es validado una vez. Gmail invoca el servicio directamente y WhatsApp usa `POST /api/v1/ingest`; ambos comparten resolución de identidad, idempotencia, clasificación y almacenamiento.

## Identidad exacta; ambigüedad visible

Email y teléfono se normalizan y se comparan exactamente. El nombre no fusiona clientes. Contactos contradictorios o insuficientes quedan para revisión humana.

Un remitente nuevo puede crear un cliente `provisional`, pero no se considera cliente activo hasta confirmación manual. `archived` es un estado reversible para ocultar ruido histórico sin eliminar interacciones, identidades ni documentos.

## Idempotencia por mensaje y hash por archivo

La clave única `(source, source_account_id, external_message_id)` evita duplicar un reenvío técnico. El SHA-256 conserva la integridad del binario. Enviar el mismo archivo en mensajes diferentes conserva cada contexto.

Si un mensaje registrado requiere recuperación con contenido corregido, no se debe cambiar su manifiesto bajo el mismo ID ni reintentarlo a ciegas: el hash protege la idempotencia y el evento puede estar parcialmente procesado. La recuperación debe ser explícita, acotada al evento, preservar la asociación válida del cliente y verificar el resultado en Drive.

## Adjuntos Markdown de Gmail

Gmail puede etiquetar archivos Markdown como `text/markdown`. Para mantener un único contrato de ingesta, el conector valida su contenido como UTF-8 y lo normaliza a `text/plain`; el nombre original se conserva y el nombre seguro de almacenamiento usa la extensión permitida `.txt`. Los MIME desconocidos y los textos inválidos no se descartan silenciosamente ni se marcan como leídos.

## IA sin autoridad sobre datos ni consultas

La IA entrega categorías, resúmenes y un plan de búsqueda validado. La base ejecuta SQL parametrizado; el modelo no genera consultas ejecutables, permisos ni rutas. Los resultados inciertos se pueden revisar manualmente.


## Validación tolerante para el plan de búsqueda (no para la clasificación)

`searchPlanSchema` valida por objeto abierto (no estricto): una clave extra que el modelo agregue se descarta sin invalidar el resto, porque `SearchService` solo lee el plan por clave nombrada y la RPC `search_documents` es parametrizada — una clave adicional nunca llega a ejecutarse. Esto evita que proveedores/modelos menos obedientes con el formato exacto (ej. modelos pequeños vía Groq) caigan siempre al modo de coincidencias por texto. `classificationSchema` sí se mantiene estricto: sus resultados se guardan tal cual en `documents`, así que una clave inesperada ahí sí debe rechazarse. Cualquier fallo real de interpretación IA en búsqueda queda registrado en consola del servidor (antes se descartaba en silencio).

## Staging temporal con retención ante fallos

Los bytes se conservan en staging durante el procesamiento y se retiran al confirmar su almacenamiento en Drive. Si la operación falla, el original permanece disponible localmente para investigar el evento.

Los fallos temporales quedan en `retryable_failed`. Reintentar el mismo evento reutiliza la copia de staging y omite documentos ya almacenados. La operación sigue dependiendo de que el conector vuelva a entregar el mismo payload; no existe todavía un worker independiente de recuperación.

## Baileys es una dependencia no oficial, no una API de producción

Baileys puede romperse o exponer la cuenta a restricciones. Para una operación estable se debe usar WhatsApp Business Cloud API y mantener fuera de Git la sesión local y los secretos.