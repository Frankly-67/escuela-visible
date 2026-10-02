# Escuela Visible

**Necesidades de escuelas rurales de Santander (Colombia), apoyo de la comunidad y una
trazabilidad que cualquiera puede comprobar.**

- **Demo:** https://escuela-visible.vercel.app
- **Repositorio:** https://github.com/Frankly-67/escuela-visible
- **Hedera Testnet · Topic:** [`0.0.10796342`](https://hashscan.io/testnet/topic/0.0.10796342)

---

## El problema

Las escuelas rurales tienen necesidades concretas (materiales, infraestructura, agua,
conectividad) que rara vez son visibles para quien podría ayudar. Y cuando alguien ayuda,
el seguimiento suele quedarse en mensajes y fotos sueltas: es difícil saber qué se pidió, quién
se comprometió, qué se entregó y si la escuela lo recibió.

## La solución

Escuela Visible publica las necesidades de cada escuela (revisadas antes de hacerlas públicas),
permite que aliados se comprometan a apoyarlas y sigue cada ayuda hasta que **la escuela confirma
que la recibió**. Una ayuda no se da por cerrada porque quien ayuda diga que la entregó.

Cada paso queda en un historial, y cada evento de ese historial se publica en **Hedera Consensus
Service**, de modo que cualquiera puede comprobar que el registro no fue alterado.

## Flujo principal

```
Escuela → Necesidad → Compromiso → Entrega → Confirmación de la escuela → Registro verificable en Hedera
```

| Paso | Quién | Evento publicado en Hedera |
|---|---|---|
| Registrar una necesidad | escuela | `NEED_CREATED` |
| Validarla (o no aprobarla) | administración | `NEED_VALIDATED` (no aprobar no publica) |
| Comprometerse a apoyar | aliado | `COMMITMENT_CREATED` |
| Reportar la entrega | aliado | `DELIVERY_REPORTED` |
| Confirmar la recepción | escuela | `SCHOOL_CONFIRMED` |

La necesidad se completa automáticamente cuando lo confirmado por la escuela alcanza la meta.

## Qué aporta Hedera

- **Hedera Consensus Service (HCS), red Testnet.** Cada evento de trazabilidad se publica como un
  mensaje en el topic [`0.0.10796342`](https://hashscan.io/testnet/topic/0.0.10796342).
- **Evento canónico e inmutable.** El mensaje contiene un payload con 9 campos
  (`v, app, eventId, type, needId, schoolId, commitmentId, actorRole, timestamp`) y su **SHA-256**.
  Solo identificadores, tipo, rol y fecha: nunca texto libre ni datos personales.
- **Outbox.** El cambio de estado y el evento se guardan en una sola transacción; la publicación en
  Hedera se hace después y, si falla, el evento queda pendiente sin perderse.
- **Verificación pública mediante el Mirror Node.** En `/verify/[id]` la plataforma consulta en vivo
  el Mirror Node de Hedera y ejecuta 13 comprobaciones: que el mensaje exista en el topic correcto,
  que lo haya enviado la cuenta de la plataforma, que el payload y el hash coincidan con el evento
  guardado, etc. Incluye enlaces a HashScan para comprobarlo de forma independiente.

> Este registro permite comprobar que el evento registrado por Escuela Visible coincide con el
> registro publicado en Hedera.

### Limitación (importante)

Hedera registra y permite verificar el **evento publicado**, pero **no demuestra por sí sola que una
entrega física haya ocurrido**. En este MVP es la plataforma quien firma y envía los eventos: Hedera
prueba que la plataforma publicó ese evento y que no fue alterado después. La garantía de que la
ayuda llegó viene de que **la escuela confirma la recepción**; Hedera hace verificable ese registro.

## Funcionalidades actuales

- **Mapa de escuelas** (MapLibre) con ubicaciones aproximadas.
- **Necesidades** publicadas por las escuelas y validadas por la administración antes de ser públicas.
- **Compromisos** de aliados, con el progreso comprometido y confirmado frente a la meta.
- **Reporte de entrega** por el aliado.
- **Confirmación por la escuela**, que es la que cierra cada ayuda.
- **Verificación en Hedera** de cada paso en `/verify/[id]`.
- **Tablón**: bazares, sancochos, actividades, mejoras, campañas y proyectos de las escuelas. La
  escuela publica, la administración revisa antes de mostrarlo; no se registra en Hedera.
- **Casos reales documentados**: intervenciones reales documentadas fuera de la plataforma (por
  ejemplo, I.E. Rural El Hoyo – Sede C Santillana, Mogotes), claramente separadas de los datos DEMO
  y sin registro en Hedera.
- **Escuelas DEMO claramente identificadas**: las escuelas de demostración son ficticias y llevan el
  distintivo «DEMO · ficticia» en toda la interfaz.
- **Paneles por rol**: escuela, aliado y administración.

## Privacidad

Nunca se publican nombres ni fotografías identificables de menores, datos médicos, direcciones
particulares ni datos individuales de estudiantes. Las necesidades de estudiantes se expresan de
forma agregada («20 kits para 20 estudiantes»). A Hedera solo van identificadores y hashes.

## Tecnologías

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Supabase (Postgres, Auth, RLS) · Hedera Consensus Service + Mirror Node (`@hiero-ledger/sdk`) ·
MapLibre (teselas de OpenFreeMap) · Vercel.

## Arquitectura

```
Navegador → Server Components / Server Actions (Next.js, runtime Node.js)
  · Lecturas:  src/lib/data (server-only) → Supabase con la sesión (RLS + permisos por columna)
  · Escrituras: Server Action → requireActor (rol desde la sesión) → src/lib/flow (reglas de dominio)
               → RPC flow_* en Postgres (una transacción: cambio de estado + evento canónico SHA-256
               en el outbox hedera_events) → publishEvent → Hedera HCS
  · Verificación pública: /verify/[id] → Mirror Node de Hedera (13 comprobaciones)
```

### Modelo de seguridad

- **Lecturas:** RLS decide qué ve cada rol (`anon`, `supporter`, `school_rep`, `admin`), y los
  permisos por columna impiden leer identificadores de personas, notas y errores internos.
- **Escrituras:** el navegador nunca escribe directamente en la base de datos. Todas pasan por
  Server Actions que validan el rol y la transición de estado, y por funciones de Postgres
  (`flow_*`, `board_*`) que vuelven a validarlo todo y que solo puede ejecutar el servidor.
- **Claves:** la secret key de Supabase y la clave del operador de Hedera solo existen en el
  servidor; en el navegador solo está la publishable key.

### Estructura

```
src/
  app/          rutas: portada, escuelas, necesidades, tablón, /verify, /ingresar, /panel/* (escuela, aliado, admin)
  components/   interfaz (mapa, necesidades, tablón, casos documentados, paneles, verificación)
  content/      casos reales documentados (contenido estático revisado)
  lib/
    actions/    traducción entre Server Actions e interfaz
    auth/       sesión y requireActor
    board/      tablón (validación y escrituras)
    data/       lecturas server-only
    domain/     reglas puras: permisos, máquina de estados, progreso, textos
    events/     evento canónico (payload, SHA-256, mensaje HCS)
    flow/       operaciones del flujo (validación + RPC flow_*)
    hedera/     publicación (outbox), Mirror Node, enlaces HashScan
    verify/     verificación de eventos (13 comprobaciones)
    supabase/   clientes: navegador, servidor (cookies), admin (secret key), proxy
supabase/
  migrations/   esquema, RLS, permisos por columna, RPC del flujo y del tablón
  seed.sql      escuelas DEMO
scripts/        cuentas DEMO, utilidades de Hedera, E2E manuales, regresiones
docs/           REGRESIONES.md, DEPLOY.md y auditorías de cada fase
```

## Ejecutar localmente

Requisitos: Node.js 24, un proyecto de Supabase y una cuenta de Hedera Testnet
([portal.hedera.com](https://portal.hedera.com)).

```bash
npm install
cp .env.example .env.local   # completar con tus propios valores (nunca subir .env.local)
npm run env:check            # verifica las variables sin imprimir valores
npm run dev                  # http://localhost:3000
```

Variables (descritas en [`.env.example`](.env.example)):

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | pública | URL del sitio |
| `NEXT_PUBLIC_SUPABASE_URL` | pública | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública | publishable key de Supabase |
| `SUPABASE_SECRET_KEY` | **solo servidor** | secret key de Supabase (nunca con prefijo `NEXT_PUBLIC_`) |
| `HEDERA_NETWORK` | solo servidor | `testnet` |
| `HEDERA_OPERATOR_ID` | solo servidor | cuenta operadora de Hedera |
| `HEDERA_OPERATOR_KEY` | **solo servidor** | clave privada de la cuenta operadora |
| `HEDERA_OPERATOR_KEY_TYPE` | solo servidor | `ecdsa` o `ed25519` |
| `HEDERA_TOPIC_ID` | solo servidor | topic de HCS donde se publican los eventos |
| `HEDERA_MIRROR_NODE_URL` | solo servidor | Mirror Node de Testnet |
| `DEMO_ACCOUNT_PASSWORD` | solo scripts locales | contraseña de las cuentas DEMO (no se configura en Vercel) |

Base de datos y datos DEMO en un proyecto de Supabase nuevo:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push                     # aplica las migraciones de supabase/migrations
# seed: ejecutar supabase/seed.sql (SQL Editor de Supabase o psql)
npm run demo:accounts                    # vista previa de las 5 cuentas DEMO
npm run demo:accounts -- --confirm       # las crea (contraseña desde DEMO_ACCOUNT_PASSWORD)
npm run hedera:check                     # comprueba la cuenta operadora de Hedera
npm run hedera:create-topic              # solo si necesitas un topic propio
```

## Pruebas

| Comando | Qué ejecuta |
|---|---|
| `npm test` | pruebas unitarias |
| `npm run typecheck` / `npm run lint` / `npm run build` | tipos, lint y build de producción |
| `npm run test:pglite` | migraciones, RLS y RPC en Postgres en memoria (sin red) |
| `npm run test:privacy` / `npm run test:bundle` | secretos en el repositorio y en el bundle del navegador |
| `npm run test:regression` / `npm run test:regression:http` | regresiones de solo lectura con datos reales |

Detalle en [`docs/REGRESIONES.md`](docs/REGRESIONES.md). Despliegue en
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Estado del proyecto

**MVP desarrollado para el hackathon Descifra Hedera · UFest26.**

- El flujo completo funciona desde la interfaz y se probó con datos DEMO en producción: hay eventos
  publicados y verificables en el topic `0.0.10796342` de Hedera Testnet.
- Las escuelas DEMO son ficticias; los casos reales se documentan aparte y nunca se mezclan con ellas.
- Fuera del alcance del MVP: pagos, criptomonedas, tokens, NFTs, smart contracts, chat y registro
  público de usuarios (las cuentas de la demo son cuentas DEMO precargadas).
- Pendiente: reintento de publicaciones fallidas desde la interfaz (hoy quedan guardadas en el
  outbox).

## Enlaces

- Demo: https://escuela-visible.vercel.app
- Repositorio: https://github.com/Frankly-67/escuela-visible
- Topic en HashScan: https://hashscan.io/testnet/topic/0.0.10796342
