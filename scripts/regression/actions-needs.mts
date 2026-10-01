// B3 — Server Actions REALES (createNeedAction, validateNeedAction, rejectNeedAction)
// con las funciones de flow REALES. Sin escrituras:
//  - createClient (sesión): supabase-js con sesión DEMO real (solo lectura de Auth).
//  - createAdminClient: envoltorio. `profiles` se lee de verdad (requireActor);
//    `needs` devuelve filas FICTICIAS; `rpc` solo se REGISTRA (nunca llega a Supabase).
//  - publishEvent: doble que NO publica en Hedera.
//  - redirect / refresh de Next: dobles.
//
// Regresión del repositorio (B5.1). Requiere .env.local (Supabase y DEMO_ACCOUNT_PASSWORD).
// Inicia sesión con cuentas DEMO (Supabase Auth) y solo LEE datos reales; las escrituras
// (RPC) y la publicación en Hedera están sustituidas por dobles.
import "../lib/load-env";

import { existsSync } from "node:fs";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";

// Raíz del proyecto = directorio de trabajo (se ejecuta con `npm run test:regression`).
// Los dobles de módulos (mock.module) usan la misma ruta que resuelve tsx para "@/…".
const ROOT = process.cwd();
if (!existsSync(`${ROOT}/src/lib/data/panel.ts`)) {
  console.error("Ejecuta esta prueba desde la raíz del proyecto (npm run test:regression).");
  process.exit(2);
}
const { createClient: createSupabase } = await import("@supabase/supabase-js");
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const D = "demo.escuelavisible.example";
const realAdmin = createSupabase(URL_, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

// --- dobles -------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResult: { error: { message: string; hint?: string | null } | null } = { error: null };
let fakeNeed: { id: string; school_id: string; status: string } | null = null;
const needReads: string[] = [];
const publishCalls: string[] = [];
let publishImpl: (id: string) => Promise<unknown> = async () => ({ status: "submitted", sequenceNumber: 99, transactionId: null, consensusTimestamp: null, reconciled: false });
let refreshCalls = 0;

const fakeNeedsQuery = () => {
  const q = {
    select: () => q,
    eq: (_c: string, v: string) => { needReads.push(v); return q; },
    maybeSingle: async () => ({ data: fakeNeed && needReads.at(-1) === fakeNeed.id ? fakeNeed : null, error: null }),
  };
  return q;
};
const adminWrapper = {
  from: (table: string) => {
    if (table === "profiles") return realAdmin.from("profiles"); // solo lectura (getActorById)
    if (table === "needs") return fakeNeedsQuery();
    throw new Error(`tabla no permitida en la prueba: ${table}`);
  },
  rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return rpcResult; },
};

mock.module(pathToFileURL(`${ROOT}/src/lib/supabase/server.ts`).href, { namedExports: { createClient: async () => session } });
mock.module(pathToFileURL(`${ROOT}/src/lib/supabase/admin.ts`).href, { namedExports: { createAdminClient: () => adminWrapper } });
mock.module(pathToFileURL(`${ROOT}/src/lib/hedera/publish.ts`).href, {
  namedExports: { publishEvent: async (id: string) => { publishCalls.push(id); return publishImpl(id); } },
});
mock.module(pathToFileURL(`${ROOT}/node_modules/next/navigation.js`).href, {
  namedExports: { redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); } },
});
mock.module(pathToFileURL(`${ROOT}/node_modules/next/cache.js`).href, { namedExports: { refresh: () => { refreshCalls++; } } });

const { createNeedAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/escuela/actions.ts`).href);
const { validateNeedAction, rejectNeedAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/admin/actions.ts`).href);

let ok = true;
const check = (c: boolean, t: string) => { ok &&= c; console.log(`${c ? "✓" : "✗"} ${t}`); };
const reset = () => { rpcCalls.length = 0; publishCalls.length = 0; needReads.length = 0; refreshCalls = 0; rpcResult = { error: null }; fakeNeed = null;
  publishImpl = async () => ({ status: "submitted", sequenceNumber: 99, transactionId: null, consensusTimestamp: null, reconciled: false }); };
