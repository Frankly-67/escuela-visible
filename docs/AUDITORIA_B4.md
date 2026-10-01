# Auditoría B4 — Acciones de apoyo: compromiso, entrega y confirmación (solo lectura)

Fecha: 2026-10-01 · Base: `f1e6984 feat: add need creation and admin review actions`
Estado al auditar: working tree limpio · Supabase 3 needs / 1 commitment / 8 hedera_events / 3 schools / 5 profiles / 5 migraciones · Hedera topic `0.0.10796342` con 8 mensajes (último `1790870325.771499505`), saldo 999,71520695 ℏ.
Esta auditoría no modificó código, datos, Supabase ni Hedera. Este archivo es el único cambio.

---

## 1. Estado actual del flujo (lo que YA existe)

| Capa | create commitment | report delivery | confirm receipt |
|---|---|---|---|
| Base de datos (RPC, solo `service_role`) | `flow_create_commitment` | `flow_report_delivery` | `flow_confirm_receipt` |
| Guards (triggers, aplican a toda escritura) | INSERT solo en `committed` | `committed → delivery_reported` | `delivery_reported → confirmed` |
| Anti-duplicados | — | índice único (`commitment_id`, `event_type`) | ídem |
| Bloqueos | `needs … for update` (serializa compromisos) | necesidad → compromiso `for update` | necesidad → compromiso `for update` |
| Dominio (`permissions.ts`) | `authorizeCreateCommitment` | `authorizeReportDelivery` | `authorizeConfirmReceipt` |
| Flow TS (`src/lib/flow/commitments.ts`) | `createCommitment` | `reportDelivery` | `confirmReceipt` (devuelve `needCompleted`) |
| Schemas (`schemas.ts`) | `createCommitmentInputSchema` | `reportDeliveryInputSchema` | `confirmReceiptInputSchema` |
| Evento HCS | COMMITMENT_CREATED | DELIVERY_REPORTED | SCHOOL_CONFIRMED |
| Publicación | `publishEvent` (outbox) — igual que B3 | ídem | ídem |
| Tests unitarios | `permissions.test.ts`, `state-machine.test.ts`, `schemas.test.ts` | ídem | ídem |
| PGlite (`phase2`, 74 checks) | rol, necesidad no abierta, 0 / 3 decimales, excede disponible, completada/cancelada | dueño, admin, reportar dos veces | supporter, admin, otra escuela, sin reporte, confirmar dos veces, completed automático |
| Script real | `e2e:commitment --step commit` (usado para el caso El Mirador) | `--step report` | `--step confirm` |
| Lectura para paneles (B1) | — | `getSupporterPanel()` (estado + eventos de cada compromiso) | `getSchoolPanel().pendingDeliveries` (con `commitmentId`) |
| UI (B2) | — | tarjeta del compromiso, sin acción | lista "Entregas reportadas por confirmar", sin acción |
| Verificación | `/verify/[id]`, `buildTimeline`, `ConfirmationHighlight`, `NeedProgressBars` ya muestran los 3 tipos (caso El Mirador, registros 3–5) | | |

**Conclusión:** toda la lógica, la base de datos y la verificación existen y están probadas. **Lo único que falta es la interfaz**: Server Actions, formularios/botones y su manejo de resultados. Es el mismo hueco que B3 cerró para necesidades.

## 2. Objetivo exacto de B4

Exponer en la interfaz las tres acciones ya implementadas, con el patrón probado en B3 (`requireActor` dentro de cada acción → función de flow existente → `publishEvent` → resultado honesto).

| Rol | Puede hacer en B4 |
|---|---|
| SUPPORTER | Comprometerse con una necesidad publicada (cantidad ≤ disponible). Reportar la entrega de **sus** compromisos en `committed`. |
| SCHOOL_REP | Confirmar la recepción de entregas reportadas **de su escuela**. |
| ADMIN | Nada nuevo: solo lectura (contadores, publicación y actividad ya existen). |
| PUBLIC | Nada nuevo que hacer: ve el progreso actualizado, el historial y `/verify` de los nuevos eventos (ya existente). |

