// Acciones de apoyo (B4) por HTTP SIN ESCRITURAS: «Quiero apoyar», página de compromiso,
// CSRF, sin sesión, rol incorrecto, cantidad inválida o mayor que lo disponible, botones por estado.
//
// SOLO LECTURA. Requiere un servidor local levantado (REGRESSION_BASE_URL, por defecto
// http://localhost:3000), .env.local con DEMO_ACCOUNT_PASSWORD y la secret key (solo para
// leer la referencia de privacidad). Las expectativas codifican el estado DEMO posterior al
// E2E real de B4 (ver docs/REGRESIONES.md).
import { BASE, Browser, check, finish, login, strip } from "./lib/http.mjs";
import { loadReference } from "./lib/reference.mjs";

const ref = await loadReference();

// B4 por HTTP, SIN ESCRITURAS: los envíos se rechazan antes de la RPC (CSRF,
// sin sesión, rol incorrecto, cantidad no numérica o mayor que la meta).
const MIRADOR_NEED = "769e4e92-4d46-4421-9d7b-c998f125a480";
const CASCADA_NEED = "67c4425c-0622-4cd4-9306-b055da760f19";
const ROBLES_NEED = "9b9912da-8149-466e-9eeb-b7dc829bd477";
const APOYAR = (id) => `/panel/aliado/apoyar/${id}`;
const PERSONS = ref.personIds;
const SCHOOLS = ref.schoolIds;
const FORBIDDEN = ["supporter_id", "confirmed_by", "created_by", "validated_by", "delivery_note", "delivery_evidence_path", "submission_error", "attempts", "sb_secret_", "school_id", "supporterId", "schoolId"];
const CLAIMS = [/Hedera (confirm|demuestr|verific|prueb)/i, /entrega verificada/i, /garantiza/i, /verificad[oa]/i];
function privacy(label, html) {
  const keys = FORBIDDEN.filter((k) => html.includes(k));
  if (/\\?"note\\?"\s*:/.test(html)) keys.push("note");
  const persons = PERSONS.filter((p) => html.includes(p)).length;
  const schools = SCHOOLS.filter((p) => html.includes(p)).length;
  const emails = /[\w.+-]+@[\w-]+\.(example|com|co|org|test)\b/.test(html);
  const claims = CLAIMS.filter((re) => re.test(strip(html))).map(String);
  const good = keys.length === 0 && persons === 0 && schools === 0 && !emails && claims.length === 0;
  check(good, `privacidad ${label}: ${good ? "0 coincidencias" : JSON.stringify({ keys, persons, schools, emails, claims })}`);
}
const formOf = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="quantity"'));
function body(form, fields) {
  const b = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const value = (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (name) b.append(name, value);
  }
  for (const [k, v] of Object.entries(fields)) b.append(k, v);
  return b;
}

console.log("── Página pública: «Quiero apoyar»");
{
  const anon = new Browser();
  {
    const r = await anon.visit(`/necesidades/${CASCADA_NEED}`);
    check(r.status === 200 && strip(r.html).includes("Completada") && !r.html.includes("/panel/aliado/apoyar/") && !strip(r.html).includes("Quiero apoyar"), "La Cascada (completed): SIN «Quiero apoyar»");
    privacy("necesidad pública La Cascada (completada)", r.html);
  }
  for (const [label, id] of [["El Mirador", MIRADOR_NEED]]) {
    const r = await anon.visit(`/necesidades/${id}`);
    check(r.status === 200 && r.html.includes(`href="${APOYAR(id)}"`) && strip(r.html).includes("Quiero apoyar"), `${label} (published): enlace «Quiero apoyar» → ${APOYAR(id).slice(0, 30)}…`);
    privacy(`necesidad pública ${label}`, r.html);
  }
  check((await anon.visit(`/necesidades/${ROBLES_NEED}`)).status === 404, "Los Robles (cancelled): no pública (404), sin enlace");
  for (const p of ["/", "/escuelas/escuela-demo-la-cascada"]) {
    const r = await anon.visit(p);
    check(r.status === 200 && !r.html.includes("/panel/aliado/apoyar/"), `${p}: sin cambios (sin enlace de apoyo)`);
  }
}

