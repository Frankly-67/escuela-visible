// Tablón (migración 20261001000600) en PGlite: tabla board_posts, RLS, permisos de columnas,
// RPC board_*, guards de estado y contenido, y protección de privacidad (teléfonos/correos).
// Regresión del repositorio: Postgres en memoria (PGlite) con las migraciones y el seed del
// proyecto. No usa red, Supabase remoto ni Hedera; no necesita secretos.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { findContactData } from "@/lib/domain/contact-data";
import { CONTACT_CASES } from "@/lib/domain/contact-data.fixtures";

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
const A = "00000000-0000-4000-a000-00000000000a", B = "00000000-0000-4000-a000-00000000000b";
const user = async (email: string, role: string, school: string | null) => {
  const [u] = await q(`insert into auth.users (email) values ($1) returning id`, [email]);
  await q(`update public.profiles set role=$1, school_id=$2, show_publicly=true where id=$3`, [role, school, u.id]);
  return u.id as string;
};
const admin = await user("a@x.test", "admin", null), repA = await user("ra@x.test", "school_rep", A);
const repB = await user("rb@x.test", "school_rep", B), sup = await user("s@x.test", "supporter", null);

async function asRole<T>(role: string, sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
const rpc = (fn: string, args: unknown[]) =>
  asRole("service_role", null, async () => (await q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args))[0].r as Record<string, unknown>);
const hintOf = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as { hint?: string; message: string }).hint ?? (e as Error).message; } };
const create = (actor: string, school: string, title: string, body = "", kind = "bazar", date: string | null = null, id = randomUUID()) =>
  rpc("board_create_post", [actor, id, school, kind, title, body, date]).then((r) => ({ postStatus: r.postStatus, id }));
const eventsCount = async () => Number((await q(`select count(*)::int n from public.hedera_events`))[0].n);
const events0 = await eventsCount();

console.log("── Privacidad: misma regla en SQL y en TypeScript");
for (const [text, expected] of CONTACT_CASES) {
  const sql = (await q(`select public.board_text_has_contact($1) v`, [text]))[0].v as boolean;
  check(sql === (expected !== null) && (findContactData(text) !== null) === sql, `${JSON.stringify(text)} → ${sql ? "bloquea" : "permite"}`);
}

console.log("── board_create_post");
const p1 = await create(repA, A, "Bazar de la escuela (DEMO)", "Juegos y comida.", "bazar", "2026-10-15");
check(p1.postStatus === "pending_review", "school_rep de A crea en A → pending_review");
const row = (await q(`select status, created_by, reviewed_by, published_at, event_date::text d from public.board_posts where id = $1`, [p1.id]))[0];
check(row.status === "pending_review" && row.created_by === repA && row.reviewed_by === null && row.published_at === null && row.d === "2026-10-15", "fila: autor = actor, sin revisión, fecha guardada");
check((await hintOf(create(repA, B, "Para otra escuela"))) === "NOT_SCHOOL_MEMBER", "school_rep de A en la escuela B → NOT_SCHOOL_MEMBER");
for (const [who, id] of [["supporter", sup], ["admin", admin]] as const) {
  check((await hintOf(create(id, A, "No debería"))) === "FORBIDDEN_ROLE", `${who} → FORBIDDEN_ROLE`);
}
check((await hintOf(create(randomUUID(), A, "Sin perfil"))) === "ACTOR_NOT_FOUND", "actor inexistente (anónimo) → ACTOR_NOT_FOUND");
check((await hintOf(create(repA, A, "Informes 300 123 4567"))) === "CONTACT_DATA", "teléfono en el título → CONTACT_DATA");
check((await hintOf(create(repA, A, "Bazar", "Escribir a rectoria@escuela.edu.co"))) === "CONTACT_DATA", "correo en el texto → CONTACT_DATA");
check(/check constraint|violates/.test(await hintOf(create(repA, A, "ab"))), "título de 2 caracteres → CHECK de la tabla");
check(/invalid input value for enum/.test(await hintOf(create(repA, A, "Rifa", "", "rifa"))), "tipo fuera del enum → error");
const p2 = await create(repA, A, "Sancocho comunitario (DEMO)", "", "sancocho");
const p3 = await create(repB, B, "Campaña de lectura (DEMO)", "", "campana");

console.log("── Escrituras directas (incluso con la secret key) respetan las reglas");
const direct = (sql: string, p: unknown[] = []) => hintOf(asRole("service_role", null, () => q(sql, p)));
check(/check constraint/.test(await direct(`insert into public.board_posts (school_id, kind, title, body) values ($1, 'bazar', 'Bazar', 'Tel 3001234567')`, [A])), "service_role: INSERT con teléfono → CHECK board_posts_no_contact_data");
check((await direct(`insert into public.board_posts (school_id, kind, title, status) values ($1, 'bazar', 'Bazar', 'published')`, [A])) === "INVALID_TRANSITION", "service_role: INSERT ya publicado → INVALID_TRANSITION");
check((await direct(`update public.board_posts set title = 'Otro título' where id = $1`, [p1.id])) === "INVALID_TRANSITION", "service_role: editar el título → INVALID_TRANSITION (sin edición)");
check((await direct(`update public.board_posts set body = 'Otro texto' where id = $1`, [p1.id])) === "INVALID_TRANSITION", "service_role: editar el texto → INVALID_TRANSITION");

