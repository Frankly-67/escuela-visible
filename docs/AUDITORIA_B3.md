# Auditoría B3 — Acciones de necesidad (solo lectura)

Fecha: 2026-10-01 · Base: `1b21c1d feat: add role-based panel views and detail pages`
Estado al auditar: working tree limpio; Hedera topic `0.0.10796342` con 5 mensajes (último `1790821886.925550104`).
Esta auditoría no modificó código, datos, Supabase ni Hedera. Este archivo es el único cambio.

---

## 0. Estado real encontrado

| Capa | Estado |
|---|---|
| Base de datos | RPC atómicas `flow_create_need`, `flow_validate_need`, `flow_reject_need`, `flow_create_commitment`, `flow_report_delivery`, `flow_confirm_receipt` (solo `service_role`). Probadas en PGlite (incluido rechazo: rol, transición). |
| Dominio | `authorizeCreateNeed`, `authorizeValidateNeed`, `authorizeRejectNeed`, `authorizeCreateCommitment`, `authorizeReportDelivery`, `authorizeConfirmReceipt` + tests. |
| Flow (TS, server-only) | `createNeed`, `validateNeed`, `createCommitment`, `reportDelivery`, `confirmReceipt`. **No existe `rejectNeed`** (la RPC y el permiso sí). |
| Hedera | `publishEvent(eventId)` con outbox, reconciliación por contenido y ventana de reenvío de 180 s. Solo lo usan los scripts `e2e-*`. |
| UI | B2: paneles y detalles **solo lectura**. Ninguna Server Action de negocio. Única Server Action: `signIn`/`signOut`. |
| Brecha | Todo el flujo funciona **solo desde scripts**. Ningún usuario puede ejecutar una acción desde la interfaz. |

## 1. Objetivo de B3

**Problema:** el flujo existe en base de datos, dominio y flow, pero no hay forma de usarlo desde la aplicación. La demo depende de scripts.

**Propuesta B3 = primeras acciones de negocio, del lado de la necesidad:**
1. `createNeedAction` — la escuela registra una necesidad (→ `pending_validation`, evento NEED_CREATED, publicado en HCS).
2. `validateNeedAction` — el admin la valida (→ `published`, evento NEED_VALIDATED, publicado en HCS).
3. `rejectNeedAction` — el admin no la aprueba (→ `cancelled`, **sin evento HCS**, como ya define la RPC).

**Por qué después de B2:** B2 dejó los lugares exactos donde van estas acciones (panel Escuela y revisión Admin con checklist de privacidad). Se reutiliza todo: flow, permisos, RPC, outbox. No se inventa lógica.

**Qué completa:** los dos primeros pasos del flujo aprobado (escuela crea → admin valida → pública) desde la interfaz, con trazabilidad verificable en `/verify/[id]`.

**Qué queda para la fase siguiente (B4):** compromiso, reporte de entrega y confirmación de recepción (lado del aliado/escuela), con el mismo patrón ya probado en B3.

## 2. Alcance

**Imprescindible**
- 3 Server Actions (`"use server"`), cada una: `requireActor([rol])` dentro de la acción → función de flow existente → `publishEvent` (salvo rechazo) → refresco de la vista.
- `rejectNeed` en `src/lib/flow/needs.ts` (envoltorio delgado de `flow_reject_need` + `authorizeRejectNeed`, ambos ya existen y están aprobados).
- Formulario "Registrar necesidad" (página nueva dentro del panel Escuela) con el aviso de privacidad.
- Botones "Validar y publicar" y "No aprobar" en la revisión Admin, solo para `pending_validation`, con confirmación explícita.
- Mensajes de resultado: éxito, error de negocio (mensaje de `FlowError`), y "registrado; publicación en Hedera pendiente" si `publishEvent` no termina en `submitted`.
- Tests unitarios + HTTP (sin escribir) + una E2E real **solo con autorización separada**.

**Útil pero opcional**
- Botón admin "Reintentar publicación" para eventos `failed`/`pending` (usa `publishEvent`, que ya es idempotente).
- Motivo de rechazo (requeriría columna nueva → **no** en B3).
- Editar necesidad pendiente (no existe RPC → no en B3).

