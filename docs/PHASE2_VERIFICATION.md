# Verificación real de fase 2

Fecha: 2026-09-24. **Fase 2 completada y verificada** sobre Supabase/PostgreSQL/Auth locales reales y filesystem persistente. Sin Gmail, WhatsApp, Drive ni LLM externos. Node 22.23.3; Chromium de Playwright preparado localmente.

## Comprobaciones ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Instalación de file-type/libphonenumber-js con versiones fijadas y lockfile actualizado | Correcta; instalación sin vulnerabilidades reportadas |
| Migración `20260924000100_ingest_message.sql` | Aplicada a Supabase local, sin reset de datos |
| `npm run db:seed` | Ejecutado correctamente; seed aditivo de Carolina y Juan |
| `npm test` | 15/15, sin omitidas |
| `npm run test:integration` | 11/11, sin omitidas, PostgreSQL/Auth y archivos reales |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto, cero advertencias de lint |
| `npm run build` | Correcto, rutas de ingestión/documentos/revisión incluidas |
| `npm run test:e2e` con Next dev | 5/5 |
| `npm run start` y E2E contra build de producción | 5/5, última ejecución 10,5 s |

El proceso de producción se dejó iniciado en `http://localhost:3000`. Si la sesión se detiene, ejecutar `npm run start` con Supabase disponible. No es un despliegue público.

## Evidencia funcional

- Normalización email sin quitar puntos/`+`; teléfono E.164. Cliente existente por email y por teléfono; provisional nuevo; mismo nombre con contacto distinto permanece separado.
- Email de Carolina y teléfono de Juan producen cliente null, revisión y carpeta `sin_asignar`. Ausencia de contactos genera provisional y motivo de revisión.
- Mensaje sin adjuntos persiste interacción sin inventar documento; varios adjuntos generan documentos separados con su contexto.
- Hash SHA-256 coincide con bytes en disco y con descarga de navegador. El almacenamiento se vuelve a leer desde otra instancia del adaptador, sin depender de memoria.
- Reenvío exacto conserva IDs y cantidades de clientes/interacciones/documentos/eventos; se comparan también directorios finales y staging sin nuevos archivos. Mismo ID con texto distinto devuelve `EVENT_PAYLOAD_CONFLICT`; los mismos bytes en otro evento conservan ambos orígenes.
- Formatos incoherentes con bytes, adjuntos ausentes/repetidos, tamaños/cantidades y request excesivos se rechazan. Nombres con traversal se sanitizan; escrituras exclusivas impiden sobrescritura. Un symlink externo no permite leer ni crear subdirectorios fuera de almacenamiento.
- Clasificación ambigua, excepción del proveedor y salida estructurada inválida conservan originales y producen revisión. No se usa OCR ni extracción PDF.
- E2E: login real → simulador A → Gmail/Carolina → logo → detalle → ficha de cliente → descarga idéntica → reenvío sin duplicar → simulador C → revisión → categoría/tags persistidos. Reenvío posterior conserva la corrección y una versión de revisión obsoleta devuelve 409.
- Peticiones anónimas, cuenta Auth no autorizada y origen ajeno no acceden a operaciones privadas. Input HTTP inválido no crea eventos. Tablas de negocio permanecen cerradas para roles públicos.

## Incidencias resueltas durante la verificación

1. Reglas por nombre con guion bajo no desambiguaban `logo_nuevo.png` en mensajes de varios adjuntos. Se normalizaron separadores y se añadió regresión; pruebas de múltiples archivos pasan.
2. En producción Next añade un anunciador accesible con `role=alert`; el selector genérico del test de usuario no autorizado coincidía con dos elementos. Se acotó al mensaje de credenciales y se repitieron los cinco E2E contra el build con resultado correcto. La autorización ya rechazaba el acceso.
3. Se reforzó la escritura local para comprobar cada subdirectorio antes de descender por él; prueba verifica que un enlace externo no causa creación de directorios fuera de la raíz.

## Límites del resultado

No se verifican ni declaran implementados búsqueda natural, conectores externos, auditoría completa, leases, recuperación concurrente, resolución manual de identidad o movimiento físico tras revisión. Tampoco se realizó en fase 2 una prueba con la red del equipo físicamente desconectada; el recorrido ejecutado solo usa servicios locales.

Staging se conserva después del éxito, sin limpieza automática. Los tests de ingestión dejan registros y archivos sintéticos persistentes; no son datos reales ni errores de duplicación. El seed no elimina esos registros. El selector de Carolina en E2E usa su ID estable porque nombres iguales con identidades distintas son un caso válido.

No quedan fallos en las comprobaciones ejecutadas. Permanece la limitación conocida de ESLint 9 (aviso de fin de soporte de esa rama, usado por compatibilidad con Next). Las advertencias de entorno de colores de Playwright no afectan resultados.

Guion manual, comandos, límites configurables y ubicación de originales: [README](../README.md). Alcance y criterios: [PLAN](PLAN.md).
