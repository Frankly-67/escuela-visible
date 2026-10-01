# Auditoría B5 — Estado del producto y propuesta de alcance (solo lectura)

Fecha: 2026-10-01 · Base: `49e45fb feat: complete B4 commitment confirmation flow`
Esta auditoría no modificó código, datos, Supabase ni Hedera. Este archivo es el único cambio.
"NO VERIFICADO" = no comprobable solo con lectura en este entorno.

---

## A. Estado Git

- HEAD `49e45fb`; working tree limpio; sin push. Últimos commits: B4 (`49e45fb`), B3 (`f1e6984`), B2 (`1b21c1d`), B1 (`990a0a3`), B0 (`55e503d`), Fase A auth (`67ae654`), verificación en vivo (`33e2426`), flujo de compromiso (`5fa8c25`), validación (`f96a84f`), frontend y mapa (`a989f83`).
- Dependencias: `next@16.3.7`, `react@19.2.8`, `@supabase/ssr`, `@supabase/supabase-js`, `@hiero-ledger/sdk@2.89.1`, `maplibre-gl`, `zod@4`, `radix-ui`, `shadcn` (CLI en `dependencies`), `lucide-react`, `class-variance-authority`, `cn`, `tw-animate-css`, `server-only`.
- Variables esperadas (solo nombres; `.env.example` = `.env.local`): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_OPERATOR_KEY_TYPE`, `HEDERA_TOPIC_ID`, `HEDERA_MIRROR_NODE_URL`, `DEMO_ACCOUNT_PASSWORD`. `.env*` ignorado salvo `.env.example`.
- Estructura: `src/app` (15 rutas dinámicas + proxy), `src/lib/{actions,auth,data,domain,events,flow,hedera,supabase,verify}`, `src/components/{auth,common,layout,needs,panel,schools,ui,verify}`, `supabase/migrations` (5) + `seed.sql`, `scripts/` (demo, e2e, hedera, env, worker), `docs/` (AUDITORIA_B3, AUDITORIA_B4). **No hay carpeta `tests/`**: las pruebas del repo son 15 archivos `*.test.ts` unitarios.
- Lecturas de esta auditoría: `npm test` 255/255 (51 suites), typecheck OK, lint OK, build OK. Datos idénticos al cierre de B4. Hedera 11 mensajes, saldo 999,70421576 ℏ.

## B. Arquitectura actual

```
Navegador ─ Server Components / Server Actions (Next 16, Node)
              │  requireActor() → Actor desde la sesión (getClaims + profiles)
              ├─ Lecturas: lib/data (server-only) → Supabase con sesión (RLS + permisos de columnas B0/B0.1)
              │            · única excepción: readSupporterCommitments (cliente admin, filtro por actor)
              └─ Escrituras: Server Action → lib/flow (validación + dominio) → RPC flow_* (service_role,
                             transacción: guards de estado, bloqueos, evento canónico SHA-256 → outbox)
                             → publishEvent (outbox, reconciliación por contenido, 1 chunk, fee máx. 2 ℏ)
                             → Hedera HCS topic 0.0.10796342
