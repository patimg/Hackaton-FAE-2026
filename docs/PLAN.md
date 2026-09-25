# Plan de ejecución y aceptación

> Actualización: búsqueda de fase 4 e interfaz/adaptador de IA de fase 5 implementados, pendientes de validación local. Drive y canales reales continúan pendientes.

Estado: fases 1 y 2 completadas y verificadas; resultados de verificación en VERIFICATION.md y PHASE2_VERIFICATION.md. Fases 3–7 pendientes, salvo capacidades básicas adelantadas por petición expresa del equipo.

La arquitectura y los contratos están en [ARCHITECTURE.md](ARCHITECTURE.md); las razones y alternativas en [DECISIONS.md](DECISIONS.md). Las fases se ordenan para obtener un recorrido funcional local antes de depender de servicios externos. No se fija una duración sin conocer equipo ni horas disponibles.

## Fase 0 — Revisar alcance y preparar la ejecución

Entregables actuales: los tres documentos, `.env.example` y `.gitignore`. Inspección: carpeta inicialmente vacía, sin Git ni aplicación existente.

Antes de programar, revisar con el equipo los supuestos de una PYME/una operadora, categorías, formatos/tamaños, procesamiento síncrono y uso de equipo con disco persistente. Identificar disponibilidad de Docker, cuenta Google, proveedor LLM y acceso a WhatsApp. La falta de credenciales no bloquea fases 1–4.

Criterios de aceptación:

- [ ] El equipo puede seguir un mensaje desde el canal hasta su archivo y metadatos leyendo los contratos.
- [ ] Están descritos identidad ambigua, duplicado, fallo parcial, baja confianza y ausencia de IA/Drive.
- [ ] Se distinguen propuesta e implementación; no hay funcionalidades creadas en esta fase.
- [x] El usuario revisa el plan y autoriza comenzar la implementación. Esta revisión responde a su petición expresa de planificar primero.

## Ajustes de prioridad aprobados

Recorrido principal: mensaje → identificación del cliente → interacción → documento → clasificación → almacenamiento → búsqueda → revisión. El CRUD comercial avanzado queda fuera hasta completar este recorrido.

Taxonomía: `cotizacion`, `comprobante_pago`, `diseno`, `referencia`, `entregable`, `otro`. Carpetas legibles: `CLIENTES/CLI-0012 - Carolina Perez/2026/09/Disenos/`, con código estable y UUID interno. Leases/recuperación concurrente llegan en fase 3; reservas remotas/reconciliación Drive en fase 5.

## Fase 1 — Base ejecutable, entorno y esquema

Trabajo: crear Next.js/TypeScript, fijar versiones compatibles y lockfile, validar entorno, preparar Supabase local, migraciones SQL y usuario de operadora. Configurar sesión, permisos, RLS y páginas base. Documentar comandos reales en README; no depender de un servicio de email para login local.

Priorizar clients, client_identities, processed_events, interactions y documents. Conservar requests y orders mínimos para relaciones de contexto, sin CRUD comercial. Diferir audit_entries a fase 3 y storage_folders a fase 5. Preparar UNIQUE de eventos, external_message_id, SHA-256 y estados explícitos; leases, reconciliación compleja, recuperación concurrente y reservas remotas no bloquean el happy path. No crear abstracciones ni funciones sin uso actual.

Criterios de aceptación:

- [x] Instalación reproducible desde lockfile, typecheck, lint y build exitosos.
- [x] Migraciones crean esquema completo en DB local vacía; el seed aditivo puede ejecutarse dos veces.
- [x] Relaciones inválidas de cliente/solicitud/pedido y duplicados de identidad/evento son rechazados por DB.
- [x] Operadora puede iniciar sesión; usuario no autorizado, anónimo y peticiones directas a tablas no pueden consultar documentos.
- [x] Entorno incompleto falla con un mensaje claro y sin valores secretos; demo no necesita credenciales Google/LLM (pruebas unitarias).
- [x] Las exclusiones Git cubren `.env.local`, credenciales y `.data/`, pero permiten `.env.example` (comprobado con git check-ignore en repositorio temporal).

Verificación: smoke test de arranque/Auth y pruebas de integración de constraints y acceso. No buscar cobertura porcentual por sí misma.

## Fase 2 — Recorrido vertical: simulador → pipeline → documento local

Trabajo: implementar contrato multipart, simulador, autenticación de origen, normalización de identidades, reserva de evento, SHA-256, staging, clasificación determinista y almacenamiento local. Listados y detalle muestran contexto y descarga privada. Por petición expresa de fase 2, se adelantan idempotencia básica, revisión de categoría/tags y ficha de cliente; no se adelantan leases ni auditoría completa.

Criterios de aceptación:

