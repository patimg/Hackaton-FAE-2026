# Hackaton-FAE-2026 · Archivo documental

> Fase IA/búsqueda: AIProvider permite modo determinista u OpenAI-compatible solo en servidor. `/search` valida SearchPlan y llama SQL parametrizado; no hay SQL generado por LLM ni fallback live silencioso. Datos enviados: filename, MIME, mensaje, asunto, canal, cliente mínimo y TXT ya extraído; nunca binarios, historial ni secretos.

Aplicación Next.js/TypeScript con Supabase/PostgreSQL y Auth reales. La fase 2 implementa el recorrido **simulador → ingestión → cliente → interacción → documento → clasificación determinista → archivo local → consulta/descarga → revisión**. Resultados verificables en [PHASE2_VERIFICATION.md](docs/PHASE2_VERIFICATION.md); historial de fase 1 en [VERIFICATION.md](docs/VERIFICATION.md).

## Arrancar

Requiere Node.js 22.23.3 (`.nvmrc`), npm y Docker accesible. En este equipo puedes activar el Node ya preparado con `export PATH="$PWD/.tools/node/bin:$PATH"`.

```bash
npm ci
npm run supabase:start
npm run db:migrate
npm run demo:setup
npm run db:seed
npm run dev
```

Abre **http://localhost:3000**. Usa el correo y contraseña de `DEMO_AUTH_EMAIL` y `DEMO_AUTH_PASSWORD` en tu archivo **local** `.env.local`; no compartas ese archivo. `demo:setup` crea/reutiliza la operadora real de Auth y escribe la configuración con permisos privados, sin imprimir secretos. No modifica la contraseña de una cuenta existente. Usa siempre el origen configurado en `APP_BASE_URL`.

Si el entorno ya está preparado, basta con `npm run supabase:start`, `npm run db:migrate` y `npm run dev`. Para producción local: `npm run build` seguido de `npm run start`. No ejecutes dev y start simultáneamente en el mismo puerto.

`npm run supabase:stop` conserva los datos. No uses `db reset` ni `stop --no-backup` en el arranque normal. Si Docker devuelve un error de permisos, comprueba `docker info` desde una sesión autorizada. Los scripts no cambian grupos ni permisos del socket.

El primer arranque requiere internet para instalar paquetes e imágenes. Después, el recorrido implementado utiliza únicamente Next.js, Supabase local y disco; no necesita cuentas Google ni LLM. Búsqueda en lenguaje natural e integraciones reales siguen pendientes.

## Probar el recorrido manualmente

1. Inicia sesión y abre **Simulador de entrada** (`/simulator`).
2. Pulsa **Cargar caso A**: Gmail, Carolina Pérez, `carolina@example.test`, mensaje del logo actualizado. Selecciona `fixtures/files/logo_nuevo.png` y pulsa **Enviar nuevo evento**.
3. Comprueba cliente **existente**, categoría `diseno`, estado `stored`, hash y enlaces. Abre **Detalle** en otra pestaña para conservar el último envío del simulador.
4. En el detalle revisa mensaje original, canal, SHA-256 y ruta. Abre Carolina Pérez y comprueba interacción/documento; vuelve al detalle y **Descargar original**.
5. Regresa a la pestaña del simulador y pulsa **Reenviar mismo evento**. Debe decir **Evento ya procesado: sin duplicados**, con los mismos IDs. El botón conserva el envío anterior incluso si editas el formulario; el snapshot se pierde al recargar o abandonar esa página.
6. Pulsa **Cargar caso C**, selecciona `fixtures/files/referencia.png` y envía. Debe quedar `needs_review`. En `/review`, selecciona una categoría, edita etiquetas y confirma. La corrección persiste y el documento sale de la bandeja si no hay conflicto de identidad.
7. Opcional: **Cargar caso B** con `comprobante.pdf` crea un cliente provisional la primera vez. Envía el logo con **Enviar nuevo evento** para comprobar otro documento con igual hash, pero distinta interacción. Para WhatsApp usa el teléfono ficticio de Carolina `+12025550112`. También puedes enviar texto sin adjuntos.

Los [fixtures A–E](fixtures/README.md) son sintéticos. Los JSON de `fixtures/events/` describen el mismo contrato usado por la UI; E retransmite exactamente A.

## Contrato y comportamiento

`POST /api/v1/ingest` recibe multipart: campo `event` con JSON `schema_version: "1"` y una parte binaria `file_0`, `file_1`, etc. por adjunto declarado. Contrato estricto en [src/contracts/ingest.ts](src/contracts/ingest.ts). El endpoint exige sesión de la operadora, cabecera `Origin` igual a `APP_BASE_URL` y cuenta `demo-gmail` o `demo-whatsapp` según canal. El token para n8n llegará con los conectores; todavía no es un endpoint público de canales reales.