console.log("── board_publish_post / board_reject_post");
for (const [who, id] of [["school_rep", repA], ["supporter", sup]] as const) {
  check((await hintOf(rpc("board_publish_post", [id, p1.id]))) === "FORBIDDEN_ROLE", `${who} publica → FORBIDDEN_ROLE`);
  check((await hintOf(rpc("board_reject_post", [id, p1.id]))) === "FORBIDDEN_ROLE", `${who} rechaza → FORBIDDEN_ROLE`);
}
check((await hintOf(rpc("board_publish_post", [admin, randomUUID()]))) === "NOT_FOUND", "publicación inexistente → NOT_FOUND");
const pub = await rpc("board_publish_post", [admin, p1.id]);
const after = (await q(`select status, reviewed_by, reviewed_at, published_at from public.board_posts where id = $1`, [p1.id]))[0];
check(pub.postStatus === "published" && after.status === "published" && after.reviewed_by === admin && after.reviewed_at !== null && after.published_at !== null, "admin aprueba → published, con revisor y fechas");
const rej = await rpc("board_reject_post", [admin, p2.id]);
check(rej.postStatus === "rejected" && (await q(`select published_at from public.board_posts where id = $1`, [p2.id]))[0].published_at === null, "admin no aprueba → rejected, sin fecha de publicación");
check((await hintOf(rpc("board_publish_post", [admin, p1.id]))) === "INVALID_TRANSITION", "aprobar dos veces → INVALID_TRANSITION");
check((await hintOf(rpc("board_publish_post", [admin, p2.id]))) === "INVALID_TRANSITION", "aprobar una rechazada → INVALID_TRANSITION");
check((await hintOf(rpc("board_reject_post", [admin, p1.id]))) === "INVALID_TRANSITION", "rechazar una publicada → INVALID_TRANSITION");
check((await direct(`update public.board_posts set status = 'pending_review' where id = $1`, [p1.id])) === "INVALID_TRANSITION", "service_role: published → pending_review → INVALID_TRANSITION");
check((await eventsCount()) === events0, `sin eventos Hedera: hedera_events sigue en ${events0}`);

console.log("── Lectura (RLS) y columnas por rol");
// p1 (A) publicada · p2 (A) rechazada · p3 (B) pendiente
const ACTORS: [string, string, string | null, string[]][] = [
  ["anon", "anon", null, [p1.id]],
  ["supporter", "authenticated", sup, [p1.id]],
  ["school_rep A", "authenticated", repA, [p1.id, p2.id]],
  ["school_rep B", "authenticated", repB, [p1.id, p3.id]],
  ["admin", "authenticated", admin, [p1.id, p2.id, p3.id]],
];
for (const [label, role, sub, expected] of ACTORS) {
  await asRole(role, sub, async () => {
    const ids = (await q(`select id, kind, title, body, event_date, status, reviewed_at, published_at, created_at, updated_at, school_id from public.board_posts`)).map((r) => r.id as string).sort();
    check(JSON.stringify(ids) === JSON.stringify([...expected].sort()), `${label}: ve ${ids.length} publicación(es) (esperado ${expected.length})`);
    for (const col of ["created_by", "reviewed_by", "*"]) {
      const r = await hintOf(q(`select ${col} from public.board_posts`));
      check(/permission denied/.test(r), `${label}: board_posts.${col} → permiso denegado`);
    }
    const embed = await hintOf(q(`select b.id, s.name, s.is_demo from public.board_posts b join public.schools s on s.id = b.school_id`));
    check(embed === "OK", `${label}: lectura con la escuela (como el embed de la app)`);
    for (const [name, sql] of [
      ["INSERT", `insert into public.board_posts (school_id, kind, title) values ('${A}', 'bazar', 'Desde el navegador')`],
      ["UPDATE", `update public.board_posts set status = 'published' where id = '${p3.id}'`],
      ["DELETE", `delete from public.board_posts where id = '${p1.id}'`],
    ]) check(/permission denied/.test(await hintOf(q(sql))), `${label}: ${name} directo → permiso denegado`);
    for (const fn of ["board_create_post", "board_publish_post", "board_reject_post"]) {
      const allowed = (await q(`select has_function_privilege(current_user, p.oid, 'execute') v from pg_proc p where p.proname = $1`, [fn]))[0].v;
      check(allowed === false, `${label}: no puede ejecutar ${fn}`);
    }
  });
}
check((await q(`select status from public.board_posts where id = $1`, [p3.id]))[0].status === "pending_review", "tras los intentos: la pendiente sigue pendiente");
check(Number((await q(`select count(*)::int n from public.board_posts`))[0].n) === 3, "tras los intentos: siguen 3 publicaciones (nada insertado ni borrado)");

console.log("── Funciones board_* solo para service_role");
const exposed = (await q(`
  select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'board\\_%'
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).map((r) => r.f);
check(exposed.length === 0, `ninguna función board_* ejecutable por anon/authenticated${exposed.length ? `: ${exposed.join(",")}` : ""}`);
const svc = (await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'board\\_%' and has_function_privilege('service_role', p.oid, 'execute')`))[0].n;
check(svc === 4, `service_role puede ejecutar las 4 funciones board_* (${svc})`);

console.log("── Necesidades intactas");
await asRole("anon", null, async () => {
  const statuses = (await q(`select status from public.needs`)).map((r) => r.status);
  check(statuses.every((s) => s === "published" || s === "completed"), "RLS de needs sin cambios para anon");
});

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
