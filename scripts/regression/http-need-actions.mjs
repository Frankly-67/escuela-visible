// Acciones de necesidades (B3) por HTTP SIN ESCRITURAS: formulario de la escuela, CSRF, sin sesión,
// rol incorrecto y datos inválidos (los envíos se rechazan antes de crear nada).
//
// SOLO LECTURA. Requiere un servidor local levantado (REGRESSION_BASE_URL, por defecto
// http://localhost:3000), .env.local con DEMO_ACCOUNT_PASSWORD y la secret key (solo para
// leer la referencia de privacidad). Las expectativas codifican el estado DEMO posterior al
// E2E real de B4 (ver docs/REGRESIONES.md).
import { BASE, Browser, check, finish, login, strip } from "./lib/http.mjs";
import { loadReference } from "./lib/reference.mjs";

const ref = await loadReference();

// B3 por HTTP, SIN ESCRITURAS: todos los envíos usan datos inválidos (meta no
// numérica) o se rechazan antes de llegar a createNeed (CSRF, sin sesión, rol).
const NEED = "769e4e92-4d46-4421-9d7b-c998f125a480";
const NEW = "/panel/escuela/necesidades/nueva";
const PERSONS = ref.personIds;
const SCHOOLS = ref.schoolIds;
const OTHER_SCHOOL = ref.miradorSchoolId;
const FORBIDDEN = ["supporter_id", "confirmed_by", "created_by", "validated_by", "delivery_note", "delivery_evidence_path", "submission_error", "attempts", "sb_secret_", "school_id", "schoolId"];
function privacy(label, html) {
  const keys = FORBIDDEN.filter((k) => html.includes(k));
  if (/\\?"note\\?"\s*:/.test(html)) keys.push("note");
  const persons = PERSONS.filter((p) => html.includes(p)).length;
  const schools = SCHOOLS.filter((p) => html.includes(p)).length;
  const emails = /[\w.+-]+@[\w-]+\.(example|com|co|org|test)\b/.test(html);
  const verified = /verificad[oa]/i.test(html);
  const good = keys.length === 0 && persons === 0 && schools === 0 && !emails && !verified;
  check(good, `privacidad ${label}: ${good ? "0 coincidencias" : JSON.stringify({ keys, persons, schools, emails, verified })}`);
}
// Envío del formulario de necesidad con datos INVÁLIDOS (nunca llega a createNeed).
const INVALID = { kind: "need", title: "Prueba HTTP B3 (no se guarda)", description: "", category: "materiales", priority: "media", goalQuantity: "no-es-numero", goalUnit: "kits", eventDate: "", schoolId: OTHER_SCHOOL, role: "admin", userId: PERSONS[0] ?? "" };
const formOf = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="goalQuantity"'));
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

console.log("── Página «Registrar necesidad» por rol");
{
  const anon = new Browser();
  check((await anon.visit(NEW)).path === "/ingresar", `sin sesión: ${NEW} → /ingresar`);
  for (const [local, expect] of [["aliado", "/panel/aliado"], ["admin", "/panel/admin"]]) {
    const b = new Browser(); await login(b, local);
    check((await b.visit(NEW)).path === expect, `${local}: ${NEW} → ${expect}`);
  }
}

const school = new Browser(); await login(school, "el-mirador");
const panel = await school.visit("/panel/escuela");
check(panel.html.includes(`href="${NEW}"`) && strip(panel.html).includes("Registrar necesidad") && !strip(panel.html).includes("Crear necesidades se habilitará"), "panel escuela: enlace «Registrar necesidad»");
privacy("panel escuela", panel.html);
const page = await school.visit(NEW); const pt = strip(page.html);
const form = formOf(page.html);
check(page.status === 200 && !!form, "formulario presente para school_rep");
check(pt.includes("Protege la privacidad de los estudiantes") && pt.includes("No incluyas nombres de menores") && pt.includes("datos médicos") && pt.includes("forma agregada"), "aviso explícito de privacidad");
check(!/name="schoolId"|name="role"|name="userId"/.test(page.html), "el formulario no tiene campos de escuela, rol ni usuario");
check(["kind", "title", "description", "category", "priority", "goalQuantity", "goalUnit", "eventDate"].every((n) => page.html.includes(`name="${n}"`)), "campos: tipo, título, descripción, categoría, prioridad, meta, unidad, fecha");
privacy("formulario", page.html);

console.log("── Envíos del formulario (sin escrituras)");
{
  // CSRF: origen ajeno, con sesión de escuela.
  const res = await school.request(NEW, { method: "POST", body: body(form, INVALID), headers: { origin: "https://sitio-ajeno.example" } });
  const html = await res.text();
  check(res.status >= 400 && !strip(html).includes("Escribe la meta como un número"), `CSRF: origen ajeno → HTTP ${res.status}, la acción no se ejecuta`);
}
{
  const anon = new Browser();
  const res = await anon.request(NEW, { method: "POST", body: body(form, INVALID), headers: { origin: BASE } });
  const loc = res.headers.get("location") ?? "";
  check(res.status >= 300 && res.status < 400 && loc.endsWith("/ingresar"), `sin sesión → HTTP ${res.status} a ${loc.replace(BASE, "")}`);
}
for (const [local, expect] of [["aliado", "/panel/aliado"], ["admin", "/panel/admin"]]) {
  const b = new Browser(); await login(b, local);
  const res = await b.request(NEW, { method: "POST", body: body(form, INVALID), headers: { origin: BASE } });
  const loc = res.headers.get("location") ?? "";
  check(res.status >= 300 && res.status < 400 && loc.endsWith(expect), `${local} enviando el formulario de escuela → HTTP ${res.status} a ${loc.replace(BASE, "")}`);
}
{
  const res = await school.request(NEW, { method: "POST", body: body(form, INVALID), headers: { origin: BASE } });
  const html = await res.text(); const t = strip(html);
  check(res.status === 200 && t.includes("Escribe la meta como un número") && html.includes('value="Prueba HTTP B3 (no se guarda)"'), "escuela con meta inválida → mensaje y conserva lo escrito (no se guarda nada)");
  check(!html.includes(OTHER_SCHOOL), "el schoolId enviado no vuelve en la respuesta");
}

console.log("── Revisión admin");
{
  const b = new Browser(); await login(b, "admin");
  const rv = await b.visit(`/panel/admin/necesidades/${NEED}`); const t = strip(rv.html);
  check(rv.status === 200 && t.includes("Esta necesidad ya fue revisada.") && !t.includes("Validar y publicar") && !t.includes("No aprobar") && !/<form/.test(rv.html.replace(/<header[\s\S]*?<\/header>/, "")), "necesidad publicada: sin botones de validar / no aprobar");
  check(!t.includes("La validación se habilitará en una fase posterior"), "texto «se habilitará» retirado");
  privacy("revisión admin", rv.html);
  const ov = await b.visit("/panel/admin");
  check(strip(ov.html).includes("entra en «Revisar»"), "panel admin: texto de introducción actualizado");
}

finish();
