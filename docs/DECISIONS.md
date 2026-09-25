# Registro de decisiones

## D18 — IA real aislada y búsqueda parametrizada

`AIProvider` expone clasificación e interpretación de búsqueda. El adaptador OpenAI-compatible se configura solo en servidor por `AI_BASE_URL`, `AI_MODEL` y `AI_API_KEY`; demo conserva el proveedor determinista. Live sin configuración falla explícitamente. SearchPlan se valida con Zod y `search_documents` es SQL estático con parámetros; el modelo nunca genera SQL, permisos ni rutas. Ante fallo hay búsqueda textual visible y nombres ambiguos requieren selección humana.

Fecha: 2026-09-23. Estado: arquitectura general **aprobada por el equipo**; fase 1 autorizada. La aprobación no implica que las fases posteriores estén implementadas. Las decisiones derivadas directamente del encargo se identifican como requisito. El plan se encuentra en [PLAN.md](PLAN.md) y los contratos en [ARCHITECTURE.md](ARCHITECTURE.md).

## D01 — Una aplicación full-stack y módulos pequeños

**Decisión:** Next.js + TypeScript, App Router, runtime Node.js. Rutas HTTP, servicios de aplicación, consultas SQL y dos interfaces de proveedores. **Origen:** stack y simplicidad requeridos por el usuario.

**Razón:** entregar un recorrido completo con un solo proyecto desplegable. **Costo aceptado:** acoplamiento operacional a una instancia. **Descartado:** microservicios, Kubernetes, CQRS, broker y jerarquías genéricas de repositorios. **Revisar cuando:** exista carga medida que lo justifique.

## D02 — PostgreSQL es fuente de verdad; Drive conserva originales

**Decisión:** metadatos, identidades, contexto, estados y auditoría en Supabase/PostgreSQL; binarios en Drive live. Migraciones SQL y cliente Supabase de servidor, con RPC para transacciones. **Origen:** requisito.

**Razón:** buscar y relacionar documentos sin depender de nombres de carpetas o del historial de n8n. **Costo:** recuperación explícita entre DB y almacenamiento. **Descartado:** Drive como base de datos, binarios base64 en PostgreSQL y n8n como registro principal.

## D03 — Modo demo local, persistente y explícito

**Decisión:** mismo PostgreSQL/Auth mediante Supabase local, filesystem privado y proveedor IA determinista. El perfil se selecciona al arrancar y aparece en UI. **Origen:** demostrabilidad requerida; selección técnica propuesta.