- [x] La misma ruta y el mismo servicio reciben Gmail simulado y WhatsApp simulado; no existe un pipeline especial de demo.
- [x] El formulario admite nombre, correo, teléfono, texto y uno o varios archivos; asunto opcional para Gmail.
- [x] Un mensaje claro genera evento, cliente/identidad cuando corresponde, interacción y un documento por adjunto.
- [x] SHA-256 guardado coincide con bytes recibidos y descargados; nombre original y contexto permanecen consultables.
- [x] La estructura de carpetas sigue el contrato y no depende de rutas suministradas por el remitente.
- [x] Un mensaje sin archivos genera interacción sin documentos; entrada vacía se rechaza.
- [x] Mismo email/teléfono normalizado resuelve al cliente existente; nombres iguales no fusionan personas.
- [x] Identidades contradictorias producen revisión sin asociar el archivo al cliente equivocado.
- [x] Multipart incompleto, archivo no admitido o excesivo se rechaza de forma visible.

Verificación: pruebas de contrato, identidad y un recorrido de UI con PDF/TXT/imagen sintéticos. Fixtures con resultado esperado y clasificación visiblemente simulada.

Criterios adicionales solicitados y comprobados:

- [x] Reenvío exacto devuelve IDs existentes sin crear filas ni archivos; mismo ID con contenido diferente devuelve `409 EVENT_PAYLOAD_CONFLICT`.
- [x] Mismos bytes en otro mensaje crean otro documento conservando el hash y ambos contextos.
- [x] `/documents`, detalle y ficha de cliente muestran mensaje, estados y relaciones; descarga autorizada conserva bytes.
- [x] `/review` filtra pendientes y persiste categoría/tags; conserva evidencia y ubicación original. Versión antigua devuelve `409`; reenvío no pisa revisión.
- [x] Fallo del clasificador conserva originales y produce revisión; imágenes sin contexto no aparentan OCR.
- [x] Fixtures A–E y recorrido E2E ejecutado con Supabase real: login, Carolina, logo, cliente, descarga, reenvío y revisión.

Límites: eventos fallidos/en proceso devuelven `409`, sin recuperación automática; conflictos de identidad no se resuelven desde revisión de categoría. Staging no se elimina. Búsqueda sigue pendiente. Evidencia: [PHASE2_VERIFICATION.md](PHASE2_VERIFICATION.md).

## Fase 3 — Robustez, trazabilidad y revisión

Trabajo: completar idempotencia concurrente, leases, recuperación por documento, estados de eventos, descarga privada, auditoría y revisión humana. Agregar listado de eventos y reintento explícito. Implementar edición mínima de contexto. La UI comercial mínima se pospone hasta completar el recorrido documental; no bloquea su aceptación.

Criterios de aceptación:

- [x] Reenviar el mismo evento devuelve los mismos IDs y no aumenta clientes, interacciones, documentos ni archivos. (Base adelantada en fase 2.)
- [ ] Dos solicitudes concurrentes del mismo evento tienen un único propietario del procesamiento; el segundo recibe estado consultable.
- [x] Reutilizar ID con contenido distinto devuelve `409` y conserva el original. (Base adelantada en fase 2.)
- [x] Reenviar mismos bytes con otro ID de mensaje conserva dos recepciones y permite ver que comparten hash. (Base adelantada en fase 2.)
- [ ] Fallo en el segundo/tercer adjunto conserva los anteriores; reintento completa los faltantes sin duplicarlos.
- [ ] Tras reiniciar el proceso, un lease vencido se recupera y staging permite continuar; si faltan bytes, se solicita retransmisión.
- [x] JSON IA inválido, confianza inferior al umbral o evidencia insuficiente guardan archivo y producen revisión. (Base adelantada en fase 2.)
- [ ] Corregir categoría o contexto registra actor, fecha, motivo y antes/después; preserva evidencia original.
- [x] Revisión concurrente con versión antigua devuelve `409`; un reintento de ingestión no pisa correcciones humanas. (Base adelantada en fase 2.)
- [x] La ubicación real no se altera ni se oculta al corregir categoría; se distinguen carpeta actual y deseada. (Base adelantada en fase 2.)
- [ ] Las relaciones comerciales incompatibles se rechazan en DB; crear/convertir solicitudes desde UI es posterior al recorrido documental.

Verificación: pruebas de integración con PostgreSQL y fallos inyectados en límites de persistencia; ninguna prueba de fallos usa archivos reales de clientes.

## Fase 4 — Consulta, búsqueda y demo offline completa

Trabajo: ficha de cliente con contexto e historial, documentos con filtros, bandeja de revisión, búsqueda por lenguaje natural mediante adaptador determinista y compilación a consulta parametrizada. Preparar fixtures y guion de exposición.