Completa la segunda mitad del flujo aprobado: publicada → compromiso → entrega reportada → recepción confirmada (SCHOOL_CONFIRMED) → verificación pública.

## 3. Alcance

**Imprescindible**
- `createCommitmentAction`, `reportDeliveryAction` (supporter) y `confirmReceiptAction` (school_rep).
- Página de compromiso para el aliado (formulario de cantidad) con el disponible calculado.
- Botón "Reportar entrega" en cada compromiso `committed` del panel del aliado, con confirmación.
- Botón "Confirmar recepción" en cada entrega reportada del panel de la escuela, con confirmación.
- Mensajes honestos: reportar NO es recibir; solo la confirmación de la escuela cuenta; publicación pendiente si no termina; "la necesidad se completó" cuando `needCompleted`.
- Un punto de entrada para que el aliado llegue al formulario (ver decisión D2).
- Tests (unit, acciones con dobles, HTTP sin escrituras, regresiones) + E2E real con autorización aparte.

**Opcional**
- Mostrar al aliado en su panel una lista de "Necesidades abiertas" (alternativa al enlace en la página pública; ver D2).
- Volver al formulario tras iniciar sesión (hoy `/ingresar` siempre lleva a `/panel`; tocaría auth → no recomendado en B4).

**No hacer todavía**
- Notas de compromiso (`note`) y de entrega (`delivery_note`): no se recogen (se envían `null`), decisión pendiente desde B0 (README).
- Evidencia fotográfica (`delivery_evidence_path`, bucket `evidence`).
- Cancelar compromisos (no hay transición ni RPC).
- Editar cantidades, regla "un compromiso por aliado y necesidad", reintento de publicación, notificaciones.
- Pagos reales, cripto, tokens, NFTs, smart contracts, datos de menores, cualquier funcionalidad fuera del flujo aprobado.

## 4. Archivos

**Crear**
| Archivo | Propósito |
|---|---|
| `src/app/panel/aliado/actions.ts` | `createCommitmentAction`, `reportDeliveryAction` (`"use server"`, `requireActor(['supporter'])`). |
| `src/app/panel/aliado/apoyar/[needId]/page.tsx` | Formulario de compromiso (Server Component): lee la necesidad con `getNeed` (público, RLS) y muestra meta, comprometido y disponible. |
| `src/components/panel/commitment-form.tsx` | Client Component: cantidad + envío (`useActionState`); se reemplaza por el resultado tras éxito. |
| `src/components/panel/report-delivery-button.tsx` | Client Component: "Reportar entrega" con confirmación. |
| `src/components/panel/confirm-receipt-button.tsx` | Client Component: "Confirmar recepción" con confirmación. |

**Modificar**
| Archivo | Propósito |
|---|---|
| `src/app/panel/escuela/actions.ts` (B3) | Añadir `confirmReceiptAction` (`requireActor(['school_rep'])`). |
| `src/lib/actions/flow-result.ts` (+ `.test.ts`) | Estados de resultado de las 3 acciones; parseo de cantidad (ya existe `parseQuantity`). |
| `src/components/panel/commitment-card.tsx` (B2) | Mostrar `ReportDeliveryButton` solo si `status = committed`. |
| `src/app/panel/aliado/page.tsx` (B2) | Quitar "Reportar entregas se habilitará…"; enlace para apoyar. |
| `src/app/panel/escuela/page.tsx` (B2/B3) | `ConfirmReceiptButton` en cada entrega pendiente; quitar "La confirmación se habilitará…". |
| `src/app/necesidades/[id]/page.tsx` (**pública**, solo si D2 = A) | Enlace "Quiero apoyar" → `/panel/aliado/apoyar/[id]` cuando la necesidad está `published`. |