Zod valida la estructura; se verifican partes, cantidades, tamaños y MIME por contenido. Los nombres se sanitizan y la extensión se obtiene del MIME admitido. Email se normaliza con trim/lowercase conservando puntos y sufijos `+`; teléfono se normaliza a E.164 con `DEFAULT_PHONE_COUNTRY`. Solo coincidencias exactas en identidades: nunca se fusionan clientes por nombre. Contactos contradictorios producen interacción sin cliente y documentos para revisión.

La RPC `begin_ingestion` registra en una transacción corta evento, resolución de identidad, interacción y documentos pendientes. No realiza I/O de archivos ni llamadas de IA dentro de la transacción. Los originales pasan a staging antes de clasificar. Fallo o salida inválida del clasificador produce `otro`, baja confianza y revisión; no elimina el original.

Unicidad: `(source, source_account_id, external_message_id)`. El hash del payload incluye metadatos normalizados y SHA-256 de bytes, sin depender de la frontera multipart.

| Situación | Resultado |
| --- | --- |
| Nuevo evento válido | `201`, interacción y un documento por adjunto; sin adjuntos solo interacción |
| Evento completado idéntico | `200`, mismos IDs y documentos actuales, incluidas correcciones humanas |
| Mismo ID y contenido diferente | `409 EVENT_PAYLOAD_CONFLICT`, original intacto |
| Mismos bytes en otro mensaje | Nuevo documento e interacción, SHA-256 coincidente |
| Evento previo procesándose o fallido | `409 EVENT_PROCESSING` / `EVENT_PROCESSING_FAILED`; sin recuperación automática en esta fase |
| Datos inválidos, exceso o MIME incorrecto | `422`, `413` o `415` antes de crear filas |

## Archivos locales y revisión

Por defecto, los originales finales quedan en:

```text
.data/files/clientes/CLI-0012 - Carolina Perez/2026/09/disenos/<document_uuid>__logo_nuevo.png
.data/files/clientes/CLI-0012 - Carolina Perez/2026/09/por_revisar/<document_uuid>__referencia.png
.data/files/sin_asignar/2026/09/por_revisar/<document_uuid>__archivo.png
.data/staging/<event_uuid>/<document_uuid>__archivo.png
```

Año/mes corresponden a la recepción en `APP_TIMEZONE`. Categorías: `cotizacion`, `comprobante_pago`, `diseno`, `referencia`, `entregable`, `otro`; carpetas: `cotizaciones`, `comprobantes`, `disenos`, `referencias`, `entregables`, `otros`. `por_revisar` es una ubicación operacional. UUID interno y código cliente estable evitan colisiones; la carpeta conserva un snapshot del nombre legible.

Los archivos están fuera de `public`, no se sobrescriben y solo se descargan por `GET /api/v1/documents/:id/content`, con autorización. La escritura rechaza rutas externas y enlaces simbólicos en sus subdirectorios. Conserva `.data/` y los volúmenes de Supabase para mantener archivos y metadatos juntos.

`/documents`, `/documents/[id]` y `/clients/[id]` muestran contexto, estados y origen. La lista de documentos y la revisión tienen páginas de 50; la ficha de cliente muestra hasta 50 documentos y 50 interacciones recientes.

`/review` permite categoría y hasta 8 etiquetas de 40 caracteres; guarda operadora, fecha y versión. Una versión antigua devuelve `409 REVIEW_CONFLICT`. Conserva la clasificación original como evidencia y muestra carpeta **actual** frente a **deseada**: todavía no mueve archivos. Si falta identidad o existe conflicto, guardar categoría no resuelve esa identidad y el caso sigue pendiente. No hay acción de borrar.

## Variables y límites

[.env.example](.env.example) contiene nombres y valores de ejemplo. Zod valida el entorno sin exponer valores secretos. `APP_MODE=demo` exige Supabase local, `AI_PROVIDER=deterministic` y `STORAGE_PROVIDER=local`. Cambiar a `live` no implementa adaptadores externos.

