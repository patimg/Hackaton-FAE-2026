# Verificación de fase 1

Fecha de cierre: 2026-09-24. **Estado: fase 1 completada y verificada con PostgreSQL y Supabase Auth reales.** Sin mocks de base de datos ni autenticación.

## Entorno comprobado

- Node.js 22.23.3 y npm 10.9.9 preparados en `.tools/node`; dependencias fijadas en lockfile.
- Docker 29.1.3 accesible para `pati` tras habilitar su pertenencia al grupo `docker`.
- Supabase local iniciado: PostgreSQL, Auth, PostgREST, gateway y Studio.
- Chromium descargado en `.tools/playwright`, detectado por la configuración de Playwright.
- `.env.local` generado por `demo:setup`, fuera de Git y con permisos `600`. No se imprimieron secretos.

## Ocho criterios solicitados

| Criterio | Resultado real |
| --- | --- |
| 1. Instalar dependencias | **OK:** `npm install` y `npm ci` desde lockfile comprobados en la implementación inicial; 0 vulnerabilidades reportadas entonces. No cambiaron dependencias en esta verificación |
| 2. Supabase/migraciones | **OK:** `supabase:start` inicializó el esquema, aplicó `20260923000100` y ejecutó el seed SQL. `db:migrate` confirmó que no quedaban migraciones pendientes |
| 3. Seed | **OK:** `demo:setup` creó una operadora real de Auth; `db:seed` se ejecutó dos veces. La prueba de idempotencia volvió a aplicar el seed sin duplicados |
| 4. Login | **OK:** login por contraseña contra Supabase Auth y recorrido en Chromium; logout y cierre del registro público comprobados |
| 5. Consulta de clientes | **OK:** Chromium mostró Carolina Pérez y Juan Soto, abrió la ficha de Carolina y verificó su correo y carpeta prevista |
| 6. Typecheck | **OK:** `npm run typecheck` después de los ajustes de configuración y pruebas |
| 7. Lint | **OK:** `npm run lint` sin errores ni advertencias de reglas |
| 8. Build | **OK:** `npm run build` con `.env.local` real, todas las rutas solicitadas compiladas |

## Resultados de pruebas

- `npm test`: **5/5 pasan**. Perfil demo, rechazo de proveedores externos, validación de entorno y errores sin secretos.
- `npm run test:integration`: **5/5 pasan**. Seed idempotente, UNIQUE, SHA-256 válido, taxonomía cerrada, relaciones consistentes, permisos directos bloqueados, login Auth real y registro público deshabilitado.
- `npm run test:e2e`: **3/3 pasan** en Chromium. Sin sesión se protegen páginas/API y se rechaza un origen extraño; login de operadora permite clientes, detalle, navegación, 404 y logout; una cuenta Auth válida sin autorización no puede acceder ni eludiendo el formulario con su sesión real.
- Se creó y eliminó exclusivamente la cuenta temporal de la prueba de autorización; permanece una sola operadora en Auth.
- Supabase se detuvo con respaldo y volvió a iniciar al corregir la configuración: clientes y usuario Auth sobrevivieron. `demo:setup` pudo reutilizar la cuenta existente sin cambiar su contraseña.

Estado final consultado directamente en PostgreSQL:

| Tabla | Filas |
| --- | ---: |
| clients | 2 |
| client_identities | 4 |
| documents | 0 |
| processed_events | 0 |
| auth.users | 1 |

Las carpetas previstas son `CLI-0012 - Carolina Perez` y `CLI-0013 - Juan Soto`. Aún no se crean archivos: almacenamiento e ingestión corresponden a fase 2.

## Fallo encontrado y corregido

La primera ejecución real pasó 3 pruebas de integración y falló en Auth con `Email logins are disabled`. En esta CLI, `[auth.email].enable_signup=false` deshabilitaba el proveedor de email completo (`GOTRUE_EXTERNAL_EMAIL_ENABLED=false`).

Se habilitó `[auth.email].enable_signup=true` y se conservó `[auth].enable_signup=false`. Tras reiniciar Supabase, el login funcionó y la nueva prueba de registro público recibió `signup_disabled`. La configuración permite usuarios creados por Admin sin abrir el registro público. El comportamiento está descrito en el [repositorio oficial de Supabase](https://github.com/supabase/supabase/issues/40582).

## Límites pendientes

- ESLint 9.39.5 sigue fijado por la incompatibilidad detectada entre ESLint 10 y el plugin React de Next; npm avisa del fin de soporte de esa rama. El lint actual pasa.
- Playwright muestra una advertencia de variables de color `NO_COLOR`/`FORCE_COLOR`; no afecta las pruebas.
- No se implementaron Gmail, WhatsApp, Drive, LLM, ingestión, clasificación, almacenamiento de documentos ni búsqueda funcional. Las pantallas correspondientes tienen estados pendientes claros.
- Estas verificaciones no equivalen al ensayo offline del pipeline completo de fase 4.

## Repetir la verificación

Con Node en PATH y Docker accesible:

```bash
npm run supabase:start
npm run db:migrate
npm run demo:setup
npm run db:seed
npm run test:integration
npm run test:e2e
npm run typecheck
npm run lint
npm test
npm run build
```

En otro equipo, preparar primero Chromium con `PLAYWRIGHT_BROWSERS_PATH=.tools/playwright npx playwright install chromium`. Los comandos de arranque y acceso están en [README.md](../README.md).