**No tocar**
| Capa | ¿B4 la necesita? |
|---|---|
| `src/lib/flow/` | **No.** Las tres funciones existen y están probadas. |
| `src/lib/hedera/` | **No.** `publishEvent` se usa tal cual. |
| `src/lib/verify/` | **No.** Los 3 tipos ya se verifican (registros 3–5). |
| `src/lib/data/` (B1) | **No.** `getSupporterPanel`, `getSchoolPanel.pendingDeliveries` y `getNeed` dan todo lo necesario. |
| `src/lib/domain/` | **No.** Reglas, estados y etiquetas (`COMMITMENT_STATUS_LABEL`) existen. |
| `src/lib/events/` | **No.** |
| auth (`src/lib/auth`, `/ingresar`, `proxy.ts`) | **No.** |
| `supabase/` | **No.** |
| `package.json`, `.env*` | **No.** |
| Páginas públicas | Solo `src/app/necesidades/[id]/page.tsx` y solo si D2 = A. `/verify`, portada y escuelas: no. |

## 5. Base de datos

B4 **no necesita**: tablas, columnas, migraciones, cambios de RLS, RPC nuevas, cambios en RPC, vistas ni permisos.
Todo existe en `20260929000300_phase2_flow.sql` (RPC, guards, índices únicos, bloqueos) y en las vistas `need_progress` / `impact_feed`. Las lecturas de B4 usan columnas ya concedidas (B0/B0.1).

## 6. Estados y transiciones

| Transición | Actor | Condiciones (TS y RPC) | RPC | Función TS | Evento | Si Hedera falla |
|---|---|---|---|---|---|---|
| (nuevo) → `committed` | supporter | necesidad `published`; cantidad > 0, ≤ 2 decimales, ≤ disponible (meta − comprometido no cancelado) | `flow_create_commitment` | `createCommitment` | COMMITMENT_CREATED | El compromiso queda creado; evento `pending`/`failed` en el outbox; la UI dice "publicación pendiente". |
| `committed → delivery_reported` | el **mismo** supporter | dueño del compromiso; necesidad `published`; estado `committed` | `flow_report_delivery` | `reportDelivery` | DELIVERY_REPORTED | Ídem. |
| `delivery_reported → confirmed` | school_rep **de la escuela de la necesidad** | escuela del actor = escuela de la necesidad; necesidad `published`; estado `delivery_reported` | `flow_confirm_receipt` | `confirmReceipt` | SCHOOL_CONFIRMED (+ `completed` si confirmado ≥ meta, sin evento propio) | Ídem; la necesidad puede quedar `completed` con su último evento pendiente de publicación (la UI lo muestra como pendiente). |

Comprobado en código y pruebas:
- **`committed → confirmed` NO está permitido**: `COMMITMENT_TRANSITIONS`, trigger `enforce_commitment_status` y RPC (`INVALID_TRANSITION`, "El aliado todavía no ha reportado la entrega."). Tests: `state-machine.test.ts` y PGlite.
- Supporter solo reporta **su** compromiso: `ownsCommitment` + RPC (`NOT_COMMITMENT_OWNER`).
- School_rep solo confirma compromisos **de su escuela**: `isSchoolRepOf` + RPC (`NOT_SCHOOL_MEMBER`).
- Supporter no puede confirmar (ni el propio): `FORBIDDEN_ROLE`.
- Otra escuela no puede confirmar: `NOT_SCHOOL_MEMBER`.
- **Admin no tiene atajo**: `FORBIDDEN_ROLE` en crear, reportar y confirmar (TS y RPC). El código actual no permite ninguna excepción.
- Necesidad `completed`/`cancelled`/`pending_validation` no acepta compromisos (`NEED_NOT_OPEN`).
- Al completarse una necesidad no quedan compromisos abiertos: lo comprometido nunca supera la meta, así que confirmado ≥ meta implica que todos los compromisos activos están confirmados.

## 7. Hedera

B4 usa exactamente los tres tipos ya existentes (enum `hedera_event_type`, `buildEvent`, `flow_insert_event`). Sin tipos nuevos.

