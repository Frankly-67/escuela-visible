// B4 — Server Actions REALES (createCommitmentAction, reportDeliveryAction,
// confirmReceiptAction) con las funciones de flow REALES. Sin escrituras:
//  - createClient (sesión): supabase-js con sesión DEMO real (solo Auth).
//  - createAdminClient: envoltorio. `profiles` real (solo lectura, requireActor);
//    needs / need_progress / commitments devuelven filas FICTICIAS; `rpc` solo se REGISTRA.
//  - publishEvent: doble (no publica). redirect / refresh: dobles.
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
type Row = Record<string, unknown>;
const fake: { needs: Row[]; progress: Row[]; commitments: Row[] } = { needs: [], progress: [], commitments: [] };
const reads: string[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcResult: { data?: unknown; error: { message: string; hint?: string | null } | null } = { data: null, error: null };
const publishCalls: string[] = [];
let publishImpl: (id: string) => Promise<unknown> = async () => ({ status: "submitted", sequenceNumber: 99, transactionId: null, consensusTimestamp: null, reconciled: false });
let refreshCalls = 0;

const fakeQuery = (table: string, rows: () => Row[]) => {
  const filters: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); reads.push(`${table}.${c}=${v}`); return q; },
    maybeSingle: async () => ({ data: rows().find((r) => filters.every(([c, v]) => r[c] === v)) ?? null, error: null }),
  };
  return q;
};
const adminWrapper = {
  from: (table: string) => {
    if (table === "profiles") return realAdmin.from("profiles");
    if (table === "needs") return fakeQuery("needs", () => fake.needs);
    if (table === "need_progress") return fakeQuery("need_progress", () => fake.progress);
    if (table === "commitments") return fakeQuery("commitments", () => fake.commitments);
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

const { createCommitmentAction, reportDeliveryAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/aliado/actions.ts`).href);
const { confirmReceiptAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/escuela/actions.ts`).href);

let ok = true;
const check = (c: boolean, t: string) => { ok &&= c; console.log(`${c ? "✓" : "✗"} ${t}`); };
const IDLE = { status: "idle" };
const fd = (fields: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
const redirectOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; return d.startsWith("NEXT_REDIRECT") ? d.split(";")[2] : `ERROR ${(e as Error).message}`; }
};
async function signIn(local: string | null) {
  session = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!local) return;
  const { error } = await session.auth.signInWithPassword({ email: `${local}@${D}`, password: process.env.DEMO_ACCOUNT_PASSWORD });
  if (error) throw new Error(`no se pudo iniciar sesión (${local})`);
}

const { data: schools } = await realAdmin.from("schools").select("id, slug");
const schoolOf = (slug: string) => schools!.find((s: { slug: string }) => s.slug === `escuela-demo-${slug}`)!.id as string;
const CASCADA = schoolOf("la-cascada"), MIRADOR = schoolOf("el-mirador");
const { data: profiles } = await realAdmin.from("profiles").select("id, role, school_id");
const PERSONS: string[] = profiles!.map((p: { id: string }) => p.id);
const SUPPORTER = profiles!.find((p: { role: string }) => p.role === "supporter")!.id as string;
const CASCADA_REP = profiles!.find((p: { role: string; school_id: string | null }) => p.role === "school_rep" && p.school_id === CASCADA)!.id as string;
const OTHER_SUPPORTER = "dddddddd-0000-4000-8000-0000000000b4";
const NEED = "aaaaaaaa-0000-4000-8000-0000000000b4";
const COMMIT = "cccccccc-0000-4000-8000-0000000000b4";

const setNeed = (status: string, committed = 0) => {
  fake.needs = [{ id: NEED, school_id: CASCADA, status, goal_quantity: 30 }];
  fake.progress = [{ need_id: NEED, committed_quantity: committed }];
};
const setCommitment = (status: string, supporter = SUPPORTER) => { fake.commitments = [{ id: COMMIT, need_id: NEED, supporter_id: supporter, status, quantity: 30 }]; };
const reset = () => {
  rpcCalls.length = 0; publishCalls.length = 0; reads.length = 0; refreshCalls = 0;
  rpcResult = { data: null, error: null }; fake.needs = []; fake.progress = []; fake.commitments = [];
  publishImpl = async () => ({ status: "submitted", sequenceNumber: 99, transactionId: null, consensusTimestamp: null, reconciled: false });
};
const leaks = (s: unknown) => { const j = JSON.stringify(s); return PERSONS.some((p) => j.includes(p)) || j.includes(OTHER_SUPPORTER) || /supabase|operator|gRPC|submission_error|10\.0\.0|@/i.test(j); };
const payloadOf = (i = 0) => JSON.parse(String(rpcCalls[i]?.args.p_payload_canonical ?? "{}"));
const COMMIT_FORM = { needId: NEED, quantity: "30" };