Público: /verify/[id] → verifyEvent (13 comprobaciones) contra Mirror Node en vivo; HashScan como enlace.
```

Coherente y sin capas duplicadas: secretos solo en módulos `server-only`; dominio (permisos, máquina de estados) replicado por la base (autoridad final); DTOs con lista blanca; HCS solo con 9 campos sin texto libre.

## C. Funcionalidades existentes

| Funcionalidad | Estado | Evidencia | Riesgo |
|---|---|---|---|
| Mapa público (MapLibre + OpenFreeMap) | Hecho | `schools-map.tsx`, worker copiado en `prebuild` | Bajo (tiles externos) |
| Páginas de escuela y necesidad | Hecho | `/escuelas/[slug]`, `/necesidades/[id]` | Bajo |
| Crear necesidad (escuela) | Hecho, E2E real | B3 (#6, #8) | Bajo |
| Validar / no aprobar (admin) | Hecho, E2E real | B3 (#7; Los Robles cancelled) | Bajo |
| Comprometer apoyo (aliado) | Hecho, E2E real | B4 (#9) | Medio (doble envío por script) |
| Reportar entrega | Hecho, E2E real | B4 (#10) | Bajo |
| Confirmar recepción | Hecho, E2E real | B4 (#11) | Bajo |
| Completado automático | Hecho | La Cascada `completed` 30/30 | Bajo |
| Timeline / historial | Hecho | `buildTimeline`, `NeedTimeline` | Bajo |
| Verificación Hedera (13 checks) | Hecho | `verifyEvent`, `/verify/[id]`, `hedera:verify` (11/11 VERIFIED) | Medio (Mirror Node público, NO VERIFICADO bajo carga) |
| Mirror Node / HashScan | Hecho | `mirror.ts` (timeout 8 s), enlaces HashScan | Bajo |
| Autenticación y roles | Hecho | `/ingresar`, `requireActor`, `PANEL_PATH` | Bajo |
| Paneles aliado / escuela / admin | Hecho | B2 + acciones B3/B4 | Bajo |
| RLS + permisos de columnas | Hecho | migraciones 2, 4, 5; PGlite | Bajo |
| Privacidad (DTOs, HCS) | Hecho | escaneos HTML/RSC 0 coincidencias; bundle limpio | Bajo |
| Cuentas DEMO | Hecho | `demo:accounts` (5 cuentas, 1 aliado) | Bajo |
| Estados inválidos / errores | Hecho | guards + `flowErrorMessage` + `panel/error.tsx` | Bajo |
| Responsive | Hecho | capturas 375 px / desktop sin desbordamiento | Bajo |
| Documentación | Parcial | README (seguridad, deuda), auditorías B3/B4; sin guía de demo ni de despliegue | Medio |
| Tests en el repo | Parcial | 255 unitarios; **las regresiones HTTP/E2E/PGlite viven fuera del repo** | Alto |
| Despliegue (Vercel) | NO VERIFICADO | nunca desplegado; sin `maxDuration` | Alto (si la demo usa URL pública) |

## D. Funcionalidades faltantes (todas fuera del flujo aprobado o pospuestas por decisión)

Registro de usuarios, recuperación de contraseña, notificaciones, notas de compromiso/entrega (D3), evidencia fotográfica (D7), cancelar compromisos, motivo de rechazo, editar necesidades, **reintento de publicación desde la UI** (D4/D6), volver al destino tras iniciar sesión (D2).

## E. Flujo completo auditado

`NEED_CREATED → NEED_VALIDATED → COMMITMENT_CREATED → DELIVERY_REPORTED → SCHOOL_CONFIRMED → completed`: sin discontinuidades; las cinco acciones existen en la UI y se ejecutaron en real (eventos #6–#11).
- Transiciones inválidas: bloqueadas en dominio, trigger y RPC (incluido `committed → confirmed`).
- Duplicados: índices únicos por (necesidad, tipo) y (compromiso, tipo); `DUPLICATE_EVENT`. Excepción conocida: dos compromisos distintos por doble POST (D5, mitigado en UI).
- Concurrencia: bloqueos `for update` (necesidad → compromiso).
- Estados terminales: `completed` y `cancelled` no aceptan compromisos (`NEED_NOT_OPEN`); al completarse no quedan compromisos abiertos.
- HCS falla: el paso queda guardado y el evento `pending`/`failed`; la UI dice "pendiente". **Sin reintento desde la UI** (solo scripts e2e del paso concreto).
- Mirror Node lento: `/verify` muestra `AWAITING_MIRROR` / `UNAVAILABLE` sin afirmar nada.

## F. Estado Hedera

Topic `0.0.10796342`, 11 mensajes (#1–#11), todos `{hash, payload}` con los 9 campos, 11/11 VERIFIED. Publicador: 1 chunk máximo (`setMaxChunks(1)`, ~370–409 bytes), fee máximo 2 ℏ (`MAX_FEE_HBAR`), coste real ≈ 0,0034–0,0037 ℏ/mensaje; outbox con `transaction_id` registrado antes de enviar, reconciliación por contenido y reenvío solo tras 180 s. Saldo 999,70421576 ℏ (suficiente para cientos de miles de mensajes).

## G. Privacidad

Sin hallazgos nuevos de exposición en páginas, DTOs, acciones ni bundle (verificado en B2–B4). Hallazgos menores:
- `/api/health` devuelve `error.message` de Supabase en caso de error (información técnica pública; sin secretos).
- Los errores inesperados de las acciones no se registran en el servidor (diagnóstico difícil; no es una fuga).
- `confirmed_by` / `supporter_id` solo legibles con `service_role`; HCS sin datos personales.

## H. UX / demo

Recorrido actual: portada (mapa + "Un caso de principio a fin", que ahora muestra **La Cascada completada**) → escuela → necesidad (historial + "Ver verificación") → "Quiero apoyar" → panel. Datos: El Mirador (activo, 15 disponibles), La Cascada (completado), Los Robles (no aprobado): cubren caso activo, completado y rechazado.
Puntos débiles para una demo en vivo:
- latencia de 4–18 s por acción (hay mensaje de espera, pero se percibe);
- tras reportar/confirmar, la tarjeta se actualiza solo al recargar;
- "Quiero apoyar" visible aunque no quede disponible;
- tras iniciar sesión se llega al panel, no a la acción;
- una demo en vivo del ciclo completo necesita una necesidad nueva (escribe datos y +5 mensajes HCS) o usar El Mirador (que se ha mantenido intacto);
- no hay guion/guía de demo documentado.

## I. Preparación para despliegue (Vercel) — NO VERIFICADO en producción

- Build OK; todas las rutas dinámicas (Node). `proxy.ts` (sesión). Worker de MapLibre generado en `prebuild` (se ejecuta en Vercel con `npm run build`).
- `serverExternalPackages: ["@hiero-ledger/sdk"]` (gRPC en Node serverless: NO VERIFICADO).
- Sin `maxDuration`: las páginas con acciones que publican (`/panel/aliado`, `/panel/aliado/apoyar/[needId]`, `/panel/escuela`, `/panel/escuela/necesidades/nueva`, `/panel/admin/necesidades/[id]`) dependen del límite por defecto de la plataforma (NO VERIFICADO); acciones observadas de 4 a 18 s.
- `NEXT_PUBLIC_SITE_URL` debe configurarse (por defecto `http://localhost:3000` → `metadataBase`).
- Variables de servidor (secret key, operador Hedera) deben configurarse solo como variables de servidor.

