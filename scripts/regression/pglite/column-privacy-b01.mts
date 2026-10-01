// B0.1 en PGlite: needs.created_by / validated_by protegidas tras la migración 5.
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
const rpc = async (fn: string, args: unknown[]) => {
  await db.exec("set role service_role");
  try { return await q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})`, args); } finally { await db.exec("reset role"); }
};
// Una necesidad publicada (con created_by y validated_by) y otra pendiente.
const pub = randomUUID(), pend = randomUUID();
for (const id of [pub, pend]) {
  const e = buildEvent({ type: "NEED_CREATED", needId: id, schoolId: A, actorRole: "school_rep" });
  await rpc("flow_create_need", [rep, id, A, "need", "Kits (DEMO)", "", "materiales", "media", 20, "kits", null, e.payload.eventId, e.payloadCanonical, e.payloadHash]);
}
const v = buildEvent({ type: "NEED_VALIDATED", needId: pub, schoolId: A, actorRole: "admin" });
await rpc("flow_validate_need", [admin, pub, v.payload.eventId, v.payloadCanonical, v.payloadHash]);

const APP_QUERIES: [string, string][] = [
  ["public.ts NEED_FIELDS (listNeedsBySchool/getNeed)", `select id, school_id, kind, title, description, category, priority, goal_quantity, goal_unit, event_date, status, created_at from public.needs where school_id = '${A}' order by created_at desc`],
  ["validated_at / completed_at / updated_at", `select validated_at, completed_at, updated_at from public.needs`],
  ["vista need_progress", `select * from public.need_progress`],
  ["vista impact_feed", `select * from public.impact_feed`],
  ["RLS de hedera_events (subconsulta a needs.id)", `select id from public.hedera_events`],
  ["count(*) needs", `select count(*) from public.needs`],
];
const ACTORS: [string, string, string | null, number][] = [
  ["anon", "anon", null, 1], ["authenticated (supporter)", "authenticated", sup, 1],
  ["authenticated (school_rep)", "authenticated", rep, 2], ["authenticated (admin)", "authenticated", admin, 2],
];
for (const [label, role, sub, expectedNeeds] of ACTORS) {
  console.log(`── ${label}`);
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try {
    for (const col of ["created_by", "validated_by", "*"]) {
      try { await q(`select ${col} from public.needs`); check(false, `needs.${col} legible`); }
      catch (e) { check(/permission denied/.test((e as Error).message), `needs.${col} → permiso denegado`); }
    }
    try { await q(`select n.id, p.display_name from public.needs n join public.profiles p on p.id = n.created_by`); check(false, "needs→profiles por created_by legible"); }
    catch (e) { check(/permission denied/.test((e as Error).message), "needs→profiles por created_by → permiso denegado"); }
    for (const [name, sql] of APP_QUERIES) {
      try { const rows = await q(sql); check(rows.length > 0, `${name} → ${rows.length} fila(s)`); }
      catch (e) { check(false, `${name} → ERROR ${(e as Error).message}`); }
    }
    const visible = (await q(`select count(*)::int n from public.needs`))[0].n;
    check(visible === expectedNeeds, `RLS intacta: ve ${visible} necesidad(es) (esperado ${expectedNeeds})`);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
await db.exec("set role service_role");
const full = await q(`select created_by, validated_by from public.needs where id = $1`, [pub]);
await db.exec("reset role");
check(full[0].created_by === rep && full[0].validated_by === admin, "service_role conserva created_by y validated_by (valores intactos)");
console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
