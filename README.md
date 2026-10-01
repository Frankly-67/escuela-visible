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
y están marcadas como DEMO en la base (`is_demo`) y en la interfaz.

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
| `npm run db:types` | Regenera `src/types/database.ts` desde el proyecto Supabase enlazado |
| `npm run env:check` | Verifica variables de entorno sin imprimir valores |
| `npm run script -- scripts/<x>.ts` | Ejecuta un script con `.env.local` y la condición `react-server` |

Los scripts de `scripts/` cargan `.env.local` (primer import: `./lib/load-env`) y se
ejecutan con `--conditions=react-server`, lo que les permite reutilizar los módulos
`server-only` de `src/lib` sin debilitar esa protección en la app.

### Base de datos

Migraciones en `supabase/migrations/` y datos DEMO en `supabase/seed.sql`.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push             # aplica migraciones
# seed: ejecutar supabase/seed.sql en el SQL Editor o con psql
```

### Claves

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: cliente/navegador.
- `SUPABASE_SECRET_KEY`: **solo servidor**. Nunca con prefijo `NEXT_PUBLIC_`, nunca en Git.
- `HEDERA_OPERATOR_KEY`: **solo servidor**.

### Modelo de seguridad

- **Lecturas:** RLS decide qué ve cada rol (`anon`, `supporter`, `school_rep`, `admin`).
- **Escrituras:** no hay políticas de escritura para el cliente. Todas pasan por Server
  Actions que validan rol y transición de estado y usan la secret key.

## Estructura

```
src/
  app/                 rutas (App Router)
  lib/
    env.ts             variables públicas
    env.server.ts      variables de servidor (server-only)
    supabase/          clientes: browser, server (cookies), admin (secret), proxy
    events/            tipos del evento canónico (hash y envío a Hedera: fase 2)
  proxy.ts             refresco de sesión de Supabase (antes "middleware")
  types/database.ts    tipos de la base de datos
supabase/
  migrations/          esquema, RLS, vistas, storage
  seed.sql             escuelas DEMO
```

## Deuda técnica

- **Notas de compromisos legibles públicamente.** La política RLS
  `commitments: lectura si la necesidad es visible` permite que cualquier visitante
  (anon) lea la fila completa de un compromiso de una necesidad pública, incluidas
  `note` y `delivery_note` (texto libre). La interfaz no las muestra, pero la API
  pública de Supabase sí las devuelve. Mientras no se resuelva, los flujos DEMO
  guardan ambas notas en `NULL`. Pendiente decidir si deben ser públicas y, si no,
  restringirlas con una migración autorizada (p. ej. vista pública sin esas columnas
  o permisos por columna).