console.log("── Sin sesión y roles incorrectos");
await signIn(null); reset();
for (const [n, fn] of [["createCommitmentAction", () => createCommitmentAction(IDLE, fd(COMMIT_FORM))], ["reportDeliveryAction", () => reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT }))], ["confirmReceiptAction", () => confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT }))]] as const) {
  check((await redirectOf(fn)) === "/ingresar", `${n} sin sesión → /ingresar`);
}
for (const [local, panel] of [["admin", "/panel/admin"], ["la-cascada", "/panel/escuela"]] as const) {
  await signIn(local); reset(); setNeed("published"); setCommitment("committed");
  check((await redirectOf(() => createCommitmentAction(IDLE, fd(COMMIT_FORM)))) === panel, `${local} → createCommitmentAction → ${panel}`);
  check((await redirectOf(() => reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT })))) === panel, `${local} → reportDeliveryAction → ${panel}`);
}
await signIn("admin"); reset(); setNeed("published"); setCommitment("delivery_reported");
check((await redirectOf(() => confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT })))) === "/panel/admin", "admin → confirmReceiptAction → /panel/admin (sin atajo)");
await signIn("aliado");
check((await redirectOf(() => confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT })))) === "/panel/aliado", "aliado → confirmReceiptAction → /panel/aliado (no puede confirmar)");
check(rpcCalls.length === 0 && publishCalls.length === 0, "roles incorrectos: 0 RPC, 0 publicaciones");

console.log("── Aliado: crear compromiso");
reset(); setNeed("published", 0);
const created = await createCommitmentAction(IDLE, fd({ ...COMMIT_FORM, supporterId: OTHER_SUPPORTER, userId: OTHER_SUPPORTER, schoolId: MIRADOR, role: "admin", note: "nota privada" }));
const c0 = rpcCalls[0];
check(created.status === "success" && c0?.fn === "flow_create_commitment" && rpcCalls.length === 1, "→ 1 RPC flow_create_commitment (registrada, no ejecutada)");
check(c0?.args.p_actor_id === SUPPORTER && c0.args.p_need_id === NEED && c0.args.p_quantity === 30 && c0.args.p_note === null, "p_actor_id = aliado en sesión (supporterId/userId del formulario ignorados), cantidad 30, nota null");
check(payloadOf().type === "COMMITMENT_CREATED" && payloadOf().schoolId === CASCADA && payloadOf().actorRole === "supporter" && payloadOf().commitmentId === c0?.args.p_commitment_id, "evento COMMITMENT_CREATED: escuela leída de la base (no la del formulario), rol supporter, commitmentId");
check(JSON.stringify(Object.keys(payloadOf()).sort()) === JSON.stringify(["actorRole", "app", "commitmentId", "eventId", "needId", "schoolId", "timestamp", "type", "v"]) && !String(c0?.args.p_payload_canonical).includes("nota"), "payload: exactamente los 9 campos (sin cantidad, notas ni identidad)");
check(publishCalls.length === 1 && publishCalls[0] === c0?.args.p_event_id, "publishEvent (doble) con el eventId registrado");
check(created.status === "success" && created.message === "Compromiso registrado. El registro de este paso ya está publicado en Hedera." && created.eventId === c0?.args.p_event_id && !leaks(created), `mensaje: «${created.status === "success" ? created.message : ""}»`);