**Razón:** una caída de internet o de servicios externos no debe impedir presentar el MVP. **Costo:** Docker y dependencias se preparan antes; una falla del propio equipo sigue siendo posible. **Descartado:** mocks en memoria, JSON como base alternativa y failover silencioso desde live. [Soporte oficial de desarrollo local](https://supabase.com/docs/guides/local-development).

## D04 — Un único contrato de ingestión multipart

**Decisión:** n8n y simulador llaman al mismo endpoint y servicio con JSON normalizado más binarios; solo difiere autenticación y procedencia. **Origen:** requisito de pipeline compartido.

**Razón:** probar el producto real sin depender del canal. **Costo:** limitar archivos y descargar adjuntos en n8n antes de enviarlos. **Descartado:** lógica de clasificación en workflows, URLs arbitrarias y envío base64. [Soporte multipart de n8n](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest).

## D05 — Identidad exacta y resolución humana de conflictos

**Decisión:** email/teléfono normalizados; sin coincidencias por nombre o fusión automática. Identidades contradictorias dejan interacción sin cliente resuelto. **Origen:** robustez y trazabilidad requeridas.

**Razón:** un documento asociado a la persona equivocada es peor que una revisión pendiente. **Costo:** algunos clientes provisionales/duplicados requerirán atención; la fusión completa de fichas queda fuera del MVP. **Revisar cuando:** exista evidencia real que justifique sugerencias asistidas, siempre confirmadas.

## D06 — Idempotencia por mensaje; hash no elimina recepciones

**Decisión:** clave única de fuente/cuenta/ID, huella canónica, adjunto único por interacción, SHA-256 de bytes desde el inicio. El lease de intento se implementará después del happy path, en fase 3. Archivos iguales enviados en mensajes diferentes conservan ambos contextos. **Origen:** requisitos de no duplicar procesamiento y calcular hash.

**Razón:** distinguir redelivery técnico de un cliente que vuelve a enviar legítimamente el mismo archivo. **Costo:** puede haber copias físicas entre mensajes distintos. **Descartado:** deduplicar globalmente por hash y perder trazabilidad; prometer exactamente una vez entre sistemas externos.

## D07 — Procesamiento síncrono acotado y staging durable

**Decisión:** handler espera hasta 60 segundos, registra progreso y permite reintento; una instancia Node.js con disco persistente, sin worker. Las reservas remotas y la reconciliación compleja se incorporarán en fase 5; los leases y la recuperación concurrente, en fase 3. Ninguno bloquea el primer recorrido funcional. **Origen:** elección de simplicidad compatible con recuperación.

**Razón:** no introducir una cola durable antes de necesitarla, y evitar tareas abandonadas tras responder HTTP. **Costo:** rendimiento limitado y almacenamiento temporal acumulado, sin limpieza automática en MVP. **Descartado:** prometer `202` como tarea durable sin ejecutor o depender de `/tmp` efímero en serverless. **Revisar cuando:** plazos y volumen excedan límites; entonces conservar contrato y añadir ejecutor durable sobre estado persistido. [IDs Drive para reintentos](https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files).

## D08 — IA intercambiable y con autoridad limitada

**Decisión:** interfaz `AIProvider` para clasificación por lote e interpretación de búsquedas, JSON validado, taxonomía cerrada, umbral inicial 0.80 y evidencia conservada. **Origen:** requisito de desacoplamiento y revisión.

**Razón:** sustituir proveedor sin modificar reglas de negocio y poder demostrar offline. **Costo:** ajustar umbral y prompts con ejemplos; la confianza no está calibrada. **Descartado:** IA generando SQL, permisos, rutas o acciones destructivas. **Pendiente:** elegir proveedor/modelo real por disponibilidad de credenciales en fase 5; no bloquea el resto.

## D09 — Búsqueda natural sobre filtros y texto

**Decisión:** traducir consulta a `SearchPlan` permitido y ejecutarlo con SQL parametrizado; resultados exclusivamente de DB. Fallback textual visible. **Origen:** búsqueda natural requerida; implementación propuesta.

**Razón:** resuelve «qué cliente, qué archivo y cuándo» sin índice vectorial adicional. **Costo:** no cubre toda similitud semántica ni texto ausente de imágenes. **Descartado:** embeddings/RAG/OCR universales en el primer corte. **Revisar cuando:** pruebas con la PYME demuestren consultas importantes no resueltas.

## D10 — Clasificación y disponibilidad son estados separados

**Decisión:** incertidumbre de IA no impide guardar originales; estados independientes de evento, almacenamiento y revisión. Auditoría append-only y control de versión para cambios humanos. **Origen:** seguridad y revisión requeridas.

**Razón:** nunca perder un archivo porque el clasificador falló ni sobreescribir una decisión humana durante reintentos. **Costo:** UI debe explicar «guardado y pendiente de revisión». No hay método de borrado en interfaces de almacenamiento.

## D11 — Carpetas estables y categorías corregibles

**Decisión:** carpetas visibles `CLIENTES/CLI-0012 - Carolina Perez/2026/09/Disenos/`; código secuencial estable más nombre legible, UUID interno y UUID documental en nombre. El código se asigna una vez, no se reutiliza, y el nombre de carpeta se conserva como snapshot para evitar movimientos al editar el nombre visible. Guardar ubicación real y ubicación deseada separadas cuando una revisión cambia contexto. **Origen:** organización estandarizada requerida.

**Razón:** evitar colisiones y movimientos remotos frágiles durante edición. **Costo:** después de revisar, un archivo puede permanecer en la carpeta original `por_revisar`; la web muestra la clasificación vigente y la ubicación real. **Fuera de alcance:** reorganización física posterior y sincronización bidireccional.

## D12 — OAuth de usuario para Google Drive

**Decisión:** cuenta de la dueña, raíz dedicada autorizada para la app y scope `drive.file`; refresh token solo en servidor. **Origen:** elección técnica que no asume Google Workspace.

**Razón:** las cuentas de servicio no pueden ser dueñas de archivos ni disponen de cuota propia; una unidad compartida exige disponibilidad organizacional. **Costo:** setup OAuth y validación de renovación. **Revisar cuando:** la PYME confirme una unidad compartida y prefiera cuenta de servicio. [Documentación oficial de Drive](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

## D13 — Acceso mínimo desde la primera fase

**Decisión:** una operadora permitida, Supabase Auth local/remoto, backend exclusivo para negocio, RLS y ningún secreto público. n8n usa token dedicado de ingestión. **Origen:** protección de archivos y secretos requerida.

**Razón:** una demo funcional también debe impedir acceso directo anónimo a documentos. **Costo:** sesión local y usuario seed; no hay multiempresa ni roles complejos. La autorización de servidor sigue siendo obligatoria al usar credenciales que omiten RLS. [Documentación oficial de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## D14 — Solicitudes y pedidos mínimos, sin inferir compromisos comerciales

**Decisión:** crear y asociar contexto comercial manualmente; una solicitud puede originar un pedido. No exigir pedido para recibir documento. **Origen:** entidades pedidas y foco documental.

**Razón:** almacenar información desde el primer contacto sin convertir cada mensaje en una venta. **Costo:** la operadora completa vínculos; no hay inventario, cobro ni automatización comercial.

## Supuestos que el equipo debe revisar antes de programar

- Categorías y ejemplos propios de la PYME; por ahora se propone una taxonomía general.
- Equipo con Docker, espacio local y posibilidad de preparar dependencias con internet.
- Tamaños/formatos habituales: los límites actuales están orientados a una demo acotada.
- Una sola operadora y una sola PYME son suficientes para la hackatón.
- Acceso a Google y a un LLM para fase 5; disponibilidad de WhatsApp API para fase 6.

Son supuestos explícitos, no funcionalidades ya resueltas ni exigencias de infraestructura empresarial. Los cambios acordados se reflejarán aquí y en los criterios del plan antes de implementar la fase afectada.

## Ajustes aprobados antes de implementar fase 1

- Prioridad: mensaje → identificación del cliente → interacción → documento → clasificación → almacenamiento → búsqueda → revisión. Requests y Orders conservan solo su esquema mínimo; no se implementa CRUD comercial avanzado antes de terminar este recorrido.
- Desde fase 1: persistencia, UNIQUE de eventos, external_message_id, campo SHA-256 obligatorio para documentos y estados explícitos. El cálculo de hash llega con la ingestión en fase 2. Leases, recuperación concurrente, reconciliación compleja y reservas remotas son trabajo posterior al happy path.
- Taxonomía cerrada inicial: `cotizacion`, `comprobante_pago`, `diseno`, `referencia`, `entregable`, `otro`. Se retira `identificacion`; no se añaden categorías sin necesidad.
- Carpetas de categoría: `Cotizaciones`, `Comprobantes`, `Disenos`, `Referencias`, `Entregables`, `Otros`; `Por revisar` es una ubicación operacional, no una categoría adicional.
- Fase 1 conserva `requests` y `orders` para sus FK de contexto; `audit_entries` se incorpora con revisión en fase 3 y `storage_folders` con Drive en fase 5. No hay repositorios ni RPC de negocio sin uso actual.
- Fase 1 muestra navegación y estados vacíos en búsqueda/simulador/revisión; no presenta el pipeline, almacenamiento ni clasificación como implementados.

## D15 — Implementación de fase 1 y verificaciones completadas

Se fijaron Next.js 16.3.6, React 19.3.0, TypeScript 5.9.3, Zod 4.6.5, Supabase JS 2.117.1 y SSR 0.12.7 en package.json/lockfile. ESLint 9.39.5 se mantiene por incompatibilidad observada del plugin React de Next con ESLint 10; tiene aviso de fin de soporte y deberá reevaluarse al actualizar el plugin.

No se agregaron leases, reservas remotas, storage_folders, auditoría ni CRUD comercial. Auth usa cookies HTTP-only renovadas por proxy y verificación `getUser` en servidor; las consultas vuelven a autorizar a la operadora antes de utilizar la clave privilegiada. El seed no crea sesiones ficticias: la cuenta se obtiene mediante la API Admin de Supabase local.

El bloqueo inicial de Docker fue resuelto por el usuario. La fase 1 se verificó contra PostgreSQL/Auth reales, sin sustituirlos por mocks. Pasaron migraciones, seed, login, consultas, pruebas y build. Ver [VERIFICATION.md](VERIFICATION.md).

## D16 — Email habilitado y registro público cerrado

**Decisión implementada y verificada:** en Supabase local, `[auth.email].enable_signup=true` habilita el proveedor de autenticación por email; `[auth].enable_signup=false` mantiene cerrado el registro público. La operadora se crea mediante Admin Auth, no mediante registro abierto.

**Evidencia:** la configuración anterior deshabilitaba también el login. Tras corregirla y reiniciar Supabase con datos conservados, la prueba de login pasó y la de registro público devolvió `signup_disabled`. Una cuenta Auth temporal sin permiso de operadora tampoco pudo acceder a páginas ni API.

## D17 — Corte funcional de fase 2

**Origen:** solicitud explícita de implementar el simulador, pipeline local y revisión simple antes de integraciones externas. Se adelantan de fases 3–4 idempotencia secuencial, descarga privada, ficha documental y revisión de categoría/tags. No se adelantan recuperación concurrente, leases, auditoría avanzada, búsqueda ni conectores.

**Implementado:** una RPC transaccional registra evento UNIQUE, identidades exactas, interacción y documentos pendientes; el servicio TypeScript persiste staging, clasifica y guarda originales fuera de `public`. PostgreSQL/Auth son reales. Email conserva puntos/sufijos; teléfono E.164 con libphonenumber-js. MIME se verifica por bytes con file-type y validación UTF-8 para TXT. Ambas dependencias quedan fijadas en lockfile.

**Idempotencia:** payload canónico con metadatos y hashes; evento completado idéntico devuelve resultado actual, distinto devuelve 409. Si está procesando/fallido, devuelve 409 sin reanudar. Una colisión de nueva identidad entre eventos revierte la transacción y requiere retransmisión: no fusiona ni asigna arbitrariamente.

**Autorización actual:** solo operadora Auth + Origin y cuentas demo por canal. n8n aún no tiene token implementado. La ingestión evita el proxy de Next para leer su cuerpo con límite antes de parsear multipart y autoriza/renueva sesión en el Route Handler.

**Clasificación:** AIProvider desacoplado, reglas deterministas con JSON validado; se usa texto del mensaje y TXT, no extracción PDF ni OCR. La UI muestra explícitamente simulación. Fallos del clasificador conservan archivos y generan revisión. La interpretación de búsqueda permanece sin consumidor/UI hasta fase 4.

**Carpetas:** se adopta la variante minúscula pedida en fase 2: `clientes/CLI-0012 - Carolina Perez/AAAA/MM/disenos/`; fecha de recepción en zona configurada. UUID en filename, creación exclusiva sin sobrescritura, staging duradero conservado. Los subdirectorios de escritura no siguen symlinks.

**Revisión:** categoría, tags, actor, fecha y versión; preserva evidencia inicial. La carpeta actual no se mueve, y la deseada se muestra aparte. Identidad conflictiva/ausente sigue pendiente aunque se confirme categoría. No se crean `audit_entries` ni `storage_folders` todavía.

**Costo aceptado:** staging ocupa una segunda copia, no hay limpieza ni recuperación automática. Procesamiento síncrono y con tamaño acotado, una instancia con disco persistente. Los tests dejan registros sintéticos para no introducir borrado automático de originales. Ver límites y verificaciones en README y PHASE2_VERIFICATION.md.