async function signIn(local: string | null) {
  session = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!local) return;
  const { error } = await session.auth.signInWithPassword({ email: `${local}@${D}`, password: process.env.DEMO_ACCOUNT_PASSWORD });
  if (error) throw new Error(`no se pudo iniciar sesión (${local})`);
}
const redirectOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; return d.startsWith("NEXT_REDIRECT") ? d.split(";")[2] : `ERROR ${(e as Error).message}`; }
};
const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
const IDLE = { status: "idle" };

const { data: schools } = await realAdmin.from("schools").select("id, slug");
const schoolId = (slug: string) => schools!.find((s: { slug: string }) => s.slug === `escuela-demo-${slug}`)!.id as string;
const MIRADOR = schoolId("el-mirador"), CASCADA = schoolId("la-cascada");
const { data: profiles } = await realAdmin.from("profiles").select("id, role, school_id");
const PERSONS: string[] = profiles!.map((p: { id: string }) => p.id);
const cascadaRep = profiles!.find((p: { role: string; school_id: string | null }) => p.role === "school_rep" && p.school_id === CASCADA)!.id;
const FAKE_NEED = "aaaaaaaa-0000-4000-8000-0000000000b3";
const FORM = { kind: "need", title: "Prueba B3 (no se guarda)", description: "Doble de prueba", category: "materiales", priority: "media", goalQuantity: "12,5", goalUnit: "kits", eventDate: "" };
const leaks = (state: unknown) => { const j = JSON.stringify(state); return PERSONS.some((p) => j.includes(p)) || /@|supabase|operator|submission_error|connection|10\.0\.0/i.test(j); };

console.log("── Sin sesión");
await signIn(null); reset();
for (const [name, fn] of [["createNeedAction", () => createNeedAction(IDLE, fd(FORM))], ["validateNeedAction", () => validateNeedAction(IDLE, fd({ needId: FAKE_NEED }))], ["rejectNeedAction", () => rejectNeedAction(IDLE, fd({ needId: FAKE_NEED }))]] as const) {
  check((await redirectOf(fn)) === "/ingresar", `${name} sin sesión → redirect /ingresar`);
}
check(rpcCalls.length === 0 && publishCalls.length === 0, "sin sesión: 0 RPC y 0 publicaciones");

console.log("── Escuela (La Cascada): crear necesidad");
await signIn("la-cascada"); reset();
const created = await createNeedAction(IDLE, fd({ ...FORM, schoolId: MIRADOR, role: "admin", userId: PERSONS[0], supporterId: PERSONS[0] }));
const call = rpcCalls[0];
check(created.status === "success" && rpcCalls.length === 1 && call.fn === "flow_create_need", `createNeedAction → 1 RPC flow_create_need (registrada, no ejecutada) · ${created.status}`);
check(call?.args.p_school_id === CASCADA && call.args.p_school_id !== MIRADOR, "schoolId del formulario (El Mirador) ignorado: p_school_id = La Cascada (actor.schoolId)");
check(call?.args.p_actor_id === cascadaRep, "p_actor_id = el representante en sesión (no userId del formulario)");
const payload = JSON.parse(String(call?.args.p_payload_canonical ?? "{}"));
check(payload.schoolId === CASCADA && payload.type === "NEED_CREATED" && payload.actorRole === "school_rep" && payload.commitmentId === null, "evento canónico: NEED_CREATED, schoolId La Cascada, rol school_rep");
check(!String(call?.args.p_payload_canonical).includes("Prueba B3"), "el payload del evento no lleva texto libre (título/descr.)");
check(call?.args.p_goal_quantity === 12.5 && call.args.p_event_date === null && call.args.p_title === "Prueba B3 (no se guarda)", "datos del formulario convertidos (12,5 → 12.5; fecha vacía → null)");
check(publishCalls.length === 1 && publishCalls[0] === call?.args.p_event_id, "publishEvent (doble) llamado con el eventId registrado");
check(created.status === "success" && created.eventId === call?.args.p_event_id && created.publication === "published" && /ya está publicado en Hedera/.test(created.message), `mensaje: «${created.message}»`);
check(!leaks(created), "estado devuelto sin ids de personas ni detalles internos");