reset(); setNeed("published", 25);
const over = await createCommitmentAction(IDLE, fd({ needId: NEED, quantity: "10" }));
check(over.status === "error" && over.message === "La cantidad supera lo disponible (5)." && over.quantity === "10" && rpcCalls.length === 0, `cantidad > disponible → «${over.status === "error" ? over.message : ""}», 0 RPC`);
reset(); setNeed("published", 0);
const zero = await createCommitmentAction(IDLE, fd({ needId: NEED, quantity: "0" }));
check(zero.status === "error" && /mayor que cero/.test(zero.message) && rpcCalls.length === 0, `cantidad 0 → «${zero.status === "error" ? zero.message : ""}»`);
const dec = await createCommitmentAction(IDLE, fd({ needId: NEED, quantity: "1,234" }));
check(dec.status === "error" && /decimales/.test(dec.message) && rpcCalls.length === 0, `3 decimales → «${dec.status === "error" ? dec.message : ""}»`);
const txt = await createCommitmentAction(IDLE, fd({ needId: NEED, quantity: "muchos" }));
check(txt.status === "error" && /número/.test(txt.message) && rpcCalls.length === 0 && reads.length === 0, "cantidad no numérica → error sin leer la base");
for (const bad of ["", "x", NEED.toUpperCase()]) {
  const r = await createCommitmentAction(IDLE, fd({ needId: bad, quantity: "5" }));
  check(r.status === "error" && r.message === "Identificador de necesidad inválido." && reads.length === 0, `needId ${JSON.stringify(bad)} → inválido sin leer la base`);
}
reset(); setNeed("cancelled");
const closed = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(closed.status === "error" && closed.message === "Esta necesidad no está abierta a compromisos." && rpcCalls.length === 0, "necesidad cancelada → NEED_NOT_OPEN, 0 RPC");
reset(); setNeed("completed");
check((await createCommitmentAction(IDLE, fd(COMMIT_FORM))).status === "error" && rpcCalls.length === 0, "necesidad completada → NEED_NOT_OPEN, 0 RPC");
reset();
const missing = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(missing.status === "error" && missing.message === "La necesidad no existe." && rpcCalls.length === 0, "necesidad inexistente → NOT_FOUND");
reset(); setNeed("published", 0); rpcResult = { data: null, error: { message: "QUANTITY_EXCEEDS_AVAILABLE: La cantidad supera lo disponible (0).", hint: "QUANTITY_EXCEEDS_AVAILABLE" } };
const race = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(race.status === "error" && race.message === "La cantidad supera lo disponible (0)." && publishCalls.length === 0, "carrera (la RPC recalcula con bloqueo) → mensaje de negocio, sin publicar");
reset(); setNeed("published", 0); rpcResult = { data: null, error: { message: "deadlock detected at 10.0.0.1", hint: null } };
const unknown = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(unknown.status === "error" && unknown.message === "No se pudo completar la operación. Intenta de nuevo." && !leaks(unknown) && publishCalls.length === 0, "error interno de la RPC → genérico");
reset(); setNeed("published", 0); publishImpl = async () => ({ status: "failed", error: "INSUFFICIENT_PAYER_BALANCE" });
const pend = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(pend.status === "success" && pend.publication === "pending" && pend.message === "El compromiso quedó registrado. La publicación en Hedera está pendiente." && !/INSUFFICIENT/.test(JSON.stringify(pend)), "publishEvent failed → «La publicación en Hedera está pendiente»");
reset(); setNeed("published", 0); publishImpl = async () => { throw new Error("gRPC UNAVAILABLE operator key"); };
const thrown = await createCommitmentAction(IDLE, fd(COMMIT_FORM));
check(thrown.status === "success" && thrown.publication === "pending" && !leaks(thrown), "publishEvent lanza → pendiente, sin detalles");

console.log("── Aliado: reportar entrega");
reset(); setNeed("published", 30); setCommitment("committed");
const reported = await reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT, supporterId: OTHER_SUPPORTER, deliveryNote: "nota privada" }));
const r0 = rpcCalls[0];
check(reported.status === "success" && r0?.fn === "flow_report_delivery" && r0.args.p_actor_id === SUPPORTER && r0.args.p_commitment_id === COMMIT && r0.args.p_delivery_note === null, "→ RPC flow_report_delivery: actor en sesión, nota null (deliveryNote del formulario ignorada)");
check(payloadOf().type === "DELIVERY_REPORTED" && payloadOf().actorRole === "supporter" && payloadOf().commitmentId === COMMIT && payloadOf().schoolId === CASCADA, "evento DELIVERY_REPORTED con escuela de la base");
check(publishCalls.length === 1 && refreshCalls === 0, "publishEvent (doble); sin refresh");
check(reported.status === "success" && reported.message.startsWith("Entrega reportada. La escuela debe confirmar la recepción.") && !leaks(reported), `mensaje: «${reported.status === "success" ? reported.message : ""}»`);
reset(); setNeed("published", 30); setCommitment("committed", OTHER_SUPPORTER);
const notOwner = await reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT }));
check(notOwner.status === "error" && notOwner.message === "Solo puedes reportar la entrega de tus propios compromisos." && rpcCalls.length === 0 && !leaks(notOwner), "compromiso de otro aliado → NOT_COMMITMENT_OWNER, 0 RPC");
for (const st of ["delivery_reported", "confirmed"]) {
  reset(); setNeed("published", 30); setCommitment(st);
  const r = await reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT }));
  check(r.status === "error" && r.message === "La entrega de este compromiso ya fue reportada o cerrada." && rpcCalls.length === 0, `reportar desde ${st} → INVALID_TRANSITION`);
}
reset();
check((await reportDeliveryAction(IDLE, fd({ commitmentId: "x" }))).status === "error" && reads.length === 0, "commitmentId inválido → error sin leer la base");
check((await reportDeliveryAction(IDLE, fd({ commitmentId: COMMIT }))).status === "error" && rpcCalls.length === 0, "compromiso inexistente → NOT_FOUND");