## J–M. Riesgos

**CRÍTICO:** ninguno.

**ALTO**
1. *Regresiones fuera del repo.* Evidencia: HTTP (B1–B4), acciones con dobles, PGlite y E2E viven en el scratchpad de la sesión. Impacto: no se pueden repetir en otra sesión, por el equipo ni en CI; las expectativas dependen del estado DEMO. Probabilidad: segura en cuanto termine la sesión. Afecta demo (confianza antes de presentar) e integridad (detección de regresiones); no afecta seguridad ni Hedera. Solución: versionarlas en el repo como suites READ-ONLY. **Entra en B5.**
2. *Despliegue no verificado.* Evidencia: sin despliegue previo; sin `maxDuration`; SDK gRPC en serverless sin probar. Impacto: si la demo usa URL pública, acciones con timeout o publicación fallida. Probabilidad: desconocida (NO VERIFICADO). Afecta demo y Hedera (eventos pendientes). Solución: `maxDuration` en las páginas con acciones, variables de entorno, despliegue de prueba y smoke test read-only. **Entra en B5** (el despliegue real con autorización aparte).

**MEDIO**
3. *Sin reintento de publicación en la UI.* Un fallo de red en la demo deja un evento `pending` sin forma de publicarlo desde la app. Solución: acción admin "Reintentar publicación" sobre eventos existentes con `publishEvent` (idempotente). Afecta demo/Hedera. **Opcional B5.**
4. *Documentación desactualizada / sin guía de demo.* README (estructura "fase 2", sin flujo completo, sin despliegue). **Entra en B5** (solo docs).
5. *Errores inesperados sin registro en el servidor* (acciones). Diagnóstico durante la demo. **Opcional B5.**
6. *`/api/health` expone `error.message`.* Información técnica pública. **Opcional B5** (cambio mínimo).
7. *Latencia de acciones* (4–18 s). Afecta percepción de la demo; el diseño síncrono está aprobado (D4). Fuera de B5 cambiarlo; mitigar con guion de demo.
8. *Mirror Node público* bajo carga o caído: `/verify` lo indica (UNAVAILABLE). NO VERIFICADO bajo carga. Mitigación: guion con enlace a HashScan.

**BAJO**
9. "Quiero apoyar" con disponible 0 (la página lo explica). Opcional.
10. Login sin retorno al destino (toca auth). Fuera de B5.
11. Tarjeta/lista sin actualizar hasta recargar tras reportar/confirmar (diseño aprobado). Opcional.
12. CSRF responde 500 (comportamiento de Next). Fuera.
13. `shadcn` (CLI) en `dependencies` en lugar de `devDependencies` (toca `package.json`). Fuera de B5.
14. Un solo aliado DEMO (aislamiento entre aliados probado en PGlite/dobles). Fuera.
15. Página pública de una necesidad pendiente visible para su escuela/admin (RLS por diseño). Fuera.

## N. B5 imprescindible

| Propuesta | Problema | Por qué importa | Archivos probables | DB | Hedera | Migraciones | Datos DEMO | Riesgo | Prueba |
|---|---|---|---|---|---|---|---|---|---|
| **N1. Regresiones READ-ONLY en el repo** | Las suites viven fuera del repo | Confianza repetible antes de la demo y del despliegue | `scripts/regression/*` (HTTP B1–B4, acciones con dobles), `package.json` (scripts; y devDependency `@electric-sql/pglite` si se incluye PGlite) | No | No | No | No | Bajo (no toca producción); `package.json` requiere autorización | Ejecutarlas en limpio y comprobar datos/Hedera sin cambios |
| **N2. Preparación de despliegue** | Sin `maxDuration`, entorno sin documentar, sin smoke test | La demo puede usar URL pública | `export const maxDuration` en las 5 páginas con acciones; `docs/DEPLOY.md`; (opcional) `/api/health` sin `error.message` | No | No (smoke test sin escrituras) | No | No | Bajo | Build; despliegue de prueba y smoke read-only (autorización aparte) |
| **N3. Guía de demo y README** | Sin guion ni documentación del flujo final | El jurado y el equipo necesitan un recorrido claro | `docs/DEMO.md`, `README.md` (estructura, flujo, roles, verificación) | No | No | No | No | Nulo | Revisión de texto; enlaces comprobados |