reset(); publishImpl = async () => ({ status: "failed", error: "INSUFFICIENT_PAYER_BALANCE at 0.0.1234" });
const pendingFail = await createNeedAction(IDLE, fd(FORM));
check(pendingFail.status === "success" && pendingFail.publication === "pending" && /quedó pendiente/.test(pendingFail.message) && !/INSUFFICIENT|0\.0\.1234/.test(JSON.stringify(pendingFail)), "publishEvent failed → «pendiente», sin el error interno");
reset(); publishImpl = async () => { throw new Error("gRPC UNAVAILABLE operator key 302e…"); };
const pendingThrow = await createNeedAction(IDLE, fd(FORM));
check(pendingThrow.status === "success" && pendingThrow.publication === "pending" && !/gRPC|operator/.test(JSON.stringify(pendingThrow)), "publishEvent lanza → «pendiente», sin detalles");
reset(); publishImpl = async () => ({ status: "in_flight", detail: "x" });
check((await createNeedAction(IDLE, fd(FORM))).publication === "pending", "publishEvent in_flight → «pendiente»");

reset();
const badTitle = await createNeedAction(IDLE, fd({ ...FORM, title: "ab" }));
check(badTitle.status === "error" && badTitle.message === "El título es muy corto" && rpcCalls.length === 0 && publishCalls.length === 0, `título corto → «${badTitle.status === "error" ? badTitle.message : ""}», 0 RPC, 0 publicación`);
check(badTitle.status === "error" && badTitle.values?.title === "ab", "conserva lo escrito tras el error");
reset();
const badQty = await createNeedAction(IDLE, fd({ ...FORM, goalQuantity: "mucho" }));
check(badQty.status === "error" && rpcCalls.length === 0, "meta no numérica → error, 0 RPC");
reset(); rpcResult = { error: { message: "duplicate key value violates unique constraint at 10.0.0.1", hint: null } };
const rpcFail = await createNeedAction(IDLE, fd(FORM));
check(rpcFail.status === "error" && rpcFail.message === "No se pudo completar la operación. Intenta de nuevo." && publishCalls.length === 0 && !leaks(rpcFail), "error desconocido de la RPC → mensaje genérico, sin publicar");
reset(); rpcResult = { error: { message: "NOT_SCHOOL_MEMBER: Solo puedes crear necesidades para tu propia escuela.", hint: "NOT_SCHOOL_MEMBER" } };
const rpcBiz = await createNeedAction(IDLE, fd(FORM));
check(rpcBiz.status === "error" && rpcBiz.message === "Solo puedes crear necesidades para tu propia escuela." && publishCalls.length === 0, "error de negocio de la RPC → su mensaje, sin publicar");

reset();
check((await redirectOf(() => validateNeedAction(IDLE, fd({ needId: FAKE_NEED })))) === "/panel/escuela", "escuela → validateNeedAction → redirect a su panel");
check((await redirectOf(() => rejectNeedAction(IDLE, fd({ needId: FAKE_NEED })))) === "/panel/escuela", "escuela → rejectNeedAction → redirect a su panel");
check(rpcCalls.length === 0 && needReads.length === 0, "escuela: 0 lecturas de necesidades y 0 RPC de admin");

console.log("── Aliado");
await signIn("aliado"); reset();
for (const [name, fn] of [["createNeedAction", () => createNeedAction(IDLE, fd({ ...FORM, schoolId: CASCADA }))], ["validateNeedAction", () => validateNeedAction(IDLE, fd({ needId: FAKE_NEED }))], ["rejectNeedAction", () => rejectNeedAction(IDLE, fd({ needId: FAKE_NEED }))]] as const) {
  check((await redirectOf(fn)) === "/panel/aliado", `aliado → ${name} → redirect /panel/aliado`);
}
check(rpcCalls.length === 0 && publishCalls.length === 0, "aliado: 0 RPC y 0 publicaciones");

console.log("── Admin");
await signIn("admin"); reset();
check((await redirectOf(() => createNeedAction(IDLE, fd({ ...FORM, schoolId: CASCADA })))) === "/panel/admin", "admin → createNeedAction → redirect /panel/admin (no crea necesidades)");
check(rpcCalls.length === 0, "admin: 0 RPC de creación");