console.log("── /panel/aliado/apoyar/[needId] por rol");
{
  const anon = new Browser();
  check((await anon.visit(APOYAR(CASCADA_NEED))).path === "/ingresar", "sin sesión → /ingresar");
  for (const [local, expect] of [["la-cascada", "/panel/escuela"], ["admin", "/panel/admin"]]) {
    const b = new Browser(); await login(b, local);
    check((await b.visit(APOYAR(CASCADA_NEED))).path === expect, `${local} → ${expect}`);
  }
}
const sup = new Browser(); await login(sup, "aliado");
// La Cascada está completada: la página de apoyo no ofrece formulario.
{
  const c = await sup.visit(APOYAR(CASCADA_NEED)); const ct = strip(c.html);
  check(c.status === 200 && /Meta 30 refrigerios/.test(ct) && /Comprometido 30 refrigerios/.test(ct) && /Disponible 0 refrigerios/.test(ct) && ct.includes("Esta necesidad no está abierta a compromisos.") && !formOf(c.html), "La Cascada (completed): meta 30 · comprometido 30 · disponible 0 · sin formulario");
  privacy("apoyar La Cascada (completada)", c.html);
}
// El formulario se comprueba en El Mirador (published, disponible 15). Solo lectura y envíos rechazados.
const page = await sup.visit(APOYAR(MIRADOR_NEED)); const pt = strip(page.html);
const form = formOf(page.html);
check(page.status === 200 && pt.includes("Kits de materiales escolares (DEMO)") && pt.includes("El Mirador") && pt.includes("DEMO"), "aliado: necesidad, escuela y DEMO (El Mirador)");
check(/Meta 20 kits/.test(pt) && /Comprometido 5 kits/.test(pt) && /Disponible 15 kits/.test(pt), "meta 20 · comprometido 5 · disponible 15");
check(pt.includes("Comprometerte no es entregar") && pt.includes("cuando la escuela confirma la recepción"), "aviso: comprometer no es entregar");
check(!!form && /name="quantity"/.test(form) && !/name="(supporterId|userId|schoolId|role|note|deliveryNote)"/.test(page.html), "formulario: solo cantidad (+ needId oculto); sin identidad ni notas");
check(strip(form ?? "").includes("Comprometer apoyo"), "botón «Comprometer apoyo»");
privacy("apoyar El Mirador", page.html);
{
  check(!!form, "El Mirador (published, disponible 15): formulario presente");
  check((await sup.visit(APOYAR(ROBLES_NEED))).status === 404, "Los Robles (cancelled, no visible para el aliado) → 404");
  check((await sup.visit(APOYAR("no-es-uuid"))).status === 404, "id inválido → 404");
}

console.log("── Envíos del formulario de compromiso (sin escrituras)");
{
  const res = await sup.request(APOYAR(MIRADOR_NEED), { method: "POST", body: body(form, { quantity: "muchos" }), headers: { origin: "https://sitio-ajeno.example" } });
  const html = await res.text();
  check(res.status >= 400 && !strip(html).includes("Escribe la cantidad como un número"), `CSRF: origen ajeno → HTTP ${res.status}, la acción no se ejecuta`);
}
{
  const anon = new Browser();
  const res = await anon.request(APOYAR(MIRADOR_NEED), { method: "POST", body: body(form, { quantity: "muchos" }), headers: { origin: BASE } });
  check(res.status === 303 && (res.headers.get("location") ?? "").endsWith("/ingresar"), `sin sesión → ${res.status} /ingresar`);
}
for (const [local, expect] of [["la-cascada", "/panel/escuela"], ["admin", "/panel/admin"]]) {
  const b = new Browser(); await login(b, local);
  const res = await b.request(APOYAR(MIRADOR_NEED), { method: "POST", body: body(form, { quantity: "muchos" }), headers: { origin: BASE } });
  check(res.status === 303 && (res.headers.get("location") ?? "").endsWith(expect), `${local} POST → ${res.status} ${expect}`);
}
{
  const res = await sup.request(APOYAR(MIRADOR_NEED), { method: "POST", body: body(form, { quantity: "muchos", supporterId: PERSONS[0] ?? "", schoolId: SCHOOLS[0] ?? "" }), headers: { origin: BASE } });
  const html = await res.text();
  check(res.status === 200 && strip(html).includes("Escribe la cantidad como un número") && html.includes('value="muchos"'), "aliado con cantidad no numérica → mensaje, conserva lo escrito");
  privacy("respuesta cantidad inválida", html);
  const res2 = await sup.request(APOYAR(MIRADOR_NEED), { method: "POST", body: body(form, { quantity: "999" }), headers: { origin: BASE } });
  const t2 = strip(await res2.text());
  check(res2.status === 200 && t2.includes("La cantidad supera lo disponible (15)."), "aliado con 999 > disponible → «La cantidad supera lo disponible (15).» (rechazado antes de la RPC)");
}

console.log("── Paneles: botones solo en los estados correctos");
{
  const p = await sup.visit("/panel/aliado"); const t = strip(p.html);
  check(!t.includes("Reportar entregas se habilitará") && t.includes("Quiero apoyar"), "panel aliado: placeholder retirado; indica «Quiero apoyar»");
  check(t.includes("2 Recepción confirmada por la escuela") && !t.includes("Reportar entrega") && !/<button/.test(p.html.replace(/<header[\s\S]*?<\/header>/, "")), "2 compromisos confirmed (El Mirador y La Cascada) → sin «Reportar entrega»");
  privacy("panel aliado", p.html);
}
for (const local of ["el-mirador", "la-cascada", "los-robles"]) {
  const b = new Browser(); await login(b, local);
  const p = await b.visit("/panel/escuela"); const t = strip(p.html);
  check(!t.includes("La confirmación se habilitará") && t.includes("0 Entregas por confirmar") && !t.includes("Confirmar recepción"), `panel ${local}: placeholder retirado; 0 entregas pendientes → sin «Confirmar recepción»`);
  privacy(`panel ${local}`, p.html);
}
{
  const b = new Browser(); await login(b, "admin");
  const p = await b.visit("/panel/admin"); const t = strip(p.html);
  check(!t.includes("Comprometer apoyo") && !t.includes("Reportar entrega") && !t.includes("Confirmar recepción"), "panel admin: solo lectura (sin acciones de apoyo)");
}

finish();