Criterios de aceptación:

- [ ] La operadora encuentra documentos por cliente, categoría, período, canal y texto.
- [ ] «Los diseños de Ana de agosto» muestra interpretación, período utilizado y resultados existentes; varias Anas generan selección explícita.
- [ ] Una consulta sin coincidencias devuelve vacío, y un intérprete fallido permite búsqueda textual con aviso.
- [ ] Consultas y resultados respetan paginación, límites y autorización.
- [x] Detalle permite conocer quién envió el original, cuándo, por qué canal, con qué mensaje y cómo fue clasificado. (Base adelantada en fase 2.)
- [x] PDF escaneado/imagen ambigua no aparenta haber sido leído con OCR; revisión visible cuando falta evidencia. (Base adelantada en fase 2.)
- [ ] Con red desconectada funcionan login, simulador, almacenamiento, revisión, búsqueda y descarga.
- [ ] Los datos sobreviven a reiniciar Next.js y servicios locales; no se usan mocks en memoria como base de datos.
- [x] El indicador de demo identifica IA simulada y almacenamiento local sin mostrar enlaces Drive ficticios. (Base adelantada en fase 2.)

Verificación: recorrido E2E de 5–7 minutos y ensayo offline completo en equipo de presentación, con dependencias precargadas. Este es el primer corte demostrable completo; las integraciones live siguen pendientes.

## Fase 5 — Adaptadores reales de Drive e IA

Trabajo: elegir un proveedor LLM según acceso disponible, implementar sus dos operaciones detrás de `AIProvider`, configurar salida estructurada y validación. Configurar OAuth de Google Drive, IDs reservados, carpetas y descarga. Mantener intactos los servicios de negocio y los contratos.

Criterios de aceptación:

- [ ] Un cambio de configuración y adaptadores permite ejecutar el mismo recorrido en live.
- [ ] Los bytes de un original descargado desde Drive tienen el SHA-256 esperado; DB contiene IDs, carpetas y estados reales.
- [ ] OAuth permite renovar acceso y operar en una raíz privada creada/autorizada para la aplicación.
- [ ] Caída después de subir y antes de confirmar DB se reconcilia con el ID reservado, sin segundo archivo Drive.
- [ ] IA real devuelve JSON validado para clasificación y búsqueda; un dato fuera de esquema no se ejecuta ni persiste como resultado confiable.
- [ ] Timeout de LLM guarda originales con revisión y habilita búsqueda textual; no dispara acciones destructivas.
- [ ] Fallo de Drive conserva staging y muestra estado recuperable, sin presentar un archivo local como si estuviera en Drive.
- [ ] Perfil demo vuelve a funcionar sin usar claves ni servicios externos; no hay conmutación silenciosa de datos entre perfiles.

Verificación: pruebas de contrato compartidas por adaptadores y smoke test live con archivos sintéticos. La elección de proveedor y versiones se registra en DECISIONS al implementarlas.

## Fase 6 — n8n y canales reales

Trabajo: exportar workflows sin credenciales; Gmail/WhatsApp descargan binarios, normalizan el envelope y llaman al endpoint. Mantener IDs estables, gestionar errores y consultar estado. Gmail primero; WhatsApp real cuando exista acceso autorizado a su API.

Política inicial n8n: ante `202`, consultar estado y reenviar solo si el lease expiró o el evento pide reintento; ante `429/503`, respetar `Retry-After`, con backoff y máximo tres reenvíos por ejecución. Errores `4xx` permanentes pasan a atención manual. Tras agotar reintentos, conservar datos para redelivery y mostrar el fallo. Los secretos de Gmail/WhatsApp permanecen en n8n.

Criterios de aceptación:

- [ ] Gmail real produce el mismo tipo de registros, hash y trazabilidad que el simulador.
- [ ] WhatsApp real hace lo mismo si existe cuenta/API disponible; si no, se documenta como integración pendiente y se demuestra mediante simulación explícita.
- [ ] Cada reenvío conserva `external_message_id`, `external_attachment_id`, fecha original y cuenta receptora.
- [ ] Reiniciar o perder historial de n8n no elimina clientes, contexto ni documentos del backend.
- [ ] n8n no escribe metadatos de negocio en DB, no decide clientes/categorías y no sube originales directamente a Drive.
- [ ] Token inválido y cuenta no permitida se rechazan; token no aparece en navegador ni workflow exportado.
- [ ] Error temporal dispara reintento limitado y error permanente queda visible para atención manual.

Verificación: un mensaje real por canal disponible, retransmisión del mismo mensaje y una respuesta temporal inducida. No marcar WhatsApp real como terminado si solo existe su simulador.

## Fase 7 — Preparación de entrega

