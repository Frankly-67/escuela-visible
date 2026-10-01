// B1 en PGlite: las consultas EXACTAS de src/lib/data/panel.ts por rol, con dos
// escuelas y dos aliados. Base local en memoria; no toca Supabase remoto.
// Regresión del repositorio (B5.1): Postgres en memoria (PGlite) con las migraciones y el seed
// del proyecto. No usa red, Supabase remoto ni Hedera; no necesita secretos.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { buildEvent } from "@/lib/events/build";

const root = join(process.cwd(), "supabase");
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
`);
for (const f of readdirSync(join(root, "migrations")).sort()) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));

let ok = true;
const check = (c: boolean, t: string) => { ok &&= c; console.log(`${c ? "✓" : "✗"} ${t}`); };
const q = async (sql: string, p: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, p)).rows;
const [A, B] = (await q(`select id from public.schools order by slug limit 2`)).map((r) => r.id as string);
const user = async (email: string, role: string, school: string | null) => {
  const [u] = await q(`insert into auth.users (email) values ($1) returning id`, [email]);
  await q(`update public.profiles set role=$1, school_id=$2 where id=$3`, [role, school, u.id]);
  return u.id as string;
};
const admin = await user("a@x.test", "admin", null);
const repA = await user("ra@x.test", "school_rep", A), repB = await user("rb@x.test", "school_rep", B);
const sup1 = await user("s1@x.test", "supporter", null), sup2 = await user("s2@x.test", "supporter", null);
const rpc = async (fn: string, args: unknown[]) => {
  await db.exec("set role service_role");
  try { return await q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args); } finally { await db.exec("reset role"); }
};
// Escuela A: una necesidad publicada con un compromiso de sup1 en delivery_reported, y una pendiente.
const needA = randomUUID(), pendA = randomUUID(), cId = randomUUID();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (type: any, needId: string, actorRole: any, commitmentId: string | null = null) => buildEvent({ type, needId, schoolId: A, commitmentId, actorRole });
for (const id of [needA, pendA]) {
  const e = ev("NEED_CREATED", id, "school_rep");
  await rpc("flow_create_need", [repA, id, A, "need", "Kits (DEMO)", "", "materiales", "media", 20, "kits", null, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
}
let e = ev("NEED_VALIDATED", needA, "admin");
await rpc("flow_validate_need", [admin, needA, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("COMMITMENT_CREATED", needA, "supporter", cId);
await rpc("flow_create_commitment", [sup1, cId, needA, 5, "nota privada", e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("DELIVERY_REPORTED", needA, "supporter", cId);
await rpc("flow_report_delivery", [sup1, cId, "nota de entrega privada", e.payload.eventId, e.payloadCanonical, e.payloadHash]);
console.log(`datos: escuela A con 2 necesidades (1 publicada, 1 pendiente), 1 compromiso de sup1 en delivery_reported, 5 eventos\n`);

async function as<T>(role: string, sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const NEED_FIELDS = "id, school_id, kind, title, description, category, priority, goal_quantity, goal_unit, event_date, status, validated_at, completed_at, created_at, updated_at";
const COMMITMENT_FIELDS = "id, need_id, quantity, status, created_at, delivery_reported_at, confirmed_at";
const PERSONS = [admin, repA, repB, sup1, sup2];
const noPersons = (rows: unknown, label: string) => {
  const json = JSON.stringify(rows);
  check(!PERSONS.some((p) => json.includes(p)) && !/nota|@x\.test|error/.test(json), `${label}: sin UUIDs de personas, notas ni emails`);
};

// Consultas de getSchoolPanel / getSchoolNeedHistory con la sesión del representante.
async function schoolPanel(rep: string, schoolId: string) {
  return as("authenticated", rep, async () => {
    const school = await q(`select id, name, slug, municipality, department, vereda, is_demo from public.schools where id = $1`, [schoolId]);
    const needs = await q(`select ${NEED_FIELDS} from public.needs where school_id = $1 order by created_at desc`, [schoolId]);
    const ids = needs.map((n) => n.id);
    const pending = ids.length ? await q(`select ${COMMITMENT_FIELDS} from public.commitments where need_id = any($1::uuid[]) and status = 'delivery_reported'`, [ids]) : [];
    const progress = ids.length ? await q(`select need_id, goal_quantity, committed_quantity, confirmed_quantity, active_commitments from public.need_progress where need_id = any($1::uuid[])`, [ids]) : [];
    return { school, needs, pending, progress };
  });
}
async function schoolHistory(rep: string, schoolId: string, needId: string) {
  return as("authenticated", rep, async () => {
    const need = await q(`select id, school_id, goal_unit from public.needs where id = $1 and school_id = $2`, [needId, schoolId]);
    if (!need.length) return null;
    return q(`select id, event_type, need_id, school_id, commitment_id, actor_role, sequence_number, created_at, submission_status from public.hedera_events where school_id = $1 and need_id = $2`, [schoolId, needId]);
  });
}

console.log("── Escuela A (representante de A)");
const pA = await schoolPanel(repA, A);
check(pA.school.length === 1 && pA.needs.length === 2, `ve su escuela y sus 2 necesidades (incluida la pendiente)`);
check(pA.pending.length === 1 && pA.pending[0].id === cId, `ve 1 entrega pendiente de confirmar`);
check(pA.progress.length === 2, `progreso de sus 2 necesidades (consulta agrupada)`);
noPersons(pA, "panel escuela A");
const hA = await schoolHistory(repA, A, needA);
check(hA?.length === 4, `historia de su necesidad: ${hA?.length} eventos`);

console.log("── Escuela B (representante de B) intenta ver A");
const pB = await schoolPanel(repB, B);
check(pB.school.length === 1 && pB.school[0].id === B && pB.needs.length === 0 && pB.pending.length === 0, `con su contexto (actor.schoolId = B) ve 0 necesidades y 0 entregas`);
const rlsVisible = await as("authenticated", repB, () => q(`select id from public.needs where school_id = $1`, [A]));
check(rlsVisible.length === 1, `(RLS deja ver a B la necesidad PÚBLICA de A: ${rlsVisible.length}; por eso panel.ts filtra por actor.schoolId)`);
check((await schoolHistory(repB, B, needA)) === null, `historia de la necesidad de A pedida por B → null`);
const pendLeak = await as("authenticated", repB, () => q(`select id from public.needs where id = $1`, [pendA]));
check(pendLeak.length === 0, `B no ve la necesidad pendiente de A`);

console.log("── Aliados: lectura server-side (service_role) con filtro supporter_id");
const readSupporterCommitments = (actorId: string) => as("service_role", null, () =>
  q(`select ${COMMITMENT_FIELDS} from public.commitments where supporter_id = $1 and status <> 'cancelled' order by created_at desc`, [actorId]));
const c1 = await readSupporterCommitments(sup1), c2 = await readSupporterCommitments(sup2);
check(c1.length === 1 && c1[0].id === cId, `sup1 obtiene su compromiso (1)`);
check(c2.length === 0, `sup2 obtiene 0 compromisos de sup1`);
check(!("supporter_id" in c1[0]) && !("confirmed_by" in c1[0]) && !("note" in c1[0]) && !("delivery_note" in c1[0]), `columnas devueltas sin supporter_id, confirmed_by ni notas`);
noPersons(c1, "compromisos de sup1");
const supRest = await as("authenticated", sup1, async () => ({
  needs: await q(`select id, school_id, title, category, priority, goal_quantity, goal_unit, status from public.needs where id = any($1::uuid[])`, [[needA]]),
  events: await q(`select id, event_type, commitment_id, sequence_number, submission_status from public.hedera_events where commitment_id = any($1::uuid[])`, [[cId]]),
}));
check(supRest.needs.length === 1 && supRest.events.length === 2, `con la sesión de sup1: su necesidad (1) y los eventos de su compromiso (${supRest.events.length})`);
for (const [who, sub] of [["sup1", sup1], ["sup2", sup2]] as const) {
  try { await as("authenticated", sub, () => q(`select id from public.commitments where supporter_id = $1`, [sub])); check(false, `${who}: filtrar por supporter_id con la sesión NO debería funcionar`); }
  catch (err) { check(/permission denied/.test((err as Error).message), `${who}: supporter_id con la sesión → permiso denegado (por eso el cliente admin aislado)`); }
}

console.log("── Admin (sesión)");
const adminRes = await as("authenticated", admin, async () => ({
  all: await q(`select ${NEED_FIELDS} from public.needs order by created_at desc`),
  pending: await q(`select id from public.needs where status = 'pending_validation'`),
  published: await q(`select id from public.needs where status = 'published'`),
  pub: await q(`select submission_status from public.hedera_events`),
  feed: await q(`select event_id, event_type, created_at, submission_status, need_id, need_title, school_name, school_slug, school_municipality, school_is_demo from public.impact_feed order by created_at desc limit 10`),
}));
check(adminRes.all.length === 2 && adminRes.pending.length === 1 && adminRes.published.length === 1, `ve todos los estados (2) y filtra por estado`);
check(adminRes.pub.length === 5 && adminRes.feed.length === 5, `cuenta publicación (${adminRes.pub.length} eventos) y lee actividad (${adminRes.feed.length})`);
noPersons(adminRes, "consultas del admin");
for (const col of ["submission_error", "attempts"]) {
  try { await as("authenticated", admin, () => q(`select ${col} from public.hedera_events`)); check(false, `admin lee ${col}`); }
  catch (err) { check(/permission denied/.test((err as Error).message), `admin: ${col} con la sesión → permiso denegado`); }
}

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
