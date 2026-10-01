# Regresiones de Escuela Visible

Este documento explica qué pruebas existen, qué comprueban, cómo ejecutarlas y cuáles son seguras.
Todas las pruebas automáticas son **de solo lectura** respecto a Supabase y Hedera: ninguna crea
necesidades, compromisos, entregas ni confirmaciones, y ninguna publica mensajes en Hedera.

## 1. Resumen

| Comando | Qué ejecuta | Necesita | Lee datos reales | Escribe | Apto para CI |
|---|---|---|---|---|---|
| `npm test` | Pruebas unitarias (`src/**/*.test.ts`) | nada | No | No | Sí |
| `npm run test:pglite` | Migraciones, guards, RPC y permisos en Postgres en memoria | nada (PGlite) | No | No (base en memoria) | Sí |
| `npm run test:privacy` | Secretos en los archivos del repositorio | `.env.local` opcional (para comparar valores) | No | No | Sí |
| `npm run test:bundle` | Fugas en el bundle del cliente | `npm run build` previo; `.env.local` opcional | No | No | Sí |
| `npm run test:regression` | Estado DEMO + Hedera, capa de datos B1, acciones B3/B4 con dobles | `.env.local` completo, red | **Sí** | No | No (secretos y datos reales) |
| `npm run test:regression:http` | Páginas públicas, `/verify`, paneles y acciones por HTTP | servidor local + `.env.local`, red | **Sí** | No | No |

## 2. Cómo ejecutarlas

```bash
npm test                       # unitarias
npm run test:pglite            # PGlite (offline)
npm run test:privacy           # secretos en el repositorio
npm run build && npm run test:bundle

npm run test:regression        # datos reales, solo lectura (no necesita servidor)

# HTTP: primero un servidor local con el build actual
npm run build && npm start     # http://localhost:3000
npm run test:regression:http
# Si el puerto 3000 está ocupado por otro proceso, usa otro puerto y avísalo:
#   npx next start -p 3100
#   REGRESSION_BASE_URL=http://localhost:3100 npm run test:regression:http
```

Las pruebas HTTP **se niegan a ejecutarse contra una URL que no sea local** (localhost / 127.0.0.1).
Solo con `REGRESSION_ALLOW_REMOTE=1` aceptan otra URL; no se recomienda (ver §6).

Variables usadas (solo nombres; los valores están en `.env.local`, que no se versiona):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (solo para leer),
`DEMO_ACCOUNT_PASSWORD`, `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`, `HEDERA_TOPIC_ID`, `HEDERA_MIRROR_NODE_URL`.
Ninguna regresión usa `HEDERA_OPERATOR_KEY` (no firman transacciones).

## 3. Qué prueba cada suite

Todas están en `scripts/regression/`. Cada una imprime `✓`/`✗` por comprobación y termina con
`TODO OK` (código 0) o `HAY FALLOS` (código 1). Los ejecutores (`run.mjs`) resumen el grupo.

### Offline

| Archivo | Tipo | Objetivo |
|---|---|---|
| `pglite/flow.mts` | PGlite | Migraciones + seed; RPC `flow_*` con eventos reales (`buildEvent`); guards de transición (incl. `committed → confirmed` bloqueado); roles; cantidades; completado automático; duplicados; RLS (74 comprobaciones). |
| `pglite/column-privacy-b0.mts` | PGlite | B0: `anon`/`authenticated` no leen `supporter_id`, `confirmed_by`, notas, evidencia, `submission_error`, `attempts`; las consultas de la app siguen funcionando. |
| `pglite/column-privacy-b01.mts` | PGlite | B0.1: `created_by` / `validated_by` protegidos; RLS intacta por rol. |
| `pglite/panel-isolation-b1.mts` | PGlite | B1: consultas de los paneles por rol con dos escuelas y dos aliados (aislamiento entre escuelas y entre aliados). |
| `secret-scan.mjs` | estático | Valores reales de secretos (comparados, nunca impresos) y formatos de credenciales (`sb_secret_…`, JWT, PEM, DER de Hedera) en los archivos del repositorio. |
| `bundle-scan.mjs` | estático | En `.next/static`: valores reales de secretos (decisivo) y señales de código de servidor (nombres de variables secretas, `createAdminClient`, `publishEvent`, RPC `flow_*`, SDK de Hedera, columnas privadas, emails DEMO). Los valores `NEXT_PUBLIC_*` son públicos por diseño y no se buscan. |

### Datos reales, solo lectura (`npm run test:regression`)

| Archivo | Tipo | Objetivo |
|---|---|---|
| `state.mts` | lectura Supabase + Mirror Node | Conteos DEMO; El Mirador sin cambios; La Cascada completada 30/30; Los Robles no aprobada; los 13 eventos publicados y **VERIFIED 13/13**; mensajes HCS con exactamente los 9 campos y sin datos de personas. |
| `data-layer.mts` | funciones reales de `src/lib/data/panel.ts` con sesiones DEMO | Firmas sin contexto de seguridad; redirecciones por rol; contenido y aislamiento de cada panel; filtros del admin; ninguna clave sensible, UUID de persona, `school_id` ni email en los DTO. |
| `actions-needs.mts` | Server Actions reales de B3 | Crear / validar / no aprobar con las funciones de flow reales; la base y Hedera sustituidas por **dobles** (las RPC solo se registran, `publishEvent` no publica). Roles, `schoolId` del formulario ignorado, errores, publicación pendiente. |
| `actions-support.mts` | Server Actions reales de B4 | Comprometer / reportar / confirmar con dobles: roles, dueño, otra escuela, `committed → confirmed` bloqueado, cantidades, carreras, errores, publicación pendiente. |

