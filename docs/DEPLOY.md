# Despliegue en Vercel (preparación)

Estado: **preparado, no desplegado.** Nada de esto se ha probado todavía en Vercel; lo que no se
puede comprobar en local está marcado como **NO VERIFICADO EN VERCEL**.

## Requisitos

- Node.js ≥ 20.9 (lo exige Next 16). Probado en local con **Node 24.18.0** y **npm 11.16.0**.
  En Vercel, elegir Node 24.x (o 22.x) en *Project Settings → General → Node.js Version*.
- Cuenta de Vercel (framework Next.js).
- El proyecto Supabase existente (con las 5 migraciones aplicadas y los datos DEMO).
- Cuenta operadora de Hedera **Testnet** con saldo y el topic existente.

## Variables de entorno

Configurar en *Vercel → Project Settings → Environment Variables* (Production y, si se usa,
Preview). **Nunca** valores reales en Git ni en este documento.

| Variable | Tipo | Propósito |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Pública (en el bundle) | URL canónica del sitio (`metadataBase`). Poner la URL pública definitiva, sin barra final. |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública (en el bundle) | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública (en el bundle) | Clave publicable (respeta RLS). |
| `SUPABASE_SECRET_KEY` | **Server-only, secreta** | Cliente admin del servidor (RPC del flujo, lecturas server-side). Salta RLS. |
| `HEDERA_NETWORK` | Server-only | `testnet`. |
| `HEDERA_OPERATOR_ID` | Server-only | Cuenta que paga y firma (también se usa en `/verify` para comprobar el pagador). |
| `HEDERA_OPERATOR_KEY` | **Server-only, secreta** | Clave privada del operador (DER o hex). Solo la usan las acciones que publican. |
| `HEDERA_OPERATOR_KEY_TYPE` | Server-only | `ecdsa` o `ed25519`. |
| `HEDERA_TOPIC_ID` | Server-only | Topic existente (ver §Hedera). |
| `HEDERA_MIRROR_NODE_URL` | Server-only | `https://testnet.mirrornode.hedera.com`. |

**No configurar en Vercel:** `DEMO_ACCOUNT_PASSWORD` (solo la usan los scripts locales y las
regresiones).

Las `NEXT_PUBLIC_*` se incrustan en el bundle **durante el build**: deben existir antes del
primer build; si se cambian, hay que volver a desplegar. Sin `NEXT_PUBLIC_SITE_URL` el sitio
funciona (todas las URL internas son relativas, incluida `/verify`), pero `metadataBase` quedaría
en `http://localhost:3000`.

Comprobación local de variables (sin imprimir valores): `npm run env:check`.

## Supabase

- Usar el **proyecto existente** (el de los datos DEMO actuales). Debe tener las 5 migraciones de
  `supabase/migrations/` aplicadas (`npx supabase migration list --linked` → local = remoto).
- **No** ejecutar `supabase db push`, el seed ni scripts de cuentas DEMO como parte del despliegue.
- **No** cambiar RLS ni permisos. La autenticación es correo + contraseña (cuentas DEMO); no
  requiere URLs de redirección.

## Hedera

- Red: **testnet**. Topic existente: **`0.0.10796342`** (11 mensajes a la fecha de este documento).
- **No crear un topic nuevo** durante el despliegue (`hedera:create-topic` no forma parte del despliegue).
- El SDK `@hiero-ledger/sdk` se carga sin empaquetar (`serverExternalPackages` en
  `next.config.ts`) y se ejecuta en el runtime Node.js (el predeterminado; no hay rutas Edge).
  Cada publicación abre un `Client` gRPC hacia la red, congela la transacción, la envía, espera el
  receipt y cierra el cliente. **NO VERIFICADO EN VERCEL:** conexión gRPC saliente a los nodos de
  Testnet desde funciones serverless y su arranque en frío.
- El Mirror Node se consulta por HTTPS (timeout de 8 s por petición).

## Vercel

| Ajuste | Valor |
|---|---|
| Framework | Next.js (detectado) |
| Build command | `npm run build` (ejecuta antes `prebuild`, que copia el worker de MapLibre a `public/maplibre/`) |
| Install command | `npm install` (por defecto) |
| Output | el de Next.js (por defecto) |
| Runtime | Node.js (predeterminado; ninguna ruta usa Edge; el proxy de Next 16 también es Node) |
| Node.js | 24.x (o 22.x) |

### Duración máxima de las Server Actions que publican

Las 5 páginas cuyas Server Actions publican en Hedera declaran `export const maxDuration = 60`
(en Next 16 las Server Actions heredan el `maxDuration` de la página que las invoca):

| Página | Acción |
|---|---|
| `/panel/escuela/necesidades/nueva` | `createNeedAction` |
| `/panel/admin/necesidades/[id]` | `validateNeedAction`, `rejectNeedAction` |
| `/panel/aliado/apoyar/[needId]` | `createCommitmentAction` |
| `/panel/aliado` | `reportDeliveryAction` |
| `/panel/escuela` | `confirmReceiptAction` |

Por qué 60 s: en los E2E reales cada acción tardó de 1 a 18 s (envío + receipt ≈ 3–7 s; después
`publishEvent` consulta el Mirror Node hasta 5 veces con 1,5 s de espera y 8 s de timeout cada
una, peor caso ≈ 50 s en total). 60 s cubre ese peor caso sin depender del límite por defecto de
la plataforma. Si la función se cortara a mitad, el diseño del outbox lo tolera: el evento queda
registrado y el siguiente intento lo reconcilia por contenido sin duplicarlo.
**NO VERIFICADO EN VERCEL:** que el plan de la cuenta permita 60 s.

## Smoke test después del despliegue (solo lectura)

1. Portada: mapa con las 3 escuelas DEMO y el caso "Un caso de principio a fin".
2. Escuela → necesidad (El Mirador activa, La Cascada completada; Los Robles no aparece).
3. Historial de la necesidad → "Ver verificación" → `/verify/[id]`: "Coincide con el registro
   publicado en Hedera", 13/13.
4. `/ingresar` con una cuenta DEMO → panel del rol (escuela, aliado, admin) sin ejecutar acciones.
5. `/api/health` → `{ ok: true, supabase: "ok" }`.

Las regresiones automáticas (`docs/REGRESIONES.md`) están pensadas para un servidor **local**; no
se ejecutan contra el despliegue público.

Una prueba **real de escritura** en el despliegue (crear, validar, comprometer, reportar,
confirmar) añade datos y mensajes permanentes en Hedera y requiere **una fase autorizada aparte**.

## Seguridad

Nunca subir a Git ni pegar en documentos o issues:

- `.env.local`
- `HEDERA_OPERATOR_KEY`
- `SUPABASE_SECRET_KEY`
- `DEMO_ACCOUNT_PASSWORD`

Antes de desplegar: `npm run test:privacy` (secretos en el repositorio) y, tras `npm run build`,
`npm run test:bundle` (secretos o código de servidor en el bundle del cliente).