Payload canónico (9 campos, orden canónico, SHA-256 sobre el JSON canónico UTF-8). Mensaje HCS = `{hash, payload}`, una sola parte (máx. 1024 bytes):

| Campo | COMMITMENT_CREATED | DELIVERY_REPORTED | SCHOOL_CONFIRMED |
|---|---|---|---|
| `v` | 1 | 1 | 1 |
| `app` | `escuela-visible` | ídem | ídem |
| `eventId` | UUID nuevo | UUID nuevo | UUID nuevo |
| `type` | `COMMITMENT_CREATED` | `DELIVERY_REPORTED` | `SCHOOL_CONFIRMED` |
| `needId` | id de la necesidad | ídem | ídem |
| `schoolId` | escuela leída de la base | ídem | ídem |
| `commitmentId` | id del compromiso | ídem | ídem |
| `actorRole` | `supporter` | `supporter` | `school_rep` |
| `timestamp` | ISO UTC con ms (±10 min de `now()`, validado en la RPC) | ídem | ídem |
| Tamaño real observado | 409 bytes (registro 3) | 408 bytes (registro 4) | 408 bytes (registro 5) |

**No contiene**: cantidad, notas, evidencia, `supporter_id`, `confirmed_by`, nombres, emails ni texto libre. `flow_insert_event` rechaza cualquier payload con otros campos o que no coincida con la operación (`INVALID_EVENT`).

## 8. Verificación

Sin cambios de código:
- `/verify/[id]`: 13 comprobaciones contra el Mirror Node (ya verificadas para los tres tipos en El Mirador).
- Historial (`buildTimeline`): "Un aliado se comprometió a apoyar con N", "El aliado informó que realizó la entrega de N", "La escuela confirmó la recepción de N", cada uno con "Registro n.º X en Hedera" y "Ver verificación".
- Página pública de la necesidad: barras "Comprometido" y "Confirmado por la escuela" y el bloque `ConfirmationHighlight` tras SCHOOL_CONFIRMED.
- HashScan / Mirror Node: los enlaces existentes (`hedera:verify`, `/verify`).
- Visibilidad: eventos de necesidades `published`/`completed` son públicos (RLS existente).

## 9. Privacidad

- `supporter_id`, `confirmed_by`, `note`, `delivery_note`, `delivery_evidence_path`: sin `SELECT` para `anon`/`authenticated` (B0); B4 no los lee ni los muestra. El aliado aparece siempre como "Un aliado".
- La escuela ve "Entrega reportada por un aliado", nunca quién.
- Notas: B4 no las recoge (se envían `null`), así no hay texto libre nuevo.
- Las acciones devuelven solo mensajes, `eventId` y como máximo `needCompleted`; nunca ids de personas, emails ni errores internos (mapeo de B3).
- Client Components nuevos: solo importan Server Actions, `Button`, `Link`, `labels` y `flow-result` (puro). No importan Supabase, `lib/data`, `lib/hedera`, `lib/flow` (salvo tipos), `lib/auth` ni secretos; `server-only` impide el resto en build.
- Datos de menores: B4 no añade texto libre ni campos personales.

## 10. UX

**Supporter**
- Ve las necesidades publicadas en las páginas públicas (`/`, `/escuelas/[slug]`, `/necesidades/[id]`).
- Desde la necesidad: "Quiero apoyar" → `/panel/aliado/apoyar/[needId]` (D2). Si no hay sesión → `/ingresar` (después llega a su panel; ver riesgos).
- Formulario: necesidad, escuela (DEMO), meta, comprometido, **disponible**; campo cantidad ("20", "1,5"); aviso: "Comprometerte no es entregar: después deberás reportar la entrega y la escuela la confirmará".
- Tras enviar: "Compromiso registrado…" + publicación (publicado/pendiente) + enlaces a su panel y a la verificación. El formulario se reemplaza por el resultado.
- En su panel, cada compromiso `committed` muestra "Reportar entrega" → confirmación ("¿Confirmas que ya realizaste la entrega? La escuela deberá confirmarla") → "Entrega reportada. Esperando confirmación de la escuela."

