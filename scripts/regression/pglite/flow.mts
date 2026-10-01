// Pruebas de la migración 3 en PGlite (Postgres en WASM), sin tocar Supabase remoto.
// Los eventos se construyen con la biblioteca REAL del proyecto (buildEvent),
// así la base verifica hashes calculados por el código TypeScript.
// Regresión del repositorio (B5.1): Postgres en memoria (PGlite) con las migraciones y el seed
// del proyecto. No usa red, Supabase remoto ni Hedera; no necesita secretos.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { buildEvent, type BuildEventInput } from "@/lib/events/build";
import { sha256Hex } from "@/lib/events/hash";

const root = join(process.cwd(), "supabase");
const db = new PGlite({ extensions: { pgcrypto } });

// --- Stubs de Supabase: roles, auth, storage y privilegios por defecto -------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
`);

for (const f of readdirSync(join(root, "migrations")).sort()) {
  await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  console.log("✓ migración", f);
}
await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
console.log("✓ seed.sql\n");

// --- Utilidades ---------------------------------------------------------------
let failures = 0;
let passes = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(cond ? "✓" : "✗", name, cond ? "" : extra);
  if (cond) passes++;
  else failures++;
};
const q = async <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows;

type Hint = { hint?: string; message?: string };
async function asRole<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
async function rpc(fn: string, args: unknown[]) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return asRole("service_role", async () => (await q<{ r: Record<string, unknown> }>(`select public.${fn}(${placeholders}) as r`, args))[0].r);
}
async function expectFail(name: string, code: string, run: () => Promise<unknown>) {
  try {
    await run();
    check(name, false, "(no falló)");
  } catch (e) {
    const err = e as Hint;
    check(`${name} → ${err.hint ?? "?"}`, err.hint === code, `(esperado ${code}; mensaje: ${err.message})`);
  }
}

const A = "00000000-0000-4000-a000-00000000000a";
const B = "00000000-0000-4000-a000-00000000000b";

async function user(email: string, role: string, school: string | null) {
  const [u] = await q<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  await q(`update public.profiles set role = $1, school_id = $2 where id = $3`, [role, school, u.id]);
  return u.id;
}
const admin = await user("admin@demo.test", "admin", null);
const repA = await user("rep-a@demo.test", "school_rep", A);
const repB = await user("rep-b@demo.test", "school_rep", B);
const sup1 = await user("aliado1@demo.test", "supporter", null);
const sup2 = await user("aliado2@demo.test", "supporter", null);

const ev = (input: Omit<BuildEventInput, "actorRole"> & { actorRole?: BuildEventInput["actorRole"] }) => {
  const roles = {
    NEED_CREATED: "school_rep",
    NEED_VALIDATED: "admin",
    COMMITMENT_CREATED: "supporter",
    DELIVERY_REPORTED: "supporter",
    SCHOOL_CONFIRMED: "school_rep",
  } as const;
  return buildEvent({ actorRole: roles[input.type], ...input } as BuildEventInput);
};

async function createNeed(actor: string, school: string, goal = 5, category = "materiales") {
  const needId = randomUUID();
  const e = ev({ type: "NEED_CREATED", needId, schoolId: school });
  const r = await rpc("flow_create_need", [
    actor, needId, school, "need", "Kits escolares (DEMO)", "", category, "media", goal, "kits", null,
    e.payload.eventId, e.payloadCanonical, e.payloadHash,
  ]);
  return { needId, event: e, r };
}
const validate = (actor: string, needId: string, school = A) => {
  const e = ev({ type: "NEED_VALIDATED", needId, schoolId: school });
  return rpc("flow_validate_need", [actor, needId, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
};
const commit = async (actor: string, needId: string, qty: number, school = A) => {
  const commitmentId = randomUUID();
  const e = ev({ type: "COMMITMENT_CREATED", needId, schoolId: school, commitmentId });
  const r = await rpc("flow_create_commitment", [actor, commitmentId, needId, qty, null, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
  return { commitmentId, r };
};
const report = (actor: string, needId: string, commitmentId: string, note: string | null = null, school = A) => {
  const e = ev({ type: "DELIVERY_REPORTED", needId, schoolId: school, commitmentId });
  return rpc("flow_report_delivery", [actor, commitmentId, note, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
};
const confirm = (actor: string, needId: string, commitmentId: string, school = A) => {
  const e = ev({ type: "SCHOOL_CONFIRMED", needId, schoolId: school, commitmentId });
  return rpc("flow_confirm_receipt", [actor, commitmentId, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
};
const needStatus = async (id: string) => (await q<{ status: string }>(`select status from public.needs where id = $1`, [id]))[0]?.status;
const commitmentStatus = async (id: string) =>
  (await q<{ status: string }>(`select status from public.commitments where id = $1`, [id]))[0]?.status;
const eventCount = async (needId?: string) =>
  (await q<{ n: number }>(`select count(*)::int n from public.hedera_events ${needId ? "where need_id = $1" : ""}`, needId ? [needId] : []))[0].n;

// =============================================================================
console.log("── 1. Categorías");
const cats = (await q<{ e: string }>(`select unnest(enum_range(null::public.need_category))::text e`)).map((r) => r.e);
check("exactamente las 6 categorías aprobadas", JSON.stringify(cats) === JSON.stringify(["infraestructura", "materiales", "alimentacion", "conectividad", "transporte", "actividad_comunitaria"]), JSON.stringify(cats));
check("no queda el tipo antiguo", (await q(`select 1 from pg_type where typname = 'need_category_old'`)).length === 0);
try {
  await createNeed(repA, A, 5, "mobiliario");
  check("categoría eliminada (mobiliario) rechazada", false, "(se aceptó)");
} catch (e) {
  check("categoría eliminada (mobiliario) rechazada", /invalid input value for enum/.test((e as Hint).message ?? ""), (e as Hint).message);
}

// =============================================================================
console.log("\n── 2. Flujo completo (2 aliados, meta 5)");
const n1 = await createNeed(repA, A, 5);
check("NEED_CREATED → pending_validation", (await needStatus(n1.needId)) === "pending_validation");
await validate(admin, n1.needId);
check("NEED_VALIDATED → published", (await needStatus(n1.needId)) === "published");
const c1 = await commit(sup1, n1.needId, 3);
const c2 = await commit(sup2, n1.needId, 2);
check("COMMITMENT_CREATED ×2 → committed", (await commitmentStatus(c1.commitmentId)) === "committed" && (await commitmentStatus(c2.commitmentId)) === "committed");
await report(sup1, n1.needId, c1.commitmentId, "  Entregado en la sede (nota DEMO)  ");
check("DELIVERY_REPORTED → delivery_reported", (await commitmentStatus(c1.commitmentId)) === "delivery_reported");
const note = (await q<{ delivery_note: string }>(`select delivery_note from public.commitments where id = $1`, [c1.commitmentId]))[0].delivery_note;
check("la nota se guarda recortada en Supabase", note === "Entregado en la sede (nota DEMO)");
const noteInEvents = (await q(`select 1 from public.hedera_events where payload_canonical like '%Entregado%'`)).length;
check("la nota NO aparece en ningún payload de evento", noteInEvents === 0);
const r1 = await confirm(repA, n1.needId, c1.commitmentId);
check("SCHOOL_CONFIRMED → confirmed (3/5, la necesidad sigue published)", (await commitmentStatus(c1.commitmentId)) === "confirmed" && (await needStatus(n1.needId)) === "published" && r1.needCompleted === false);
await report(sup2, n1.needId, c2.commitmentId);
const r2 = await confirm(repA, n1.needId, c2.commitmentId);
check("segunda confirmación (5/5) → necesidad completed automáticamente", (await needStatus(n1.needId)) === "completed" && r2.needCompleted === true);
check("completed_at registrado", (await q(`select 1 from public.needs where id = $1 and completed_at is not null`, [n1.needId])).length === 1);
check("8 eventos (2 de necesidad + 3×2 de compromisos), todos pending", (await eventCount(n1.needId)) === 8 && (await q(`select 1 from public.hedera_events where need_id = $1 and submission_status <> 'pending'`, [n1.needId])).length === 0);
const hashesOk = (await q<{ payload_canonical: string; payload_hash: string }>(`select payload_canonical, payload_hash from public.hedera_events`)).every((r) => sha256Hex(r.payload_canonical) === r.payload_hash);
check("todos los hashes guardados = SHA-256 (TS) del canónico guardado", hashesOk);
const progress = (await q<{ c: string; f: string }>(`select committed_quantity::text c, confirmed_quantity::text f from public.need_progress where need_id = $1`, [n1.needId]))[0];
check("need_progress: comprometido 5, confirmado 5", progress.c === "5.00" && progress.f === "5.00", JSON.stringify(progress));

// =============================================================================
console.log("\n── 3. Permisos y transiciones inválidas (RPC)");
await expectFail("admin intentando crear una necesidad", "FORBIDDEN_ROLE", () => createNeed(admin, A));
await expectFail("supporter intentando crear una necesidad", "FORBIDDEN_ROLE", () => createNeed(sup1, A));
await expectFail("representante de otra escuela creando necesidad", "NOT_SCHOOL_MEMBER", () => createNeed(repB, A));
await expectFail("actor inexistente", "ACTOR_NOT_FOUND", () => createNeed(randomUUID(), A));
await expectFail("meta con 3 decimales", "INVALID_QUANTITY", () => createNeed(repA, A, 1.234));

const n2 = await createNeed(repA, A, 10);
await expectFail("school_rep intentando validar", "FORBIDDEN_ROLE", () => validate(repA, n2.needId));
await expectFail("supporter intentando validar", "FORBIDDEN_ROLE", () => validate(sup1, n2.needId));
await expectFail("compromiso sobre necesidad no publicada", "NEED_NOT_OPEN", () => commit(sup1, n2.needId, 1));
await validate(admin, n2.needId);
await expectFail("validar dos veces", "INVALID_TRANSITION", () => validate(admin, n2.needId));
await expectFail("admin intentando comprometerse", "FORBIDDEN_ROLE", () => commit(admin, n2.needId, 1));
await expectFail("school_rep intentando comprometerse", "FORBIDDEN_ROLE", () => commit(repA, n2.needId, 1));
await expectFail("cantidad cero", "INVALID_QUANTITY", () => commit(sup1, n2.needId, 0));
await expectFail("cantidad con 3 decimales", "INVALID_QUANTITY", () => commit(sup1, n2.needId, 1.005));
const c3 = await commit(sup1, n2.needId, 7);
await expectFail("cantidad que supera lo disponible (quedan 3, pide 4)", "QUANTITY_EXCEEDS_AVAILABLE", () => commit(sup2, n2.needId, 4));
await expectFail("confirmar sin entrega reportada (saltar a SCHOOL_CONFIRMED)", "INVALID_TRANSITION", () => confirm(repA, n2.needId, c3.commitmentId));
await expectFail("supporter reportando la entrega de otro supporter", "NOT_COMMITMENT_OWNER", () => report(sup2, n2.needId, c3.commitmentId));
await expectFail("admin reportando entrega", "FORBIDDEN_ROLE", () => report(admin, n2.needId, c3.commitmentId));
await report(sup1, n2.needId, c3.commitmentId);
await expectFail("reportar dos veces", "INVALID_TRANSITION", () => report(sup1, n2.needId, c3.commitmentId));
await expectFail("supporter intentando confirmar (su propio compromiso)", "FORBIDDEN_ROLE", () => confirm(sup1, n2.needId, c3.commitmentId));
await expectFail("admin intentando confirmar", "FORBIDDEN_ROLE", () => confirm(admin, n2.needId, c3.commitmentId));
await expectFail("school_rep de otra escuela intentando confirmar", "NOT_SCHOOL_MEMBER", () => confirm(repB, n2.needId, c3.commitmentId));
await confirm(repA, n2.needId, c3.commitmentId);
await expectFail("confirmar dos veces", "INVALID_TRANSITION", () => confirm(repA, n2.needId, c3.commitmentId));
check("7/10 confirmado: la necesidad sigue published", (await needStatus(n2.needId)) === "published");
await expectFail("necesidad completada que recibe un nuevo compromiso", "NEED_NOT_OPEN", () => commit(sup2, n1.needId, 1));

// =============================================================================
console.log("\n── 4. Rechazo (sin evento HCS)");
const n3 = await createNeed(repA, A, 2);
const before = await eventCount(n3.needId);
await expectFail("school_rep intentando rechazar", "FORBIDDEN_ROLE", () => rpc("flow_reject_need", [repA, n3.needId]));
await rpc("flow_reject_need", [admin, n3.needId]);
check("rechazo → cancelled", (await needStatus(n3.needId)) === "cancelled");
check("el rechazo no genera evento; NEED_CREATED se conserva", (await eventCount(n3.needId)) === before && before === 1);
await expectFail("necesidad cancelada que recibe un nuevo compromiso", "NEED_NOT_OPEN", () => commit(sup1, n3.needId, 1));
await expectFail("validar una necesidad cancelada", "INVALID_TRANSITION", () => validate(admin, n3.needId));
await expectFail("rechazar una necesidad publicada", "INVALID_TRANSITION", () => rpc("flow_reject_need", [admin, n2.needId]));

// =============================================================================
console.log("\n── 5. Integridad del evento (payload + SHA-256) y atomicidad");
const n4 = await createNeed(repA, A, 3);
const good = ev({ type: "NEED_VALIDATED", needId: n4.needId, schoolId: A });
const callValidate = (eventId: string, canonical: string, hash: string) =>
  rpc("flow_validate_need", [admin, n4.needId, eventId, canonical, hash]);

await expectFail("hash que no corresponde al payload", "INVALID_EVENT", () => callValidate(good.payload.eventId, good.payloadCanonical, sha256Hex("otra cosa")));
await expectFail("hash con formato inválido", "INVALID_EVENT", () => callValidate(good.payload.eventId, good.payloadCanonical, "ABC"));
const otherNeed = ev({ type: "NEED_VALIDATED", needId: n2.needId, schoolId: A });
await expectFail("payload válido pero de OTRA necesidad", "INVALID_EVENT", () => callValidate(otherNeed.payload.eventId, otherNeed.payloadCanonical, otherNeed.payloadHash));
const wrongSchool = ev({ type: "NEED_VALIDATED", needId: n4.needId, schoolId: B });
await expectFail("payload con escuela distinta a la de la necesidad", "INVALID_EVENT", () => callValidate(wrongSchool.payload.eventId, wrongSchool.payloadCanonical, wrongSchool.payloadHash));
const wrongType = ev({ type: "NEED_CREATED", needId: n4.needId, schoolId: A });
await expectFail("payload de otro tipo de evento (NEED_CREATED en validar)", "INVALID_EVENT", () => callValidate(wrongType.payload.eventId, wrongType.payloadCanonical, wrongType.payloadHash));
await expectFail("eventId del parámetro distinto al del payload", "INVALID_EVENT", () => callValidate(randomUUID(), good.payloadCanonical, good.payloadHash));
const extra = good.payloadCanonical.replace('{"actorRole"', '{"a_title":"Kits","actorRole"');
await expectFail("payload con campo extra (título), hash recalculado", "INVALID_EVENT", () => callValidate(good.payload.eventId, extra, sha256Hex(extra)));
const old = ev({ type: "NEED_VALIDATED", needId: n4.needId, schoolId: A, now: new Date(Date.now() - 60 * 60 * 1000) });
await expectFail("timestamp de hace 1 hora (fuera de ventana)", "INVALID_EVENT", () => callValidate(old.payload.eventId, old.payloadCanonical, old.payloadHash));
await expectFail("payload que no es JSON (hash coherente)", "INVALID_EVENT", () => callValidate(good.payload.eventId, "no-json", sha256Hex("no-json")));
check("ATOMICIDAD: tras 9 intentos fallidos la necesidad sigue pending_validation", (await needStatus(n4.needId)) === "pending_validation");
check("ATOMICIDAD: y no se insertó ningún NEED_VALIDATED", (await q(`select 1 from public.hedera_events where need_id = $1 and event_type = 'NEED_VALIDATED'`, [n4.needId])).length === 0);
await callValidate(good.payload.eventId, good.payloadCanonical, good.payloadHash);
check("con el evento correcto la validación funciona", (await needStatus(n4.needId)) === "published");

const n5 = await createNeed(repA, A, 3);
await expectFail("reutilizar un eventId ya registrado", "DUPLICATE_EVENT", () => callValidateReuse());
async function callValidateReuse() {
  // Mismo eventId que un evento existente (good), pero payload válido para n5.
  const dup = ev({ type: "NEED_VALIDATED", needId: n5.needId, schoolId: A, eventId: good.payload.eventId });
  return rpc("flow_validate_need", [admin, n5.needId, dup.payload.eventId, dup.payloadCanonical, dup.payloadHash]);
}
check("…y la necesidad no cambió de estado", (await needStatus(n5.needId)) === "pending_validation");

// =============================================================================
console.log("\n── 6. Guards y anti-duplicados a nivel de tabla (aunque se salten las RPC)");
const guard = async (name: string, sql: string, params: unknown[], pattern: RegExp) => {
  try {
    await asRole("service_role", () => q(sql, params));
    check(name, false, "(no falló)");
  } catch (e) {
    const m = (e as Hint).message ?? "";
    check(`${name} → ${m.split(":")[0]}`, pattern.test(m), m);
  }
};
const c4 = await commit(sup2, n2.needId, 1); // compromiso 'committed' para probar el guard
await guard("UPDATE directo committed → confirmed", `update public.commitments set status = 'confirmed' where id = $1`, [c4.commitmentId], /INVALID_TRANSITION/);
await guard("UPDATE directo confirmed → committed (retroceso)", `update public.commitments set status = 'committed' where id = $1`, [c3.commitmentId], /INVALID_TRANSITION/);
await guard("UPDATE directo pending_validation → completed", `update public.needs set status = 'completed' where id = $1`, [n5.needId], /INVALID_TRANSITION/);
await guard("UPDATE directo completed → published", `update public.needs set status = 'published' where id = $1`, [n1.needId], /INVALID_TRANSITION/);
await guard("INSERT directo de necesidad ya published", `insert into public.needs (school_id, title, category, goal_quantity, goal_unit, status) values ($1, 'x x', 'materiales', 1, 'u', 'published')`, [A], /INVALID_TRANSITION/);
await guard("INSERT directo de compromiso ya confirmed", `insert into public.commitments (need_id, supporter_id, quantity, status) values ($1, $2, 1, 'confirmed')`, [n2.needId, sup1], /INVALID_TRANSITION/);
const someHash = "a".repeat(64);
await guard("INSERT directo de 2º NEED_VALIDATED para la misma necesidad", `insert into public.hedera_events (event_type, need_id, school_id, actor_role, payload, payload_canonical, payload_hash) values ('NEED_VALIDATED', $1, $2, 'admin', '{}', '{}', $3)`, [n1.needId, A, someHash], /hedera_events_need_event_uniq/);
await guard("INSERT directo de 2º SCHOOL_CONFIRMED para el mismo compromiso", `insert into public.hedera_events (event_type, need_id, school_id, commitment_id, actor_role, payload, payload_canonical, payload_hash) values ('SCHOOL_CONFIRMED', $1, $2, $3, 'school_rep', '{}', '{}', $4)`, [n1.needId, A, c1.commitmentId, someHash], /hedera_events_commitment_event_uniq/);
await guard("evento de necesidad CON commitment_id", `insert into public.hedera_events (event_type, need_id, school_id, commitment_id, actor_role, payload, payload_canonical, payload_hash) values ('NEED_CREATED', $1, $2, $3, 'school_rep', '{}', '{}', $4)`, [n5.needId, A, c1.commitmentId, someHash], /hedera_events_commitment_matches_type/);
await guard("evento de compromiso SIN commitment_id", `insert into public.hedera_events (event_type, need_id, school_id, actor_role, payload, payload_canonical, payload_hash) values ('DELIVERY_REPORTED', $1, $2, 'supporter', '{}', '{}', $3)`, [n5.needId, A, someHash], /hedera_events_commitment_matches_type/);

// =============================================================================
console.log("\n── 7. Permisos de ejecución y RLS");
for (const role of ["anon", "authenticated"]) {
  try {
    await asRole(role, () => q(`select public.flow_reject_need($1, $2)`, [admin, n5.needId]));
    check(`${role} NO puede ejecutar flow_*`, false, "(pudo ejecutar)");
  } catch (e) {
    check(`${role} NO puede ejecutar flow_* → permission denied`, /permission denied/.test((e as Hint).message ?? ""));
  }
}
const fnCount = (await q<{ n: number }>(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'flow\\_%'`))[0].n;
const exposed = (await q<{ f: string }>(`
  select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'flow\\_%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).map((r) => r.f);
check(`ninguna de las ${fnCount} funciones flow_* es ejecutable por anon/authenticated`, exposed.length === 0, exposed.join(","));
const svc = (await q<{ n: number }>(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'flow\\_%' and has_function_privilege('service_role', p.oid, 'execute')`))[0].n;
check("service_role puede ejecutar todas", svc === fnCount);
await db.exec(`set role anon`);
const anonNeeds = (await q<{ status: string }>(`select status from public.needs`)).map((r) => r.status);
await db.exec(`reset role`);
check("RLS intacta: anon solo ve published/completed", anonNeeds.length > 0 && anonNeeds.every((s) => s === "published" || s === "completed"), JSON.stringify(anonNeeds));

console.log(`\n${passes} OK, ${failures} FALLOS`);
process.exit(failures ? 1 : 0);