| Variables | Uso / valor predeterminado |
| --- | --- |
| `APP_MODE`, `APP_BASE_URL`, `APP_TIMEZONE`, `DEFAULT_PHONE_COUNTRY` | `demo`, `http://localhost:3000`, `America/Santiago`, `CL` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase, consumidas en servidor |
| `OPERATOR_USER_ID` | Único usuario Auth autorizado |
| `AI_PROVIDER`, `STORAGE_PROVIDER` | `deterministic`, `local` |
| `LOCAL_FILES_DIR`, `STAGING_DIR` | `./.data/files`, `./.data/staging` |
| `MAX_FILES_PER_MESSAGE` | 5 (máximo configurable: 20) |
| `MAX_FILE_BYTES` | 5 MiB (máximo configurable: 50 MiB) |
| `MAX_TOTAL_ATTACHMENT_BYTES` | 15 MiB (máximo configurable: 100 MiB) |
| `MAX_REQUEST_BYTES` | 16 MiB, incluye multipart (máximo configurable: 110 MiB) |
| `CLASSIFICATION_CONFIDENCE_THRESHOLD` | 0.80 |
| `DATABASE_URL` | Seed y pruebas PostgreSQL locales |
| `DEMO_AUTH_EMAIL`, `DEMO_AUTH_PASSWORD` | Bootstrap y pruebas de Auth real |

PDF, JPEG, PNG y TXT UTF-8; archivos no vacíos. Mensaje hasta 10.000 caracteres, asunto 500. El límite individual debe ser menor o igual al total, y este menor que el límite HTTP. La petición se lee con límite antes de parsear multipart. La ruta de ingestión omite el proxy de renovación para no duplicar el buffering: autoriza y renueva la sesión en el propio Route Handler.

**Clasificación simulada/determinista, sin LLM:** reglas basadas en contexto, nombre del archivo y texto de TXT. No lee contenido PDF ni imágenes, ni ejecuta OCR. Un nombre como `referencia.png` sin contexto suficiente no justifica alta confianza. Las seis categorías están cerradas; los casos inciertos van a revisión.

## Verificación

Con entorno configurado y Supabase iniciado:

```bash
npm run db:migrate
npm run db:seed
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Chromium ya está preparado en `.tools/playwright`. En otro equipo: `PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npx playwright install chromium`. Playwright detecta esa carpeta y arranca Next.js si no está ejecutándose. Usa un servidor actualizado; no reutilices un proceso antiguo para validar cambios.

Las pruebas usan Supabase/Auth/PostgreSQL reales. Integración prueba identidades, conflictos, idempotencia, varios adjuntos, hash, almacenamiento y fallback por fallo del clasificador. E2E ejecuta el recorrido manual anterior, descarga byte a byte, revisión persistente y control de acceso. **Las pruebas de ingestión dejan datos y archivos sintéticos persistentes** con IDs únicos: no limpian ni borran automáticamente originales. El seed es aditivo e idempotente y garantiza Carolina y Juan sin borrar esos datos.

## Módulos principales

| Ruta | Responsabilidad |
| --- | --- |
| `src/contracts/ingest.ts`, `src/server/files/` | Contrato, multipart acotado, MIME, hash y carpetas |
| `src/server/services/ingest.ts` | Único pipeline de aplicación |
| `supabase/migrations/20260924000100_ingest_message.sql` | Reserva transaccional y resolución exacta de identidades |
| `src/server/providers/ai/`, `src/server/providers/storage/` | Interfaces y adaptadores determinista/local |
| `src/app/api/v1/ingest/`, `src/app/api/v1/documents/` | Ingestión, descarga autorizada y revisión |
| `src/components/simulator.tsx`, `src/components/review-form.tsx` | Formulario, snapshot de reenvío y revisión |
| `src/app/(workspace)/`, `src/server/db/documents.ts` | Páginas y consultas persistentes |
| `fixtures/`, `tests/`, `docs/` | Casos sintéticos, pruebas y decisiones |

## Límites pendientes

- No Gmail/WhatsApp/n8n reales, Drive, LLM, OCR, embeddings ni búsqueda natural; `/search` sigue indicando que está pendiente.
- Sin leases, colas, workers, reintentos de eventos fallidos, reconciliación, resolución manual de identidad ni auditoría completa. Requests/Orders conservan solo esquema mínimo.
- Staging se conserva incluso tras éxito; no hay limpieza automática. Vigila espacio local. Un fallo de disco/DB puede dejar evento incompleto; no retransmitas con un ID nuevo como mecanismo de recuperación.
- La validación MIME verifica formato reconocible; no sustituye análisis antivirus ni un parser exhaustivo de documentos. Se fuerza descarga del original.
- Una instancia Node.js con disco persistente y una operadora. No desplegar este adaptador local en un filesystem efímero.
- ESLint 9.39.5 funciona, pero emite aviso de fin de soporte; ESLint 10 era incompatible con el plugin React de Next en la verificación de fase 1.

Siguiente paso recomendado: fase 3, resolver identidad manualmente y recuperar eventos incompletos preservando originales; luego completar búsqueda de fase 4. No se han conectado servicios externos.