**No debería hacerse todavía**
- Acciones de compromiso/entrega/confirmación (B4).
- Notas de compromiso/entrega, evidencias (decisión pendiente en README).
- Registro de usuarios, emails, notificaciones.
- Nuevos tipos de evento HCS, cambios en el payload canónico o en `/verify`.
- Publicación asíncrona con colas/cron.

## 3. Archivos

**Crear**
| Archivo | Por qué |
|---|---|
| `src/app/panel/escuela/actions.ts` | `createNeedAction` (`"use server"`). `schoolId` sale de `actor.schoolId`, nunca del formulario. |
| `src/app/panel/admin/actions.ts` | `validateNeedAction`, `rejectNeedAction`. |
| `src/app/panel/escuela/necesidades/nueva/page.tsx` | Página del formulario (Server Component, `requireActor(['school_rep'])`). |
| `src/components/panel/need-form.tsx` | Client Component (`useActionState`); solo recibe la acción y el estado, ningún dato sensible. |
| `src/components/panel/review-actions.tsx` | Client Component: dos formularios (validar / no aprobar) con confirmación y estado pendiente. |
| `src/lib/actions/flow-result.ts` (+ `.test.ts`) | Funciones puras: FormData → input del schema existente; `FlowError`/`PublishOutcome` → mensaje para la UI (sin detalles internos). |

**Modificar**
| Archivo | Por qué |
|---|---|
| `src/lib/flow/needs.ts` | Añadir `rejectNeed` (no hay envoltorio TS). **Archivo protegido: requiere autorización explícita.** |
| `src/app/panel/escuela/page.tsx` | Enlace "Registrar necesidad"; quitar el texto "Crear necesidades se habilitará…". |
| `src/app/panel/admin/necesidades/[id]/page.tsx` | Mostrar `ReviewActions` si `status = pending_validation`; quitar "La validación se habilitará…". |
| `src/app/panel/admin/page.tsx` (opcional) | Solo texto de introducción. |
| `README.md` (opcional) | Documentar las acciones. |

**No tocar**
`src/lib/data/*` (B1), `src/lib/domain/*` (permisos y estados ya cubren B3), `src/lib/hedera/*`, `src/lib/verify/*`, `src/lib/events/*`, `src/lib/auth/*`, `src/lib/supabase/*`, `supabase/*` (migraciones, RLS, seed), layouts de panel, `/panel/page.tsx`, `/ingresar`, páginas públicas, `/verify`, `package.json`, `.env*`, `scripts/*`.

## 4. Base de datos

B3 **no necesita**: tablas, columnas, migraciones, RLS, RPC, vistas ni permisos nuevos.
Todo existe: `flow_create_need`, `flow_validate_need`, `flow_reject_need` (tipadas en `src/types/database.ts`), ejecutadas con el cliente admin dentro de `flow/` (patrón actual).
Sí **escribe datos** al usarse (necesidades y eventos nuevos): solo al ejecutar acciones reales, nunca en pruebas sin autorización.

## 5. Hedera

- **Sí escribe**, pero **sin eventos nuevos**: NEED_CREATED y NEED_VALIDATED, con el payload canónico existente de 9 campos (`v, app, eventId, type, needId, schoolId, commitmentId=null, actorRole, timestamp`) + SHA-256. Ningún texto libre.
- **Rechazo: sin evento** (decisión ya tomada en la RPC de Phase 2). Consecuencia: la no aprobación no queda en Hedera. Para el MVP es suficiente; añadir `NEED_REJECTED` exigiría tocar enum, payload y `/verify` → **no recomendado**.
- **Riesgos:** cada uso real consume HBAR (~0,0001 ℏ por mensaje; saldo 999,7 ℏ) y añade mensajes permanentes; un doble envío podría duplicar NEED_CREATED (ver riesgos); latencia de 2–6 s por la espera de consenso/Mirror Node dentro de la acción.
- **Necesario para el MVP:** sí; es el valor central del producto (cada paso verificable).
- Durante la implementación y las pruebas locales **no se publica nada**: `publishEvent` se sustituye por un doble en los tests. La única escritura real sería la E2E autorizada aparte.

## 6. Seguridad y privacidad