**School**
- En su panel, "Entregas reportadas por confirmar" (ya existe) con "Confirmar recepción" → confirmación ("¿Confirmas que la escuela recibió N unidades?") → "Recepción confirmada…" y, si aplica, "La necesidad alcanzó su meta y quedó completada."

**Admin**
- Solo lectura: contadores, publicación (8 → 11 tras el E2E) y actividad reciente. Sin acciones nuevas.

**Public**
- Ve el progreso (comprometido / confirmado por la escuela), el historial con los nuevos pasos y "Ver verificación". Nunca ve quién apoyó ni notas.

## 11. Cantidades

Reglas existentes (sin cambios):
- cantidad > 0 y máximo 2 decimales (`createCommitmentInputSchema`, `checkCommitmentQuantity`, `flow_assert_quantity`);
- no superar lo disponible = meta − suma de compromisos no cancelados (TS en centésimas enteras; RPC con bloqueo);
- `committed_quantity` = suma no cancelada; `confirmed_quantity` = suma confirmada (`need_progress`);
- `completed` automático cuando confirmado ≥ meta (`flow_confirm_receipt`).

B4 solo reutiliza estas reglas. El formulario convierte "1,5" → 1.5 con el `parseQuantity` de B3 (formato, no regla nueva).

## 12. Concurrencia

| Caso | Protección existente | UI |
|---|---|---|
| Dos supporters comprometen lo restante a la vez | `select … for update` de la necesidad serializa; el segundo recalcula y recibe `QUANTITY_EXCEEDS_AVAILABLE` | Mostrar el mensaje con el disponible actual. |
| Doble envío del formulario de compromiso | **No hay idempotencia**: dos envíos válidos crean dos compromisos (limitados por el disponible) | Botón deshabilitado mientras envía y formulario reemplazado tras éxito (como B3). |
| Reportar dos veces | Bloqueo + estado (`INVALID_TRANSITION`) + índice único (`DUPLICATE_EVENT`) | Botón solo en `committed`; deshabilitado al enviar. |
| Confirmar dos veces (dos pestañas / dos personas de la escuela) | Bloqueo + estado + índice único | Botón solo en entregas pendientes; mensaje de negocio si perdió la carrera. |
| Escuela confirma compromiso de otra escuela | `authorizeConfirmReceipt` + RPC (`NOT_SCHOOL_MEMBER`); además el panel solo lista sus entregas | — |

## 13. E2E real propuesto (NO ejecutado)

Datos: necesidad **La Cascada** `67c4425c-0622-4cd4-9306-b055da760f19` (published, meta 30 refrigerios, 0 comprometido). El Mirador no se toca. Usuario aliado DEMO (único supporter) y representante de La Cascada. Interfaz real (Edge headless + Server Actions reales), un paso por ejecución, con comprobación entre pasos (como B3).

| # | Estado inicial | Actor | Acción | Estado esperado | Evento | Mensaje HCS esperado | Verificación |
|---|---|---|---|---|---|---|---|
| 1 | necesidad published, 0/30 | aliado | comprometer **Q** (D8) | compromiso `committed`; comprometido Q | COMMITMENT_CREATED | registro 9 | `hedera:verify` 13/13, bytes = BD |
| 2 | compromiso `committed` | aliado | reportar entrega | `delivery_reported` | DELIVERY_REPORTED | registro 10 | 13/13 |
| 3 | `delivery_reported` | rep. La Cascada | confirmar recepción | `confirmed`; necesidad `completed` si Q = 30 (si no, sigue published) | SCHOOL_CONFIRMED | registro 11 | 13/13; página pública con `ConfirmationHighlight` |

Después: topic 8 → **11**; Supabase 3 needs / **2** commitments / **11** events; El Mirador idéntico (md5); Los Robles intacto; páginas públicas, paneles y `/verify` de los 3 eventos.

