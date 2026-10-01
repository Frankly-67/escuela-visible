// B0 en PGlite: permisos de columnas tras la migración 4. Sin tocar Supabase remoto.
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
const A = "00000000-0000-4000-a000-00000000000a";
const user = async (email: string, role: string, school: string | null) => {
  const [u] = await q(`insert into auth.users (email) values ($1) returning id`, [email]);
  await q(`update public.profiles set role=$1, school_id=$2, show_publicly=true where id=$3`, [role, school, u.id]);
  return u.id as string;
};
const admin = await user("a@x.test", "admin", null), rep = await user("r@x.test", "school_rep", A), sup = await user("s@x.test", "supporter", null);

// Caso completo con las RPC reales (como service_role).
const rpc = async (fn: string, args: unknown[]) => {
  await db.exec("set role service_role");
  try { return await q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args); } finally { await db.exec("reset role"); }
};
const needId = randomUUID(), cId = randomUUID();
const ev = (type: Parameters<typeof buildEvent>[0]["type"], actorRole: Parameters<typeof buildEvent>[0]["actorRole"], commitmentId: string | null = null) =>
  buildEvent({ type, needId, schoolId: A, commitmentId, actorRole });
let e = ev("NEED_CREATED", "school_rep");
await rpc("flow_create_need", [rep, needId, A, "need", "Kits (DEMO)", "", "materiales", "media", 20, "kits", null, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("NEED_VALIDATED", "admin");
await rpc("flow_validate_need", [admin, needId, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("COMMITMENT_CREATED", "supporter", cId);
await rpc("flow_create_commitment", [sup, cId, needId, 5, "nota privada", e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("DELIVERY_REPORTED", "supporter", cId);
await rpc("flow_report_delivery", [sup, cId, "nota de entrega privada", e.payload.eventId, e.payloadCanonical, e.payloadHash]);
e = ev("SCHOOL_CONFIRMED", "school_rep", cId);
await rpc("flow_confirm_receipt", [rep, cId, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
await q(`update public.hedera_events set submission_status='failed', submission_error='error interno', attempts=3 where event_type='NEED_CREATED'`);
console.log("caso completo creado con las RPC (service_role): 1 necesidad, 1 compromiso, 5 eventos\n");

const SENSITIVE = {
  commitments: ["supporter_id", "confirmed_by", "note", "delivery_note", "delivery_evidence_path"],
  hedera_events: ["submission_error", "attempts"],
};
// Consultas EXACTAS de la app (columnas y filtros) con cliente público/sesión.
const APP_QUERIES: [string, string][] = [
  ["public.ts listNeedEvents", `select id, event_type, commitment_id, actor_role, sequence_number, created_at, submission_status from public.hedera_events where need_id = '${needId}' order by created_at`],
  ["public.ts listNeedCommitments", `select id, quantity, status, confirmed_at from public.commitments where need_id = '${needId}' and status <> 'cancelled'`],
  ["verification.ts verifyEventLive", `select id, event_type, need_id, school_id, commitment_id, actor_role, payload_canonical, payload_hash, submission_status, topic_id, sequence_number, consensus_timestamp, transaction_id, created_at from public.hedera_events where id = (select id from public.hedera_events limit 1)`],
  ["vista need_progress", `select need_id, goal_quantity, committed_quantity, confirmed_quantity, active_commitments from public.need_progress`],
  ["vista impact_feed", `select * from public.impact_feed`],
  ["columnas seguras de commitments", `select id, need_id, quantity, status, created_at, delivery_reported_at, confirmed_at from public.commitments`],
  ["columnas seguras de hedera_events", `select id, event_type, need_id, school_id, commitment_id, actor_role, payload_canonical, payload_hash, submission_status, topic_id, transaction_id, sequence_number, consensus_timestamp, created_at, submitted_at from public.hedera_events`],
  ["count(*) commitments", `select count(*) from public.commitments`],
  ["count(*) hedera_events", `select count(*) from public.hedera_events`],
];

const ACTORS: [string, string, string | null][] = [["anon", "anon", null], ["authenticated (supporter)", "authenticated", sup], ["authenticated (school_rep)", "authenticated", rep], ["authenticated (admin)", "authenticated", admin]];
for (const [label, role, sub] of ACTORS) {
  console.log(`── ${label}`);
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try {
    for (const [table, cols] of Object.entries(SENSITIVE)) {
      for (const col of cols) {
        try { await q(`select ${col} from public.${table}`); check(false, `${table}.${col} legible`); }
        catch (err) { check(/permission denied/.test((err as Error).message), `${table}.${col} → permiso denegado`); }
      }
      try { await q(`select * from public.${table}`); check(false, `select * de ${table} permitido`); }
      catch (err) { check(/permission denied/.test((err as Error).message), `select * de ${table} → permiso denegado`); }
    }
    for (const [name, sql] of APP_QUERIES) {
      try { const rows = await q(sql); check(rows.length > 0, `${name} → ${rows.length} fila(s)`); }
      catch (err) { check(false, `${name} → ERROR ${(err as Error).message}`); }
    }
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

console.log("── service_role (servidor/scripts)");
await db.exec("set role service_role");
const full = await q(`select supporter_id, confirmed_by, note, delivery_note from public.commitments`);
const evFull = await q(`select submission_error, attempts, payload from public.hedera_events where event_type='NEED_CREATED'`);
await db.exec("reset role");
check(full[0].note === "nota privada" && full[0].delivery_note === "nota de entrega privada" && full[0].supporter_id === sup, "service_role conserva acceso a todas las columnas de commitments");
check(evFull[0].submission_error === "error interno" && evFull[0].attempts === 3, "service_role conserva submission_error y attempts");

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