Estas pruebas **inician sesión** con las cuentas DEMO (crea sesiones en Supabase Auth, como un
usuario normal) y **leen** datos reales. En `actions-*.mts` es normal ver trazas
`publishEvent(...) falló; el evento queda en el outbox`: son los casos de prueba en los que el
doble simula un fallo de Hedera, y la prueba comprueba que la interfaz lo muestra como pendiente.

### HTTP, solo lectura (`npm run test:regression:http`)

| Archivo | Objetivo |
|---|---|
| `http-public.mjs` | Portada, escuelas, necesidad activa / completada / no aprobada (404), historial, `/verify` en vivo (13/13) de los eventos, paneles por rol tras el E2E. |
| `http-panels.mjs` | Paneles B2: sin sesión, aislamiento escuela/escuela y aliado/aliado, roles cruzados, parámetros manipulados (`?schoolId=`, `?supporterId=`, `?userId=`, `?role=`), filtros válidos e inválidos, páginas de detalle, privacidad del HTML completo (incluido el payload RSC). |
| `http-need-actions.mjs` | B3: formulario de la escuela (sin campos de identidad, aviso de privacidad), CSRF, sin sesión, rol incorrecto, datos inválidos; revisión admin sin botones en necesidades ya revisadas. |
| `http-support-actions.mjs` | B4: «Quiero apoyar» solo en necesidades publicadas, página de compromiso (meta, comprometido, disponible), CSRF, sin sesión, rol incorrecto, cantidad inválida o mayor que lo disponible, botones solo en los estados correctos. |

Los envíos de formularios de estas pruebas **siempre se rechazan antes de escribir**: origen
ajeno (CSRF), sin sesión, rol incorrecto, cantidad no numérica o mayor que lo disponible.

## 4. Datos que esperan

Las expectativas codifican el estado aprobado tras el E2E real de B4, las 2 escrituras reales
autorizadas en B5.3 (necesidad «Prueba Vercel HCS (DEMO)» de El Mirador, creada y validada) y la
inserción autorizada de la escuela real documentada (`is_demo = false`, sin necesidades ni eventos):

| Dato | Valor |
|---|---|
| schools / profiles / needs / commitments / hedera_events | 4 / 5 / 4 / 2 / 13 |
| El Mirador | `published`, 5/20 confirmado, compromiso de 5 `confirmed`, eventos #1–#5 |
| El Mirador (B5.3) | `2583d69d…` `published`, meta 1, 0 compromisos, eventos #12, #13 |
| La Cascada | `completed`, 30/30, compromiso de 30 `confirmed`, eventos #6, #7, #9, #10, #11 |
| Los Robles | `cancelled`, 0 compromisos, evento #8 |
| I.E. Rural El Hoyo – Sede C Santillana | escuela real, `is_demo = false`, 0 necesidades, 0 eventos |
| Hedera | topic `0.0.10796342`, 13 mensajes, todos VERIFIED |

Si los datos cambian **de forma legítima** (un E2E autorizado), las pruebas fallarán en esos
valores: hay que actualizar las expectativas (sin quitar comprobaciones) y documentarlo aquí.
Las pruebas nunca resetean ni modifican la base real.

## 5. PASS y FAIL

- **PASS** (`TODO OK`, código 0): todas las comprobaciones se cumplen.
- **FAIL** (`HAY FALLOS`, código 1): alguna comprobación no se cumple. Leer las líneas `✗`:
  - en `state.mts`: los datos o Hedera ya no coinciden con el estado aprobado (¿una escritura no autorizada?);
  - en `test:privacy` / `test:bundle`: posible secreto o código de servidor expuesto (no publicar ni desplegar);
  - en HTTP / acciones: regresión funcional o de seguridad.
- **Código 2**: falta configuración (`.env.local`, servidor, build) — no es un fallo de la app.

## 6. Qué NO ejecutar contra producción

- Las pruebas HTTP y `test:regression` están pensadas para un **servidor local** conectado al
  proyecto Supabase DEMO. Aunque no escriben datos de negocio, inician sesión con cuentas DEMO y
  envían formularios que deben ser rechazados; no se ejecutan contra un despliegue público.
- Los E2E de escritura (§7) **nunca** forman parte de estos comandos.

## 7. E2E de escritura (manuales, con autorización)

Escriben datos reales en Supabase y publican mensajes permanentes en Hedera Testnet. **No se
ejecutan automáticamente** y cada paso requiere autorización explícita previa:

| E2E histórico | Qué hizo | Resultado |
|---|---|---|
| Caso El Mirador (scripts `e2e:first-event`, `e2e:validate-need`, `e2e:commitment`) | Ciclo completo por scripts | eventos #1–#5 |
| B3 (interfaz real) | La Cascada crea → admin valida; Los Robles crea → admin no aprueba | eventos #6–#8 |
| B4 (interfaz real, paso a paso) | Aliado compromete 30 → reporta entrega → La Cascada confirma (necesidad completada) | eventos #9–#11 |

Los scripts `scripts/e2e-*.ts` son **solo lectura por defecto** y solo escriben con `--confirm`.
Procedimiento seguido en B3/B4 (por la interfaz real): comprobaciones previas de solo lectura →
un paso por ejecución, un solo clic → verificación en Supabase, `npm run hedera:verify -- <eventId>`
(13/13) y comparación byte a byte con el Mirror Node → comprobación de que El Mirador y Los Robles
no cambiaron → `npm run test:regression` y actualización de expectativas.

Un E2E de escritura nuevo añade mensajes permanentes al topic (≈ 0,0035 ℏ cada uno).
