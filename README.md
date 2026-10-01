# Escuela Visible

Plataforma para visibilizar las necesidades de escuelas rurales de Santander (Colombia)
y hacer trazable el ciclo completo de una ayuda:

```
ESCUELA CREA NECESIDAD → ADMIN VALIDA → NECESIDAD PÚBLICA → ALIADO SE COMPROMETE
→ ALIADO REPORTA ENTREGA → ESCUELA CONFIRMA RECEPCIÓN → EVENTO EN HEDERA (HCS)
```

Una ayuda no se considera cerrada porque quien ayuda diga que la entregó: la escuela
debe confirmar la recepción.

## Qué verifica Hedera (y qué no)

Cada cambio de estado importante genera un **evento** con un payload canónico e
inmutable (identificadores, tipo, rol del actor, fecha). Se calcula su SHA-256 y se
publica en un topic de Hedera Consensus Service.

> Este registro permite comprobar que el evento registrado por Escuela Visible
> coincide con el registro publicado en Hedera.

- En el MVP, **la plataforma** firma y envía los eventos. Hedera prueba que la
  plataforma publicó ese evento y que no fue alterado después.
- Hedera **no** garantiza que la ayuda ocurrió, ni verifica filas completas de la base de datos.

## Privacidad

Nunca se almacenan ni publican nombres de menores, fotografías identificables de
menores, datos médicos, direcciones particulares ni datos individuales de estudiantes.
Las necesidades de estudiantes se expresan de forma agregada. A Hedera solo van
identificadores y hashes; nunca texto libre.

## Datos DEMO

Las escuelas de demostración son **ficticias** (municipios reales, escuelas inventadas)
y están marcadas como DEMO en la base (`is_demo`) y en la interfaz. Hay cinco cuentas DEMO
(administración, tres escuelas y un aliado), sin datos personales reales.

## Estado del MVP

El flujo completo funciona desde la interfaz y se ha probado con datos reales:

| Paso | Rol | Evento HCS |
|---|---|---|
| Registrar necesidad | escuela | `NEED_CREATED` |
| Validar / no aprobar | admin | `NEED_VALIDATED` (no aprobar no publica) |
| Comprometer apoyo | aliado | `COMMITMENT_CREATED` |
| Reportar entrega | aliado | `DELIVERY_REPORTED` |
| Confirmar recepción (completa la necesidad al llegar a la meta) | escuela | `SCHOOL_CONFIRMED` |

Casos DEMO: El Mirador (abierta a apoyos), La Cascada (completada 30/30) y Los Robles
(no aprobada). Topic de Hedera Testnet `0.0.10796342`; cada evento se comprueba en vivo en
`/verify/[id]`.

Fuera del MVP: pagos, cripto, tokens/NFT, registro de usuarios, notificaciones, notas y
evidencias de entrega.

## Arquitectura

```
Navegador → Server Components / Server Actions (Next.js 16, runtime Node.js)
  · Lecturas: src/lib/data (server-only) → Supabase con la sesión (RLS + permisos de columnas)
  · Escrituras: Server Action → requireActor → src/lib/flow (dominio) → RPC flow_* (transacción:
    estado + evento canónico SHA-256 en el outbox hedera_events) → publishEvent → Hedera HCS
  · Verificación pública: /verify/[id] → 13 comprobaciones contra el Mirror Node
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase (Postgres,
Auth, Storage, RLS) · Hedera Consensus Service + Mirror Node · MapLibre · Vercel.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar valores
npm run dev
```

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc --noEmit` |
| `npm run build` | Build de producción |
| `npm test` | Pruebas unitarias (`node:test` vía `tsx`) |
| `npm run test:pglite` / `test:privacy` / `test:bundle` | Regresiones offline (ver `docs/REGRESIONES.md`) |
| `npm run test:regression` / `test:regression:http` | Regresiones de solo lectura con datos reales (ver `docs/REGRESIONES.md`) |
| `npm run db:types` | Regenera `src/types/database.ts` desde el proyecto Supabase enlazado |
| `npm run env:check` | Verifica variables de entorno sin imprimir valores |
| `npm run script -- scripts/<x>.ts` | Ejecuta un script con `.env.local` y la condición `react-server` |

Los scripts de `scripts/` cargan `.env.local` (primer import: `./lib/load-env`) y se
ejecutan con `--conditions=react-server`, lo que les permite reutilizar los módulos
`server-only` de `src/lib` sin debilitar esa protección en la app.

### Base de datos

Migraciones en `supabase/migrations/` y datos DEMO en `supabase/seed.sql`. El proyecto
DEMO ya tiene todo aplicado: estos comandos son para montar un proyecto nuevo, no para el
despliegue (ver `docs/DEPLOY.md`).

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push             # aplica migraciones
# seed: ejecutar supabase/seed.sql en el SQL Editor o con psql
```