console.log("── Escuela: confirmar recepción");
await signIn("la-cascada");
reset(); setNeed("published", 30); setCommitment("delivery_reported"); rpcResult = { data: { needCompleted: true }, error: null };
const confirmed = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT, schoolId: MIRADOR, role: "admin" }));
const k0 = rpcCalls[0];
check(confirmed.status === "success" && k0?.fn === "flow_confirm_receipt" && k0.args.p_actor_id === CASCADA_REP && k0.args.p_commitment_id === COMMIT, "→ RPC flow_confirm_receipt con el representante en sesión");
check(payloadOf().type === "SCHOOL_CONFIRMED" && payloadOf().actorRole === "school_rep" && payloadOf().schoolId === CASCADA, "evento SCHOOL_CONFIRMED, rol school_rep, escuela de la base (no la del formulario)");
check(confirmed.status === "success" && confirmed.needCompleted === true && confirmed.message.includes("Recepción confirmada por la escuela.") && confirmed.message.includes("La necesidad alcanzó su meta y quedó completada.") && publishCalls.length === 1 && !leaks(confirmed), `needCompleted → «${confirmed.status === "success" ? confirmed.message : ""}»`);
reset(); setNeed("published", 30); setCommitment("delivery_reported"); rpcResult = { data: { needCompleted: false }, error: null }; publishImpl = async () => ({ status: "retry_later", detail: "x" });
const partial = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT }));
check(partial.status === "success" && partial.needCompleted === false && !partial.message.includes("completada") && /pendiente/.test(partial.message), "sin completar y publicación pendiente → mensaje honesto");
reset(); setNeed("published", 30); setCommitment("committed");
const skip = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT }));
check(skip.status === "error" && skip.message === "El aliado todavía no ha reportado la entrega." && rpcCalls.length === 0, "committed → confirmed BLOQUEADO (INVALID_TRANSITION), 0 RPC");
reset(); setNeed("published", 30); setCommitment("confirmed");
const twice = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT }));
check(twice.status === "error" && twice.message === "Esta recepción ya fue confirmada o el compromiso está cerrado." && rpcCalls.length === 0, "confirmar dos veces → INVALID_TRANSITION");
reset(); setNeed("published", 30); setCommitment("delivery_reported"); rpcResult = { data: null, error: { message: "INVALID_TRANSITION: Esta recepción ya fue confirmada o el compromiso está cerrado.", hint: "INVALID_TRANSITION" } };
const raceC = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT }));
check(raceC.status === "error" && raceC.message === "Esta recepción ya fue confirmada o el compromiso está cerrado." && publishCalls.length === 0, "carrera (la RPC rechaza la segunda confirmación) → mensaje, sin publicar");
await signIn("el-mirador");
reset(); setNeed("published", 30); setCommitment("delivery_reported");
const otherSchool = await confirmReceiptAction(IDLE, fd({ commitmentId: COMMIT, schoolId: CASCADA }));
check(otherSchool.status === "error" && otherSchool.message === "Solo puedes confirmar recepciones de tu propia escuela." && rpcCalls.length === 0, "El Mirador confirmando un compromiso de La Cascada (aun enviando schoolId) → NOT_SCHOOL_MEMBER, 0 RPC");
reset();
check((await confirmReceiptAction(IDLE, fd({ commitmentId: "'; drop" }))).status === "error" && reads.length === 0, "commitmentId inválido → error sin leer la base");
await session.auth.signOut({ scope: "local" });

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