## O. B5 opcional

| Propuesta | Problema | Archivos probables | DB | Hedera | Riesgo |
|---|---|---|---|---|---|
| O1. Reintento de publicación (admin) | Eventos `pending`/`failed` sin salida en la UI | `src/app/panel/admin/actions.ts`, componente nuevo, lectura de eventos no publicados (B1 o consulta nueva) | No | Sí, solo reintenta eventos existentes (sin tipos nuevos) | Medio (escribe en Hedera; requiere E2E propio) |
| O2. Registro de errores inesperados | Diagnóstico | acciones (`console.error` en el `catch`) | No | No | Bajo |
| O3. Ocultar "Quiero apoyar" sin disponible | Claridad | `src/app/necesidades/[id]/page.tsx` | No | No | Bajo |
| O4. Refresco tras reportar/confirmar | Estado visible inmediato | botones B4 / acciones | No | No | Bajo-medio (revisar el mensaje de resultado) |

## P. Fuera de B5

Tokens, NFTs, smart contracts, HTS, pagos, wallets, evidencia fotográfica, notas, notificaciones, registro de usuarios, recuperación de contraseña, cancelación de compromisos, motivo de rechazo, edición de necesidades, nuevos tipos de evento HCS, publicación asíncrona/colas, cambios en auth (retorno tras login), cambios de dependencias no imprescindibles.

## Q. Archivos potencialmente afectados (si se aprueban N1–N3)

`scripts/regression/*` (nuevos), `package.json` (scripts y, si se decide, devDependency PGlite), 5 páginas con `maxDuration` (`src/app/panel/aliado/page.tsx`, `src/app/panel/aliado/apoyar/[needId]/page.tsx`, `src/app/panel/escuela/page.tsx`, `src/app/panel/escuela/necesidades/nueva/page.tsx`, `src/app/panel/admin/necesidades/[id]/page.tsx`), `docs/DEMO.md`, `docs/DEPLOY.md`, `README.md`; opcional `src/app/api/health/route.ts`.

## R. Cambios de base de datos

Ninguno (sin tablas, columnas, migraciones, RLS, RPC ni vistas).

## S. Cambios en Hedera

Ninguno para N1–N3. Solo O1 publicaría (reintentos de eventos ya registrados). Una demo en vivo del ciclo completo añadiría mensajes reales (decisión de demo, no de código).

## T. Pruebas recomendadas

`npm test`, typecheck, lint, build; suites versionadas (B1 61, B2 84, B3 20, B3 acciones 45, B4 HTTP 38, B4 acciones 48, público/verify 31, PGlite 74); escaneo de bundle; comprobación de datos (3/2/11/3/5) y Hedera (11 mensajes) antes y después; tras un despliegue: smoke read-only (portada, escuela, necesidad, `/verify` de los 11 eventos, login y paneles sin acciones).

## U. Qué NO tocar

Migraciones, RLS, esquema, `src/lib/flow`, `src/lib/hedera`, `src/lib/verify`, `src/lib/events`, `src/lib/domain`, `src/lib/data`, auth, topic, credenciales, `.env*`, datos DEMO (El Mirador, La Cascada, Los Robles), lockfile (salvo lo que exija N1 con autorización).

## V. Recomendación de alcance B5

B5 = **consolidación para la demo, sin funcionalidad nueva de negocio**: N1 (regresiones READ-ONLY versionadas), N2 (preparación de despliegue + smoke test con autorización aparte) y N3 (guía de demo y README). Opcionales a decidir: O1 (reintento de publicación) por su valor ante fallos en vivo, y O2/O3 por su bajo coste. Sin cambios de base de datos, sin nuevos eventos HCS y sin nuevos datos DEMO.

### Decisiones para autorizar
| # | Decisión |
|---|---|
| D1 | Alcance: N1 + N2 + N3 (y cuáles de O1–O4) |
| D2 | Incluir PGlite en el repo (devDependency, modifica `package.json`/lockfile) o dejar las pruebas PGlite fuera |
| D3 | Despliegue real en Vercel (autorización aparte; variables configuradas por el equipo) |
| D4 | O1 reintento de publicación: sí/no (implica E2E propio con Hedera) |
| D5 | Demo en vivo: crear una necesidad nueva durante la presentación (escribe datos y mensajes) o recorrer solo los casos existentes |

**LISTO PARA DECISIÓN DE B5**