- **Roles:** cada Server Action es un endpoint público → `requireActor([rol])` **dentro** de cada acción (no basta la página). Defensa doble: `authorize*` en flow y validación en la RPC.
- **Entre escuelas:** `createNeedAction` usa `actor.schoolId`; cualquier `schoolId` en el FormData se ignora (el schema es `strictObject`: el input se construye en el servidor).
- **Admin:** `needId` del formulario se valida (UUID) y la transición la comprueban dominio + RPC (`INVALID_TRANSITION` si no está pendiente).
- **Aliados:** sin acceso a ninguna acción de B3 (FORBIDDEN_ROLE / redirección).
- **Datos personales / menores:** el título y la descripción son texto libre de la escuela → aviso explícito en el formulario ("No incluyas nombres de menores, fotos, direcciones ni datos médicos; expresa las necesidades de forma agregada") + checklist del admin antes de validar (ya existe). El texto nunca va a Hedera.
- **IDs internos:** la acción devuelve como máximo `needId`/`eventId` (necesarios para enlaces); nunca ids de personas.
- **Errores:** mostrar solo mensajes de `FlowError` (ya en español y sin detalles) o un genérico; nunca `submission_error`, mensajes del SDK de Hedera ni de Supabase.
- **server-only / cliente:** los Client Components solo reciben la referencia de la acción y el estado serializado. `flow/`, `hedera/`, `supabase/admin` siguen sin poder importarse desde el cliente (`server-only`).
- **CSRF:** Next 16 verifica el origen de las Server Actions (probado en Fase A). Sin `allowedOrigins` extra.
- **Cierres (closures):** definir las acciones en archivos `actions.ts` (no inline) para no capturar variables.

## 7. Flujo de estados

**Sin estados ni transiciones nuevas.** B3 solo expone transiciones ya aprobadas:

| Actual | Nuevo | Actor | Evento |
|---|---|---|---|
| (no existe) | `pending_validation` | school_rep de esa escuela | NEED_CREATED |
| `pending_validation` | `published` | admin | NEED_VALIDATED |
| `pending_validation` | `cancelled` | admin | (ninguno) |

## 8. UX

- **Escuela:** botón/enlace "Registrar necesidad" en su panel → formulario (tipo, título, descripción, categoría, prioridad, meta y unidad, fecha opcional) con aviso de privacidad → al guardar vuelve al panel con "Necesidad registrada. Queda pendiente de validación." y, si aplica, "La publicación en Hedera está pendiente". La necesidad aparece en "Pendientes de validación" (no es pública).
- **Admin:** en `/panel/admin/necesidades/[id]`, solo si está pendiente: "Validar y publicar" y "No aprobar", cada uno con confirmación ("¿Confirmas que revisaste la privacidad?"). Tras validar: "Necesidad publicada" + enlace "Ver verificación" del evento.
- **Aliado:** sin cambios en B3.
- **Público:** ve la necesidad solo cuando está `published` (RLS existente) y su historial con NEED_CREATED y NEED_VALIDATED verificables en `/verify/[id]`.
- **Privado:** necesidades pendientes y no aprobadas (escuela propia y admin), cualquier dato de quién validó/creó.

## 9. Demo / hackathon

- **Impacto visual:** en vivo, la escuela registra una necesidad y el admin la publica; aparece en la página pública con su historial y dos pasos verificables.
- **Demostración de Hedera:** NEED_CREATED y NEED_VALIDATED publicados en el momento y comprobados contra el Mirror Node en `/verify` (13/13).
- **Riesgo de romper lo existente:** bajo en lectura (B1/B2 no cambian); el riesgo está en las escrituras reales (datos y mensajes permanentes en testnet) y en la latencia de la acción durante la demo.

## 10. Riesgos