### Claves

Ver `.env.example` (nombres y explicación) y la tabla de `docs/DEPLOY.md`.

- `NEXT_PUBLIC_*`: públicas, se incluyen en el bundle del navegador.
- `SUPABASE_SECRET_KEY` y `HEDERA_OPERATOR_KEY`: **solo servidor**, secretas. Nunca con
  prefijo `NEXT_PUBLIC_`, nunca en Git.
- `DEMO_ACCOUNT_PASSWORD`: solo scripts locales y regresiones.

### Modelo de seguridad

- **Lecturas:** RLS decide qué ve cada rol (`anon`, `supporter`, `school_rep`, `admin`).
- **Columnas:** además de RLS (que filtra filas), `anon` y `authenticated` solo tienen
  `SELECT` sobre columnas explícitas de `needs`, `commitments` y `hedera_events`
  (migraciones `20261001000400` y `20261001000500`). No pueden leer, ni siquiera el
  admin con su sesión:
  - `needs.created_by`, `needs.validated_by`
  - `commitments.supporter_id`, `confirmed_by`, `note`, `delivery_note`, `delivery_evidence_path`
  - `hedera_events.submission_error`, `attempts`, `payload`

  Las consultas con la publishable key o la sesión deben listar columnas (`select *`
  sobre esas tablas falla). Las columnas nuevas no quedan legibles salvo `grant` explícito.
- **Escrituras:** no hay políticas de escritura para el cliente. Todas pasan por Server
  Actions que validan rol y transición de estado y usan la secret key.

## Estructura

```
src/
  app/                 rutas: portada, escuelas, necesidades, /verify, /ingresar, /panel/* (escuela, aliado, admin)
  components/          UI (necesidades, paneles, verificación, mapa, layout)
  lib/
    actions/           traducción entre Server Actions e interfaz (formularios, mensajes)
    auth/              sesión y requireActor
    data/              lecturas server-only (públicas, paneles, verificación)
    domain/            reglas puras: permisos, máquina de estados, progreso, textos
    events/            evento canónico (payload, SHA-256, mensaje HCS)
    flow/              operaciones del flujo (validación + RPC flow_*)
    hedera/            publicación (outbox), Mirror Node, enlaces HashScan
    verify/            verificación de eventos (13 comprobaciones)
    supabase/          clientes: browser, server (cookies), admin (secret), proxy
    env.ts, env.server.ts
  proxy.ts             refresco de sesión de Supabase
  types/database.ts    tipos de la base de datos
supabase/
  migrations/          esquema, RLS, vistas, permisos por columna, RPC del flujo
  seed.sql             escuelas DEMO
scripts/               cuentas DEMO, E2E manuales (con --confirm), Hedera, regresiones
docs/                  REGRESIONES.md, DEPLOY.md y auditorías de cada fase
```

## Documentación

- `docs/REGRESIONES.md`: qué pruebas existen, cuáles son de solo lectura y cómo ejecutarlas.
- `docs/DEPLOY.md`: preparación para Vercel (variables, Supabase, Hedera, smoke test).
- `docs/AUDITORIA_B3.md` … `docs/AUDITORIA_B5.md`: decisiones de cada fase.

## Deuda técnica

- **Lecturas con identificadores protegidos.** "Mis compromisos" del aliado se lee en el
  servidor con el cliente admin, después de `requireActor(['supporter'])` y filtrando por
  `supporter_id = actor.id` (única excepción, en `src/lib/data/panel.ts`). Alternativa más
  estricta pendiente: funciones `security definer` con `auth.uid()` (requiere migración).
- **Reintento de publicación.** Si una publicación en Hedera falla, el evento queda pendiente
  en el outbox; todavía no hay un botón de reintento en la interfaz.
- **Notas de compromisos y entregas.** `note` y `delivery_note` ya no son legibles por
  `anon`/`authenticated`. Los flujos DEMO las guardan en `NULL`; queda pendiente decidir
  si la interfaz debe ofrecerlas y a quién mostrarlas.
- **Perfiles públicos DEMO.** Las cuentas DEMO tienen `show_publicly = true`, por lo
  que su nombre de rol es legible en `profiles`, aunque ya no se puede asociar a
  necesidades ni compromisos desde la API pública.
