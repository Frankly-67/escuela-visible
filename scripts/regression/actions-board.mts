// Tablón — Server Actions REALES (createPostAction, publishPostAction, rejectPostAction)
// con las funciones de board REALES. Sin escrituras:
//  - createClient (sesión): supabase-js con sesión DEMO real (solo lectura de Auth).
//  - createAdminClient: envoltorio. `profiles` se lee de verdad (requireActor);
//    `board_posts` devuelve filas FICTICIAS; `rpc` solo se REGISTRA (nunca llega a Supabase).
//  - publishEvent: doble que registra llamadas (el tablón no debe llamarlo nunca).
//  - redirect / refresh de Next: dobles.
//
// Requiere .env.local (Supabase y DEMO_ACCOUNT_PASSWORD). Inicia sesión con cuentas DEMO
// (Supabase Auth) y solo LEE datos reales; las escrituras (RPC) están sustituidas por dobles.
import "../lib/load-env";

import { existsSync } from "node:fs";
import { mock } from "node:test";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
if (!existsSync(`${ROOT}/src/lib/data/board.ts`)) {
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
let fakePost: { id: string; status: string } | null = null;
const postReads: string[] = [];
const publishCalls: string[] = [];
let refreshCalls = 0;

const fakePostsQuery = () => {
  const q = {
    select: () => q,
    eq: (_c: string, v: string) => { postReads.push(v); return q; },
    maybeSingle: async () => ({ data: fakePost && postReads.at(-1) === fakePost.id ? fakePost : null, error: null }),
  };
  return q;
};
const adminWrapper = {
  from: (table: string) => {
    if (table === "profiles") return realAdmin.from("profiles"); // solo lectura (getActorById)
    if (table === "board_posts") return fakePostsQuery();
    throw new Error(`tabla no permitida en la prueba: ${table}`);
  },
  rpc: async (fn: string, args: Record<string, unknown>) => { rpcCalls.push({ fn, args }); return rpcResult; },
};

mock.module(pathToFileURL(`${ROOT}/src/lib/supabase/server.ts`).href, { namedExports: { createClient: async () => session } });
mock.module(pathToFileURL(`${ROOT}/src/lib/supabase/admin.ts`).href, { namedExports: { createAdminClient: () => adminWrapper } });
mock.module(pathToFileURL(`${ROOT}/src/lib/hedera/publish.ts`).href, {
  namedExports: { publishEvent: async (id: string) => { publishCalls.push(id); return { status: "submitted" }; } },
});
mock.module(pathToFileURL(`${ROOT}/node_modules/next/navigation.js`).href, {
  namedExports: { redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); } },
});
mock.module(pathToFileURL(`${ROOT}/node_modules/next/cache.js`).href, { namedExports: { refresh: () => { refreshCalls++; } } });

const { createPostAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/escuela/actions.ts`).href);
const { publishPostAction, rejectPostAction } = await import(pathToFileURL(`${ROOT}/src/app/panel/admin/actions.ts`).href);

let ok = true;
const check = (c: boolean, t: string) => { ok &&= c; console.log(`${c ? "✓" : "✗"} ${t}`); };
const reset = () => { rpcCalls.length = 0; publishCalls.length = 0; postReads.length = 0; refreshCalls = 0; rpcResult = { error: null }; fakePost = null; };
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
const FAKE_POST = "aaaaaaaa-0000-4000-8000-0000000000bb";
const FORM = { kind: "bazar", title: "Bazar de prueba (no se guarda)", body: "Doble de prueba", eventDate: "2026-11-07" };
const leaks = (state: unknown) => { const j = JSON.stringify(state); return PERSONS.some((p) => j.includes(p)) || /@|supabase|submission_error|connection|10\.0\.0/i.test(j); };

console.log("── Sin sesión");
await signIn(null); reset();
for (const [name, fn] of [["createPostAction", () => createPostAction(IDLE, fd(FORM))], ["publishPostAction", () => publishPostAction(IDLE, fd({ postId: FAKE_POST }))], ["rejectPostAction", () => rejectPostAction(IDLE, fd({ postId: FAKE_POST }))]] as const) {
  check((await redirectOf(fn)) === "/ingresar", `${name} sin sesión → redirect /ingresar (no hay publicaciones anónimas)`);
}
check(rpcCalls.length === 0, "sin sesión: 0 RPC");

console.log("── Escuela (La Cascada): enviar publicación");
await signIn("la-cascada"); reset();
const created = await createPostAction(IDLE, fd({ ...FORM, schoolId: MIRADOR, role: "admin", userId: PERSONS[0], status: "published" }));
const call = rpcCalls[0];
check(created.status === "success" && rpcCalls.length === 1 && call.fn === "board_create_post", `createPostAction → 1 RPC board_create_post (registrada, no ejecutada) · ${created.status}`);
check(call?.args.p_school_id === CASCADA && call.args.p_actor_id === cascadaRep, "escuela y autor salen de la sesión (schoolId/userId del formulario ignorados)");
check(JSON.stringify(Object.keys(call?.args ?? {}).sort()) === JSON.stringify(["p_actor_id", "p_body", "p_event_date", "p_kind", "p_post_id", "p_school_id", "p_title"]), "argumentos: sin estado, imagen, contacto ni necesidad");
check(call?.args.p_kind === "bazar" && call.args.p_event_date === "2026-11-07" && call.args.p_title === FORM.title, "datos del formulario convertidos");
check(created.status === "success" && /pendiente de revisión/.test(created.message) && !leaks(created), `mensaje: «${created.status === "success" ? created.message : ""}»`);
check(publishCalls.length === 0, "sin publicación en Hedera");

reset();
const noDate = await createPostAction(IDLE, fd({ ...FORM, eventDate: "" }));
check(noDate.status === "success" && rpcCalls[0]?.args.p_event_date === null, "fecha vacía → null (opcional)");
for (const [label, fields, re] of [
  ["teléfono en el título", { ...FORM, title: "Informes 300 123 4567" }, /teléfono/],
  ["correo en el texto", { ...FORM, body: "Escribir a rectoria@escuela.edu.co" }, /correos/],
  ["título corto", { ...FORM, title: "ab" }, /muy corto/],
  ["tipo inválido", { ...FORM, kind: "rifa" }, /tipo/],
] as const) {
  reset();
  const r = await createPostAction(IDLE, fd(fields));
  check(r.status === "error" && re.test(r.message) && rpcCalls.length === 0, `${label} → «${r.status === "error" ? r.message : r.status}», 0 RPC`);
  check(r.status === "error" && r.values?.title === fields.title, `${label}: conserva lo escrito`);
}
reset(); rpcResult = { error: { message: "CONTACT_DATA: No incluyas teléfonos ni correos electrónicos en la publicación.", hint: "CONTACT_DATA" } };
const dbBlock = await createPostAction(IDLE, fd(FORM));
check(dbBlock.status === "error" && dbBlock.message === "No incluyas teléfonos ni correos electrónicos en la publicación.", "la base bloquea (CONTACT_DATA) → su mensaje");
reset(); rpcResult = { error: { message: "duplicate key value violates unique constraint at 10.0.0.1", hint: null } };
const unknown = await createPostAction(IDLE, fd(FORM));
check(unknown.status === "error" && unknown.message === "No se pudo completar la operación. Intenta de nuevo." && !leaks(unknown), "error desconocido → mensaje genérico, sin detalles internos");

reset();
check((await redirectOf(() => publishPostAction(IDLE, fd({ postId: FAKE_POST })))) === "/panel/escuela", "escuela → publishPostAction → redirect a su panel");
check((await redirectOf(() => rejectPostAction(IDLE, fd({ postId: FAKE_POST })))) === "/panel/escuela", "escuela → rejectPostAction → redirect a su panel");
check(rpcCalls.length === 0 && postReads.length === 0, "escuela: 0 lecturas y 0 RPC de revisión");

console.log("── Aliado");
await signIn("aliado"); reset();
for (const [name, fn] of [["createPostAction", () => createPostAction(IDLE, fd({ ...FORM, schoolId: CASCADA }))], ["publishPostAction", () => publishPostAction(IDLE, fd({ postId: FAKE_POST }))], ["rejectPostAction", () => rejectPostAction(IDLE, fd({ postId: FAKE_POST }))]] as const) {
  check((await redirectOf(fn)) === "/panel/aliado", `aliado → ${name} → redirect /panel/aliado`);
}
check(rpcCalls.length === 0, "aliado: 0 RPC");

console.log("── Admin");
await signIn("admin"); reset();
check((await redirectOf(() => createPostAction(IDLE, fd({ ...FORM, schoolId: CASCADA })))) === "/panel/admin", "admin → createPostAction → redirect (el admin no publica por las escuelas)");

reset(); fakePost = { id: FAKE_POST, status: "pending_review" };
const published = await publishPostAction(IDLE, fd({ postId: FAKE_POST, status: "rejected" }));
check(published.status === "success" && rpcCalls[0]?.fn === "board_publish_post" && JSON.stringify(rpcCalls[0].args) === JSON.stringify({ p_actor_id: rpcCalls[0].args.p_actor_id, p_post_id: FAKE_POST }), "publishPostAction → RPC board_publish_post {p_actor_id, p_post_id}");
check(refreshCalls === 1 && publishCalls.length === 0 && /Ya es pública/.test(published.status === "success" ? published.message : ""), "refresh() + mensaje, sin Hedera");
reset(); fakePost = { id: FAKE_POST, status: "pending_review" };
const rejected = await rejectPostAction(IDLE, fd({ postId: FAKE_POST }));
check(rejected.status === "success" && rpcCalls[0]?.fn === "board_reject_post" && refreshCalls === 1 && publishCalls.length === 0, "rejectPostAction → RPC board_reject_post + refresh(), sin Hedera");
for (const status of ["published", "rejected"]) {
  reset(); fakePost = { id: FAKE_POST, status };
  const r = await publishPostAction(IDLE, fd({ postId: FAKE_POST }));
  check(r.status === "error" && r.message === "Esta publicación no está pendiente de revisión." && rpcCalls.length === 0, `aprobar una ${status} → INVALID_TRANSITION, 0 RPC`);
}
reset(); fakePost = null;
const missing = await publishPostAction(IDLE, fd({ postId: FAKE_POST }));
check(missing.status === "error" && missing.message === "La publicación no existe." && rpcCalls.length === 0, "publicación inexistente → NOT_FOUND, 0 RPC");
for (const bad of ["", "x", "'; drop table board_posts; --", FAKE_POST.toUpperCase()]) {
  reset();
  const r = await rejectPostAction(IDLE, fd({ postId: bad }));
  check(r.status === "error" && r.message === "Identificador de publicación inválido." && postReads.length === 0, `postId ${JSON.stringify(bad)} → inválido, sin leer la base`);
}
reset(); fakePost = { id: FAKE_POST, status: "pending_review" }; rpcResult = { error: { message: "INVALID_TRANSITION: Esta publicación no está pendiente de revisión.", hint: "INVALID_TRANSITION" } };
const race = await publishPostAction(IDLE, fd({ postId: FAKE_POST }));
check(race.status === "error" && race.message === "Esta publicación no está pendiente de revisión." && refreshCalls === 0, "carrera (la RPC rechaza) → mensaje de negocio, sin refresh");
await session.auth.signOut({ scope: "local" });

console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