## 14. Plan de pruebas

- **Unit:** mapeo de resultados (compromiso / entrega / confirmación, publicado/pendiente, `needCompleted`), parseo de cantidad del formulario, mensajes sin "verificado" ni afirmaciones de entrega por Hedera.
- **Acciones con dobles (sin escrituras):** cada acción con su rol real (sesiones DEMO), flow real y RPC registrada: roles incorrectos → redirección; supporter ajeno → `NOT_COMMITMENT_OWNER`; otra escuela → `NOT_SCHOOL_MEMBER`; admin → redirección; `committed → confirmed` → `INVALID_TRANSITION`; cantidad > disponible; `needId`/`commitmentId` inválidos; `publishEvent` fallido/excepción → "pendiente"; errores internos → genérico; IDs del formulario (supporterId, schoolId) ignorados.
- **PGlite:** repetir `phase2` (74) y `phaseB1` (aislamiento de compromisos entre aliados).
- **HTTP sin escrituras:** página de compromiso por rol; formulario sin campos de identidad; POST sin sesión / rol incorrecto / origen ajeno (CSRF) / cantidad inválida → sin escritura; botones solo en los estados correctos (hoy: compromiso de El Mirador `confirmed` → sin botón de reportar; ninguna entrega pendiente → sin botón de confirmar).
- **Concurrencia:** cubierta por bloqueos en BD; prueba en PGlite de dos compromisos que exceden lo disponible (si se autoriza ampliar el script local).
- **Privacidad:** escaneo de HTML completo (incl. payload RSC) de todas las páginas nuevas y modificadas.
- **Regresión:** `npm test`, typecheck, lint, build; B1, B2 HTTP, B3 HTTP, acciones B3, páginas públicas y `/verify` (8 eventos, 13/13); bundle (secretos, `createAdminClient`, `publishEvent`, `hiero-ledger`, `flow_*`).
- **Hedera:** antes/después de cada fase: número de mensajes y saldo; sin mensajes fuera del E2E autorizado.

## 15. Riesgos

1. **Doble compromiso** (doble envío): sin idempotencia en BD; mitigación en UI. Añadir una regla "un compromiso por aliado y necesidad" sería **regla de negocio nueva** (no aprobada).
2. **Sobrecompromiso:** cubierto por bloqueo + recálculo en la RPC.
3. **Confirmación indebida / bypass:** doble capa (TS + RPC); `requireActor` en cada acción; tests de roles.
4. **Filtración de `supporter_id` / `confirmed_by` / notas:** no legibles por la sesión (B0); las acciones no los devuelven; escaneos de privacidad.
5. **Errores internos expuestos:** mapeo de B3 (`flowErrorMessage`).
6. **Publicación HCS duplicada:** outbox con reconciliación por contenido; índice único por (compromiso, tipo).
7. **Timeout de la Server Action** (2–8 s observados en B3): revisar `maxDuration` al desplegar.
8. **Estados con publicación pendiente:** la necesidad puede quedar `completed` con SCHOOL_CONFIRMED pendiente; sin UI de reintento (D6).
9. **Completada incorrectamente:** imposible por diseño (confirmado ≥ meta en la RPC, con bloqueo).
10. **Regresiones:** `commitment-card` y `escuela/page` cambian; `/verify` no se toca. Tras el E2E, las expectativas de B2/B3/B1 deberán actualizarse (2 compromisos, 11 eventos, La Cascada completada si Q = 30).
11. **Enlace "Quiero apoyar" en la página pública** (D2 = A): visible para cualquiera; sin sesión lleva a `/ingresar`, y tras iniciar sesión el aliado llega a su panel, no al formulario (cambiar eso tocaría auth).
12. **Un solo aliado DEMO:** el aislamiento entre aliados con datos reales no se puede probar sin crear cuentas; se cubre con PGlite y dobles.
13. **Disponible desactualizado** entre mostrar el formulario y enviar: la RPC recalcula y responde `QUANTITY_EXCEEDS_AVAILABLE`.