Trabajo: preflight de equipo/cuentas/disco, revisión de secretos, README operativo y ensayo. Documentar arranque live, arranque demo, recuperación de eventos, limitaciones e integraciones realmente disponibles. Preparar copia de respaldo de fixtures y DB local, sin reset automático.

Criterios de aceptación:

- [ ] Otra persona del equipo puede arrancar la demo siguiendo README.
- [ ] Typecheck, build y pruebas relevantes del pipeline, acceso y recorrido E2E pasan.
- [ ] Se puede explicar y demostrar cada requisito con evidencia concreta; pendientes live se declaran como pendientes.
- [ ] No hay credenciales ni documentos reales de clientes en archivos versionados, logs de demo o exports.
- [ ] El recorrido offline completo fue ejecutado, no solo descrito.
- [ ] Hay lista breve de limitaciones y recuperación, coherente con el comportamiento implementado.

## Priorización si se reduce el tiempo

Prioridad obligatoria: fases 1–4 con persistencia real, trazabilidad, idempotencia, autenticación y revisión. Después Drive y LLM reales (fase 5), Gmail y WhatsApp (fase 6). La fase 7 siempre se realiza sobre lo realmente terminado.

Recortar primero estética adicional, métricas, CRUD comercial avanzado y canal WhatsApp real si no hay credenciales. No recortar aislamiento de secretos, mismo pipeline, hash, persistencia, revisión ni distinción entre demo y live. Un corte local no se presenta como integración Google Drive terminada.

## Matriz mínima de escenarios

| Escenario | Evidencia esperada | Fase |
| --- | --- | --- |
| Nuevo cliente Gmail, dos adjuntos | 1 cliente, 1 interacción, 2 documentos descargables | 2 |
| Cliente conocido por WhatsApp vinculado previamente | Mismo cliente e historial de ambos canales | 2 |
| Nombre igual, contacto distinto | Clientes separados | 2 |
| Email y teléfono de clientes distintos | Interacción sin cliente resuelto y revisión visible | 2–3 |
| Mensaje sin adjuntos | Interacción trazable sin documento inventado | 2 |
| Evento repetido y concurrente | Misma respuesta lógica, sin filas/archivos adicionales | 3 |
| Mismo ID con bytes distintos | Conflicto explícito, original intacto | 3 |
| Mismo archivo en otro mensaje | Dos orígenes conservados y hash coincidente | 3 |
| Fallo parcial y reinicio | Reanudar solo pendientes, sin duplicados | 3 |
| IA inválida o incierta | Archivo conservado, revisión y evidencia | 3/5 |
| Corrección humana | Auditoría y cambios persistentes tras reintento | 3 |
| Consulta natural y ambigüedad | Filtros visibles, filas reales y selección de cliente | 4 |
| Sin acceso a internet | Recorrido completo local y persistente | 4/7 |
| Drive guarda pero DB falla | Reconciliación sobre el mismo ID | 5 |
| Acceso sin autorización | Denegación también en API y descarga | 1–7 |

## Guion de demostración propuesto

1. Mostrar el modo activo y la ficha vacía de un cliente sintético.
2. Simular Gmail con diseño y comprobante; abrir cliente, interacción y originales.
3. Simular WhatsApp de una identidad previamente vinculada al mismo cliente.
4. Reenviar el evento y demostrar que no aumentó el número de documentos.
5. Enviar un archivo ambiguo y corregirlo en revisión, mostrando auditoría.
6. Buscar «los diseños de Ana de agosto» sobre fixtures fechados; abrir el resultado y su mensaje original.
7. Mostrar el mismo recorrido sin red y explicar qué adaptadores cambian en live.

Las verificaciones se registran con resultados reales; una comprobación bloqueada por el entorno queda pendiente y no cuenta como exitosa. El guion anterior incluye fases futuras: para demostrar solo fase 2, seguir el recorrido del README.

## Estado de implementación de fase 1

Base implementada: Next.js/TypeScript/App Router, Auth SSR, operadora permitida, navegación, consulta de clientes, Zod, siete tablas con requests/orders mínimos y seed sintético. Carpetas reservadas mediante código estable y nombre legible; taxonomía aprobada de seis categorías. En ese corte inicial todavía no se había implementado ingestión.

**Fase 1 terminada:** instalación y `npm ci`, migraciones, seed idempotente, Auth real, consulta de clientes, typecheck, lint y build comprobados. Pasaron 5 pruebas unitarias, 5 de integración y 3 de navegador. Clientes y usuario Auth persistieron después de reiniciar Supabase. Se corrigió la configuración del proveedor email manteniendo cerrado el registro público. Resultados en [VERIFICATION.md](VERIFICATION.md) y comandos en [README](../README.md). El estado actual de fase 2 se describe arriba; esta sección conserva el resultado histórico de fase 1.