reset(); fakeNeed = { id: FAKE_NEED, school_id: CASCADA, status: "pending_validation" };
const validated = await validateNeedAction(IDLE, fd({ needId: FAKE_NEED, schoolId: MIRADOR, status: "published" }));
const vcall = rpcCalls[0];
const vpayload = JSON.parse(String(vcall?.args.p_payload_canonical ?? "{}"));
check(validated.status === "success" && vcall?.fn === "flow_validate_need" && vcall.args.p_need_id === FAKE_NEED, "validateNeedAction → RPC flow_validate_need (registrada, no ejecutada)");
check(vpayload.type === "NEED_VALIDATED" && vpayload.schoolId === CASCADA && vpayload.actorRole === "admin", "evento NEED_VALIDATED con la escuela leída de la base (no la del formulario)");
check(publishCalls.length === 1 && publishCalls[0] === vcall?.args.p_event_id && refreshCalls === 1, "publishEvent (doble) con su eventId + refresh()");
check(validated.status === "success" && validated.eventId === vcall?.args.p_event_id && /ya es pública/.test(validated.message) && !leaks(validated), `mensaje: «${validated.status === "success" ? validated.message : ""}»`);

reset(); fakeNeed = { id: FAKE_NEED, school_id: CASCADA, status: "published" };
const notPending = await validateNeedAction(IDLE, fd({ needId: FAKE_NEED }));
check(notPending.status === "error" && notPending.message === "Esta necesidad no está pendiente de validación." && rpcCalls.length === 0 && publishCalls.length === 0, "validar una publicada → INVALID_TRANSITION, 0 RPC, 0 publicación");
reset(); fakeNeed = null;
const missing = await validateNeedAction(IDLE, fd({ needId: FAKE_NEED }));
check(missing.status === "error" && missing.message === "La necesidad no existe." && rpcCalls.length === 0, "necesidad inexistente → NOT_FOUND, 0 RPC");
reset();
for (const bad of ["", "x", "'; drop table needs; --", FAKE_NEED.toUpperCase()]) {
  const r = await validateNeedAction(IDLE, fd({ needId: bad }));
  check(r.status === "error" && r.message === "Identificador de necesidad inválido." && needReads.length === 0, `needId ${JSON.stringify(bad)} → inválido, sin leer la base`);
}

reset(); fakeNeed = { id: FAKE_NEED, school_id: CASCADA, status: "pending_validation" };
const rejected = await rejectNeedAction(IDLE, fd({ needId: FAKE_NEED }));
const rcall = rpcCalls[0];
check(rejected.status === "success" && rcall?.fn === "flow_reject_need" && JSON.stringify(Object.keys(rcall.args).sort()) === JSON.stringify(["p_actor_id", "p_need_id"]) && rcall.args.p_need_id === FAKE_NEED, "rejectNeedAction → RPC flow_reject_need {p_actor_id, p_need_id}");
check(publishCalls.length === 0 && refreshCalls === 1, "rechazo: 0 publicaciones en Hedera + refresh()");
check(rejected.status === "success" && rejected.eventId === null && rejected.publication === "none" && /no se publica en Hedera/.test(rejected.message), `mensaje: «${rejected.status === "success" ? rejected.message : ""}»`);
reset(); fakeNeed = { id: FAKE_NEED, school_id: CASCADA, status: "cancelled" };
const rejTwice = await rejectNeedAction(IDLE, fd({ needId: FAKE_NEED }));
check(rejTwice.status === "error" && rejTwice.message === "Esta necesidad no está pendiente de validación." && rpcCalls.length === 0, "no aprobar una ya revisada → INVALID_TRANSITION, 0 RPC");
reset(); fakeNeed = { id: FAKE_NEED, school_id: CASCADA, status: "pending_validation" }; rpcResult = { error: { message: "INVALID_TRANSITION: Esta necesidad no está pendiente de validación.", hint: "INVALID_TRANSITION" } };
const race = await rejectNeedAction(IDLE, fd({ needId: FAKE_NEED }));
check(race.status === "error" && race.message === "Esta necesidad no está pendiente de validación." && refreshCalls === 0, "carrera (la RPC rechaza) → mensaje de negocio, sin refresh");
await session.auth.signOut({ scope: "local" });

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