## 16. Hedera y E2E real (conceptual)

- Caso completo: +3 mensajes (COMMITMENT_CREATED, DELIVERY_REPORTED, SCHOOL_CONFIRMED) → topic de 8 a **11**.
- Coste observado en B3: ≈ 0,0034 ℏ por mensaje → ≈ 0,010 ℏ (saldo ≈ 999,705 ℏ).
- `completed` no genera mensaje. Sin mensajes de rechazo ni cancelación.

## 17. Demo del hackathon

- **Lo que ve el jurado:** un aliado se compromete desde la interfaz, informa la entrega, la escuela confirma y la necesidad avanza (o se completa) con su historial verificable paso a paso.
- **Técnicamente:** el ciclo completo, de punta a punta, registrado y comprobado en vivo contra el Mirror Node (13/13), con el mismo outbox y la misma verificación por evento.
- **Trazabilidad:** distingue "entrega reportada" (aliado) de "recepción confirmada" (escuela); Hedera prueba que la plataforma registró cada paso, no que la ayuda ocurrió.
- **Mayor riesgo:** la latencia de publicación en vivo (varios segundos por paso) y el doble envío del compromiso.

## 18. Decisiones para autorizar

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Alcance B4 | 3 acciones (comprometer, reportar, confirmar); admin solo lectura | Sí |
| D2 | Punto de entrada para comprometerse | **A)** enlace "Quiero apoyar" en `src/app/necesidades/[id]/page.tsx` (página pública) · **B)** lista "Necesidades abiertas" en el panel del aliado (requiere una lectura nueva: función en B1 o varias consultas de `public.ts`) | A (cambio mínimo; no toca B1) |
| D3 | Notas (`note`, `delivery_note`) | no recogerlas (null) · recogerlas | No recogerlas |
| D4 | Publicación en Hedera | síncrona en la acción (como B3) | Sí |
| D5 | Doble compromiso | mitigación solo en UI · regla nueva "un compromiso por aliado y necesidad" | Solo UI (sin reglas nuevas) |
| D6 | Reintento de publicación | fuera de B4 | Fuera |
| D7 | Evidencia fotográfica | fuera de B4 | Fuera |
| D8 | E2E real | autorización aparte; La Cascada; **Q = 30** (completa la necesidad, demuestra `completed`) o **Q parcial** (p. ej. 10; la necesidad sigue abierta) | Autorización aparte; Q a decidir |
| D9 | Archivos de fases anteriores a modificar | `escuela/actions.ts`, `flow-result.ts`(+test), `commitment-card.tsx`, `aliado/page.tsx`, `escuela/page.tsx` | Autorizar |
| D10 | Cambios de base de datos | ninguno | Ninguno |

## 19. Gate

**LISTO PARA AUTORIZACIÓN**

### Propuesta B4
- **B4.1** Mapeo de resultados y parseo (flow-result) + tests.
- **B4.2** Aliado: `createCommitmentAction`, página `/panel/aliado/apoyar/[needId]`, `CommitmentForm`, entrada según D2.
- **B4.3** Aliado: `reportDeliveryAction` + `ReportDeliveryButton` en la tarjeta del compromiso.
- **B4.4** Escuela: `confirmReceiptAction` + `ConfirmReceiptButton` en "Entregas reportadas por confirmar".
- **B4.5** Pruebas locales con dobles, HTTP sin escrituras, privacidad, bundle, regresiones B1/B2/B3, capturas.
- **B4.6** Reporte → E2E real (autorización aparte) → actualización de regresiones → commit (autorización aparte).

**Archivos:** ver §4 (5 nuevos; 5–6 modificados; ninguno en `flow/`, `hedera/`, `verify/`, `data/`, `domain/`, `events/`, auth, `supabase/`, `package.json`).
**Riesgos principales:** doble compromiso, latencia de publicación, `completed` con publicación pendiente, enlace público + retorno tras login (§15).
**Decisiones:** D1–D10 (§18).
