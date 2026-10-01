// B1 contra Supabase remoto, SOLO LECTURA: ejecuta las funciones REALES de
// src/lib/data/panel.ts con sesiones DEMO. Solo se sustituye createClient()
// (cookies de Next) por un cliente supabase-js con la sesión iniciada.
// No llama a flujos de negocio ni a Hedera. Nunca imprime la contraseña.
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
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD!;
const D = "demo.escuelavisible.example";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let current: any = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let mocked = 0;
mock.module(pathToFileURL(`${ROOT}/src/lib/supabase/server.ts`).href, {
  namedExports: { createClient: async () => { mocked++; return current; } },
});

// redirect() de Next lanza un error con digest NEXT_REDIRECT;<tipo>;<url>;<status>;
mock.module(pathToFileURL(`${ROOT}/node_modules/next/navigation.js`).href, {
  namedExports: { redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${url};307;` }); } },
});

const panel = await import(pathToFileURL(`${ROOT}/src/lib/data/panel.ts`).href);
const { createAdminClient } = await import(pathToFileURL(`${ROOT}/src/lib/supabase/admin.ts`).href);

let ok = true;
const check = (c: boolean, t: string) => { ok &&= c; console.log(`${c ? "✓" : "✗"} ${t}`); };

// Valores que NUNCA deben aparecer en un DTO (se leen con el cliente admin solo para comparar; no se imprimen).
const admin = createAdminClient();
const { data: profiles } = await admin.from("profiles").select("id");
const { data: schools } = await admin.from("schools").select("id, slug");
const PERSON_IDS: string[] = profiles!.map((p: { id: string }) => p.id);
const SCHOOL_IDS: string[] = schools!.map((s: { id: string }) => s.id);
const FORBIDDEN_KEYS = ["supporter_id", "confirmed_by", "created_by", "validated_by", "note", "delivery_note", "delivery_evidence_path", "submission_error", "attempts", "email", "payload", "school_id"];
function scan(label: string, dto: unknown) {
  const json = JSON.stringify(dto);
  const keys = FORBIDDEN_KEYS.filter((k) => json.includes(`"${k}"`));
  const persons = PERSON_IDS.filter((id) => json.includes(id)).length;
  const schoolIds = SCHOOL_IDS.filter((id) => json.includes(id)).length;
  const emails = /[\w.+-]+@[\w-]+\.[\w.]+/.test(json);
  check(keys.length === 0 && persons === 0 && schoolIds === 0 && !emails,
    `${label}: sin claves sensibles${keys.length ? ` (${keys})` : ""}, 0 UUIDs de personas (${persons}), 0 school_id (${schoolIds}), sin emails`);
}

async function signIn(local: string) {
  current = createSupabase(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await current.auth.signInWithPassword({ email: `${local}@${D}`, password: PASSWORD });
  if (error) throw new Error(`no se pudo iniciar sesión (${local})`);
}
async function signOut() { await current.auth.signOut({ scope: "local" }); }
const redirectOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { const d = (e as { digest?: string }).digest ?? ""; return d.startsWith("NEXT_REDIRECT") ? d.split(";")[2] : `ERROR ${(e as Error).message}`; }
};

const NEED = "769e4e92-4d46-4421-9d7b-c998f125a480";
// Estado DEMO tras el E2E real de B3 (aprobado): La Cascada publicada, Los Robles no aprobada.
const CASCADA_NEED = "67c4425c-0622-4cd4-9306-b055da760f19";
const ROBLES_NEED = "9b9912da-8149-466e-9eeb-b7dc829bd477";
// B5.3 (autorizada): necesidad de prueba de El Mirador creada y validada en producción (eventos #12 y #13).
const VERCEL_NEED = "2583d69d-f6cc-49bb-b3e3-f3e8a994227b";
const all: Record<string, unknown> = {};

console.log("── Firma de las funciones (no aceptan contexto de seguridad)");
check(panel.getSchoolPanel.length === 0 && panel.getSupporterPanel.length === 0 && panel.getAdminOverview.length === 0, "getSchoolPanel/getSupporterPanel/getAdminOverview: 0 parámetros");
check(panel.getSchoolNeedHistory.length === 1 && panel.getAdminNeeds.length === 1 && panel.getAdminNeedReview.length === 1, "getSchoolNeedHistory(needId), getAdminNeeds(estado), getAdminNeedReview(needId): 1 parámetro");
check(!("readSupporterCommitments" in panel), "readSupporterCommitments NO está exportada");

console.log("── Sin sesión");
for (const fn of ["getSchoolPanel", "getSupporterPanel", "getAdminOverview"]) check((await redirectOf(() => panel[fn]())) === "/ingresar", `${fn} sin sesión → redirect /ingresar`);

console.log("── Escuela: El Mirador");
await signIn("el-mirador");
const mirador = await panel.getSchoolPanel();
all.mirador = mirador;
check(mirador?.school.slug === "escuela-demo-el-mirador", `school = ${mirador?.school.slug}`);
const miradorNeed = mirador?.needs.find((n: { id: string }) => n.id === NEED);
const vercelNeed = mirador?.needs.find((n: { id: string }) => n.id === VERCEL_NEED);
check(mirador?.needs.length === 2 && miradorNeed !== undefined && vercelNeed !== undefined && mirador.needs.every((n: { status: string; validated_at: string | null }) => n.status === "published" && n.validated_at !== null), `needs: ${mirador?.needs.length} (published, validated_at ${mirador?.needs.every((n: { validated_at: string | null }) => n.validated_at) ? "sí" : "no"})`);
check(JSON.stringify(mirador?.counts) === JSON.stringify({ pending_validation: 0, published: 2, completed: 0, cancelled: 0 }), `counts ${JSON.stringify(mirador?.counts)}`);
check(miradorNeed?.progress.confirmed === 5 && miradorNeed.progress.goal === 20, `progress ${JSON.stringify(miradorNeed?.progress)}`);
check(JSON.stringify(vercelNeed?.progress) === JSON.stringify({ goal: 1, committed: 0, confirmed: 0, active: 0 }), `progress B5.3 ${JSON.stringify(vercelNeed?.progress)}`);
check(mirador?.pendingDeliveries.length === 0, `pendingDeliveries: ${mirador?.pendingDeliveries.length} (el compromiso ya está confirmado)`);
const history = await panel.getSchoolNeedHistory(NEED);
all.history = history;
check(history?.length === 5 && history.every((s: { eventId: string; publishedToHedera: boolean }) => s.eventId && s.publishedToHedera), `historia: ${history?.length} pasos con eventId para /verify`);
check(history?.map((s: { registryNumber: number }) => s.registryNumber).join(",") === "1,2,3,4,5", `números de registro ${history?.map((s: { registryNumber: number }) => s.registryNumber).join(",")}`);
check((await panel.getSchoolNeedHistory("no-es-uuid")) === null && (await panel.getSchoolNeedHistory("00000000-0000-4000-8000-000000000000")) === null, "needId inválido o inexistente → null");
check((await redirectOf(() => panel.getSupporterPanel())) === "/panel/escuela", "El Mirador pide el panel de aliado → redirect a /panel/escuela");
check((await redirectOf(() => panel.getAdminOverview())) === "/panel/escuela", "El Mirador pide el panel admin → redirect a /panel/escuela");
scan("El Mirador", all);
await signOut();

console.log("── Escuela: La Cascada (no debe ver El Mirador)");
await signIn("la-cascada");
const cascada = await panel.getSchoolPanel();
check(cascada?.school.slug === "escuela-demo-la-cascada", `school = ${cascada?.school.slug}`);
check(cascada?.needs.length === 1 && cascada.needs[0].id === CASCADA_NEED && cascada.needs[0].status === "completed" && cascada.needs[0].completed_at !== null && JSON.stringify(cascada.needs[0].progress) === JSON.stringify({ goal: 30, committed: 30, confirmed: 30, active: 1 }) && cascada.pendingDeliveries.length === 0, `needs ${cascada?.needs.length} (su necesidad completada 30/30), pendingDeliveries ${cascada?.pendingDeliveries.length}`);
check(JSON.stringify(cascada?.counts) === JSON.stringify({ pending_validation: 0, published: 0, completed: 1, cancelled: 0 }), `counts ${JSON.stringify(cascada?.counts)}`);
check(!JSON.stringify(cascada).includes(NEED) && !JSON.stringify(cascada).includes("El Mirador") && !JSON.stringify(cascada).includes(ROBLES_NEED) && !JSON.stringify(cascada).includes("Pintura"), "nada de El Mirador ni de Los Robles en su panel");
check((await panel.getSchoolNeedHistory(ROBLES_NEED)) === null, "historia de la necesidad (cancelada) de Los Robles → null");
check((await panel.getSchoolNeedHistory(CASCADA_NEED))?.map((s: { registryNumber: number }) => s.registryNumber).join(",") === "6,7,9,10,11", "historia de su propia necesidad: 5 pasos (registros 6, 7, 9, 10, 11)");
check((await panel.getSchoolNeedHistory(NEED)) === null, "historia de la necesidad de El Mirador → null");
scan("La Cascada", cascada);
await signOut();

console.log("── Escuela: Los Robles (solo su necesidad no aprobada)");
await signIn("los-robles");
const robles = await panel.getSchoolPanel();
check(robles?.school.slug === "escuela-demo-los-robles" && robles.needs.length === 1 && robles.needs[0].id === ROBLES_NEED && robles.needs[0].status === "cancelled", `needs ${robles?.needs.length} (${robles?.needs[0]?.status})`);
check(JSON.stringify(robles?.counts) === JSON.stringify({ pending_validation: 0, published: 0, completed: 0, cancelled: 1 }), `counts ${JSON.stringify(robles?.counts)}`);
check(!JSON.stringify(robles).includes(NEED) && !JSON.stringify(robles).includes(CASCADA_NEED) && !JSON.stringify(robles).includes("El Mirador") && !JSON.stringify(robles).includes("Refrigerios"), "nada de El Mirador ni de La Cascada en su panel");
check((await panel.getSchoolNeedHistory(NEED)) === null && (await panel.getSchoolNeedHistory(CASCADA_NEED)) === null, "historias de otras escuelas → null");
check((await panel.getSchoolNeedHistory(ROBLES_NEED))?.length === 1, "historia de su necesidad no aprobada: 1 paso (el rechazo no genera evento)");
scan("Los Robles", robles);
await signOut();

console.log("── Aliado");
await signIn("aliado");
const sup = await panel.getSupporterPanel();
all.sup = sup;
check(sup.commitments.length === 2, `commitments: ${sup.commitments.length}`);
const c = sup.commitments.find((x: { needId: string }) => x.needId === NEED);
const cc = sup.commitments.find((x: { needId: string }) => x.needId === CASCADA_NEED);
check(cc?.id === "da2bf45a-104b-4461-b605-1607014b353e" && cc.status === "confirmed" && cc.quantity === 30 && cc.school?.slug === "escuela-demo-la-cascada" && cc.need?.status === "completed" && cc.progress?.confirmed === 30, "compromiso La Cascada: confirmed, 30, necesidad completada");
check(cc?.events.map((e: { registryNumber: number }) => e.registryNumber).join(",") === "9,10,11", `eventos del compromiso La Cascada: ${cc?.events.map((e: { type: string }) => e.type).join(", ")}`);
check(c?.needId === NEED && c.status === "confirmed" && c.quantity === 5, `compromiso: ${c?.status}, ${c?.quantity}, necesidad ${c?.needId === NEED ? "El Mirador" : "?"}`);
check(c?.school?.slug === "escuela-demo-el-mirador" && c.need?.title !== undefined && c.progress?.confirmed === 5, `need/school/progress presentes`);
check(c?.events.length === 3 && c.events.map((e: { registryNumber: number }) => e.registryNumber).join(",") === "3,4,5", `eventos de su compromiso: ${c?.events.map((e: { type: string }) => e.type).join(", ")}`);
check((await redirectOf(() => panel.getSchoolPanel())) === "/panel/aliado", "aliado pide panel escuela → redirect a /panel/aliado");
scan("Aliado", sup);
await signOut();

console.log("── Admin");
await signIn("admin");
const ov = await panel.getAdminOverview();
check(JSON.stringify(ov.counts) === JSON.stringify({ pending_validation: 0, published: 2, completed: 1, cancelled: 1 }), `counts ${JSON.stringify(ov.counts)}`);
check(JSON.stringify(ov.publication) === JSON.stringify({ pending: 0, submitted: 13, failed: 0 }), `publication ${JSON.stringify(ov.publication)}`);
// 13 eventos; la actividad reciente está limitada a 10 (RECENT_ACTIVITY_LIMIT), la más reciente primero.
check(ov.recentActivity.length === 10 && ov.recentActivity[0].eventId === "f8249d5c-7bda-4d2e-9d86-788cab33b083", `recentActivity: ${ov.recentActivity.length} (la primera: NEED_VALIDATED #13)`);
const needsAll = await panel.getAdminNeeds(undefined);
const bySchool = needsAll.ok ? Object.fromEntries(needsAll.needs.map((n: { id: string; school: { slug: string } | null }) => [n.id, n.school?.slug])) : {};
check(needsAll.ok && needsAll.needs.length === 4 && needsAll.filter === null && bySchool[NEED] === "escuela-demo-el-mirador" && bySchool[VERCEL_NEED] === "escuela-demo-el-mirador" && bySchool[CASCADA_NEED] === "escuela-demo-la-cascada" && bySchool[ROBLES_NEED] === "escuela-demo-los-robles", `sin filtro: ${needsAll.ok ? needsAll.needs.length : "error"} (cada necesidad con su escuela)`);
const EXPECTED_BY_STATUS: Record<string, string[]> = { pending_validation: [], published: [NEED, VERCEL_NEED].sort(), completed: [CASCADA_NEED], cancelled: [ROBLES_NEED] };
const perStatus: string[] = [];
for (const s of ["pending_validation", "published", "completed", "cancelled"]) {
  const r = await panel.getAdminNeeds(s);
  perStatus.push(`${s}=${r.ok ? r.needs.length : "error"}`);
  check(r.ok && r.filter === s && r.needs.every((n: { status: string }) => n.status === s) && JSON.stringify(r.needs.map((n: { id: string }) => n.id).sort()) === JSON.stringify(EXPECTED_BY_STATUS[s]), `filtro ${s} válido: ${r.ok ? r.needs.length : "error"} (ids esperados)`);
}
console.log(`  ${perStatus.join(" · ")}`);
for (const v of ["", "admin", "supporter", "school", NEED, "'; drop", "PUBLISHED", "Published", ["published", "completed"]]) {
  const r = await panel.getAdminNeeds(v);
  check(!r.ok && r.error === "INVALID_STATUS", `filtro inválido ${JSON.stringify(v)} → INVALID_STATUS`);
}
const review = await panel.getAdminNeedReview(NEED);
check(review?.id === NEED && review.school?.slug === "escuela-demo-el-mirador" && review.validated_at !== null, "revisión de la necesidad (sin acciones)");
check((await panel.getAdminNeedReview("x")) === null, "revisión con id inválido → null");
check((await redirectOf(() => panel.getSupporterPanel())) === "/panel/admin", "admin pide panel aliado → redirect a /panel/admin");
scan("Admin", { ov, needsAll, review });
await signOut();

check(mocked > 0, `createClient sustituido (${mocked} llamadas)`);
console.log(ok ? "\nTODO OK" : "\nHAY FALLOS");
process.exitCode = ok ? 0 : 1;