1. **Doble envío de "Registrar necesidad"** → dos necesidades y dos NEED_CREATED (cada intento genera un `needId` nuevo). Mitigar: botón deshabilitado mientras está pendiente y redirección tras éxito. Validar/no aprobar ya son idempotentes por la guarda de estado.
2. **Fallo de Hedera tras commit en base de datos:** la necesidad existe y el evento queda `pending`/`failed`. Es el diseño del outbox; la UI debe decirlo sin mentir. Falta UI de reintento (opcional) — hoy se reintenta con scripts.
3. **Latencia/timeout en serverless** (gRPC de Hedera + espera del Mirror Node): revisar `maxDuration` al desplegar.
4. **Bypass de permisos** si una acción omite `requireActor` o toma `schoolId` del formulario → tests HTTP específicos.
5. **Exposición de errores internos** (mensajes del SDK/Supabase) → mapeo puro con tests.
6. **Client Components** importando módulos server-only → el build falla (protección existente); revisar bundle.
7. **Modificar `flow/needs.ts`** (protegido): solo añadir `rejectNeed`, sin tocar `createNeed`/`validateNeed`.
8. **`/verify/[id]`:** no se modifica; los nuevos eventos usan el mismo formato → debe dar 13/13.
9. **Paneles B2:** los contadores y listas cambian con datos nuevos (esperado); las pruebas HTTP de B2 asumen 1 necesidad → actualizar expectativas solo si se autoriza la E2E real.
10. **Caso DEMO El Mirador:** no debe tocarse; la E2E real usaría La Cascada / Los Robles.
11. **Duplicación de lógica:** las acciones no deben re-implementar permisos ni validaciones; solo traducir FormData y llamar a flow.

## 11. Plan de pruebas (si se autoriza)

- **Unitarias:** FormData → input (tipos, vacíos, número con coma/punto, fecha vacía → null; sin reglas nuevas); `FlowError`/`PublishOutcome` → mensaje (sin texto interno); que `schoolId` del formulario se ignore.
- **Integración local (sin escrituras reales):** acciones ejecutadas con `flow` y `publishEvent` sustituidos por dobles (como el script de B1) para comprobar: rol, `actor.schoolId`, llamada a `publishEvent` con el `eventId` correcto, rechazo sin publicación.
- **PGlite:** ya cubre las RPC (crear, validar, rechazar, transiciones inválidas); repetir el script de Phase 2.
- **HTTP (sin escribir):** acceso a `/panel/escuela/necesidades/nueva` por rol; POST de acciones sin sesión / con rol incorrecto / con origen ajeno (CSRF) → rechazados sin escribir; botones solo visibles en `pending_validation`; privacidad del HTML.
- **E2E real (autorización aparte):** La Cascada registra 1 necesidad → admin la valida (+2 mensajes HCS → 7); Los Robles registra 1 → admin la rechaza (+1 mensaje NEED_CREATED → 8; el rechazo no publica). `/verify` 13/13 para los nuevos eventos; páginas públicas solo muestran la publicada.
- **Regresión:** `npm test`, typecheck, lint, build; B1 50/50; B2 HTTP 77/77 (o expectativas actualizadas si hubo E2E real); `/verify` 13/13 de los 5 eventos originales; bundle sin secretos ni `createAdminClient`; caso El Mirador intacto.
- **Hedera:** antes y después, número de mensajes y saldo; ningún mensaje nuevo fuera de la E2E autorizada.

## 12. Gate de autorización

**LISTO PARA AUTORIZACIÓN**, con estas decisiones para ti (con mi recomendación):

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Alcance de B3 | Solo acciones de necesidad (crear, validar, no aprobar). Compromisos/entregas/confirmación en B4. |
| D2 | Modificar `src/lib/flow/needs.ts` para añadir `rejectNeed` | Sí (envoltorio de la RPC y permiso existentes). Alternativa: dejar "No aprobar" fuera de B3. |
| D3 | Publicación en Hedera | Síncrona dentro de la acción, mostrando "pendiente" si no termina; sin colas. |
| D4 | Reintento de publicación desde el panel admin | Fuera de B3 (opcional posterior). |
| D5 | E2E real (datos y mensajes HCS permanentes) | Autorización separada al final, con los comandos exactos, usando La Cascada / Los Robles. |

### Propuesta B3 para revisión
- **B3.1** Funciones puras (`flow-result.ts`) + tests.
- **B3.2** `rejectNeed` en flow (si D2 = sí).
- **B3.3** `createNeedAction` + página/formulario de la escuela.
- **B3.4** `validateNeedAction` / `rejectNeedAction` + botones en la revisión admin.
- **B3.5** Pruebas locales con dobles, HTTP sin escrituras, privacidad, bundle, regresión B1/B2, capturas.
- **B3.6** Reporte → (si se autoriza) E2E real → reporte → commit autorizado aparte.
