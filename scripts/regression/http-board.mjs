// Tablón por HTTP SIN ESCRITURAS: /tablon público y su filtro, enlace en la navegación, página
// «Nueva publicación» por rol, envíos rechazados antes de escribir (CSRF, sin sesión, rol,
// teléfono o correo en el texto), revisión del admin por rol y privacidad del HTML.
//
// SOLO LECTURA. Requiere un servidor local levantado (REGRESSION_BASE_URL, por defecto
// http://localhost:3000), .env.local con DEMO_ACCOUNT_PASSWORD y la secret key (solo para leer
// la referencia de privacidad). Funciona con la migración del tablón aplicada o sin aplicar
// (en ese caso las páginas muestran «El tablón aún no está disponible»).
import { BASE, Browser, check, finish, login, strip } from "./lib/http.mjs";
import { loadReference } from "./lib/reference.mjs";

const ref = await loadReference();
const PERSONS = ref.personIds;
const SCHOOLS = ref.schoolIds;
const NEW = "/panel/escuela/publicaciones/nueva";
const REVIEW = "/panel/admin/publicaciones";
const KINDS = ["bazar", "sancocho", "actividad", "mejora_infraestructura", "materiales_escolares", "campana", "proyecto_terminado"];
const FORBIDDEN = ["created_by", "reviewed_by", "createdBy", "reviewedBy", "supporter_id", "sb_secret_", "school_id", "schoolId", "board_create_post", "board_publish_post", "board_reject_post"];
function privacy(label, html) {
  const keys = FORBIDDEN.filter((k) => html.includes(k));
  const persons = PERSONS.filter((p) => html.includes(p)).length;
  const schools = SCHOOLS.filter((p) => html.includes(p)).length;
  const emails = /[\w.+-]+@[\w-]+\.(example|com|co|org|test)\b/.test(html);
  const verified = /verificad[oa]/i.test(html);
  const good = keys.length === 0 && persons === 0 && schools === 0 && !emails && !verified;
  check(good, `privacidad ${label}: ${good ? "0 coincidencias" : JSON.stringify({ keys, persons, schools, emails, verified })}`);
}
const formOf = (html) => [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="body"'));
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
// Envíos con datos que se rechazan ANTES de llegar a la base (nunca se guarda nada).
const WITH_PHONE = { kind: "bazar", title: "Bazar HTTP 300 123 4567", body: "", eventDate: "", schoolId: ref.miradorSchoolId, role: "admin" };
const WITH_EMAIL = { kind: "bazar", title: "Bazar HTTP (no se guarda)", body: "Escribir a rectoria@escuela.edu.co", eventDate: "" };

console.log("── Público: /tablon");
const anon = new Browser();
{
  const home = await anon.visit("/");
  check(home.status === 200 && home.html.includes('href="/tablon"') && strip(home.html).includes("Tablón"), "navegación: enlace «Tablón»");
  const r = await anon.visit("/tablon"); const t = strip(r.html);
  check(r.status === 200 && t.includes("Tablón") && t.includes("Escuela Visible la revisa antes de mostrarla"), "/tablon 200 con explicación de la revisión");
  check(t.includes("no forman parte del registro en Hedera"), "aclara que el tablón no está en Hedera");
  check(KINDS.every((k) => r.html.includes(`href="/tablon?tipo=${k}"`)) && /href="\/tablon"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/tablon"/.test(r.html), "filtro: «Todas» activo + 7 tipos");
  const available = !t.includes("El tablón aún no está disponible");
  check(available ? /<article|Todavía no hay publicaciones/.test(r.html + t) : true, `estado: ${available ? "tablón disponible" : "tablón aún no disponible (migración pendiente)"}`);
  check(!/<form|<button/.test(r.html.replace(/<header[\s\S]*?<\/header>/, "")), "sin formularios ni botones (solo lectura)");
  privacy("/tablon", r.html);
  const f = await anon.visit("/tablon?tipo=sancocho");
  check(f.status === 200 && /href="\/tablon\?tipo=sancocho"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/tablon\?tipo=sancocho"/.test(f.html), "?tipo=sancocho → filtro activo");
  privacy("/tablon?tipo=sancocho", f.html);
  for (const v of ["rifa", "BAZAR", "'; drop", ""]) {
    const x = await anon.visit(`/tablon?tipo=${encodeURIComponent(v)}`);
    check(x.status === 200 && strip(x.html).includes("El filtro de tipo no es válido.") && !/<article/.test(x.html), `?tipo=${JSON.stringify(v)} → mensaje, sin lista`);
  }
  const sp = await anon.visit("/escuelas/escuela-demo-el-mirador");
  check(sp.status === 200 && strip(sp.html).includes("Necesidades"), "página de escuela DEMO sigue funcionando");
  privacy("página de escuela", sp.html);
}

console.log("── «Nueva publicación» por rol");
check((await anon.visit(NEW)).path === "/ingresar", `sin sesión: ${NEW} → /ingresar`);
for (const [local, expect] of [["aliado", "/panel/aliado"], ["admin", "/panel/admin"]]) {
  const b = new Browser(); await login(b, local);
  check((await b.visit(NEW)).path === expect, `${local}: ${NEW} → ${expect}`);
}
const school = new Browser(); await login(school, "el-mirador");
{
  const panel = await school.visit("/panel/escuela"); const pt = strip(panel.html);
  const available = !pt.includes("El tablón aún no está disponible");
  check(pt.includes("Publicaciones en el tablón") && (available ? panel.html.includes(`href="${NEW}"`) : true), `panel escuela: sección del tablón (${available ? "con «Nueva publicación»" : "tablón aún no disponible"})`);
  check(!/<button|<form/.test(panel.html.replace(/<header[\s\S]*?<\/header>/, "")), "panel escuela: sin botones ni formularios de acción");
  privacy("panel escuela", panel.html);
}
const page = await school.visit(NEW); const pt = strip(page.html);
const form = formOf(page.html);
check(page.status === 200 && !!form, "formulario presente para school_rep");
check(pt.includes("Protege la privacidad de los estudiantes") && pt.includes("No incluyas nombres de estudiantes, teléfonos, correos electrónicos ni direcciones") && pt.includes("no se puede editar"), "aviso de privacidad, revisión y sin edición");
check(["kind", "title", "body", "eventDate"].every((n) => page.html.includes(`name="${n}"`)), "campos: tipo, título, texto, fecha");
check(!/name="(schoolId|role|userId|status|image|price|phone|email|needId)"/.test(page.html) && !/type="file"/.test(page.html), "sin campos de escuela, rol, estado, imagen, precio, contacto ni necesidad");
check(KINDS.every((k) => page.html.includes(`value="${k}"`)), "los 7 tipos en el selector");
privacy("formulario", page.html);

console.log("── Envíos (sin escrituras)");
{
  const res = await school.request(NEW, { method: "POST", body: body(form, WITH_PHONE), headers: { origin: "https://sitio-ajeno.example" } });
  const html = await res.text();
  check(res.status >= 400 && !strip(html).includes("No incluyas números de teléfono"), `CSRF: origen ajeno → HTTP ${res.status}, la acción no se ejecuta`);
}
{
  const a = new Browser();
  const res = await a.request(NEW, { method: "POST", body: body(form, WITH_PHONE), headers: { origin: BASE } });
  const loc = res.headers.get("location") ?? "";
  check(res.status >= 300 && res.status < 400 && loc.endsWith("/ingresar"), `sin sesión → HTTP ${res.status} a ${loc.replace(BASE, "")} (sin publicaciones anónimas)`);
}
for (const [local, expect] of [["aliado", "/panel/aliado"], ["admin", "/panel/admin"]]) {
  const b = new Browser(); await login(b, local);
  const res = await b.request(NEW, { method: "POST", body: body(form, WITH_PHONE), headers: { origin: BASE } });
  const loc = res.headers.get("location") ?? "";
  check(res.status >= 300 && res.status < 400 && loc.endsWith(expect), `${local} enviando el formulario → HTTP ${res.status} a ${loc.replace(BASE, "")}`);
}
{
  const res = await school.request(NEW, { method: "POST", body: body(form, WITH_PHONE), headers: { origin: BASE } });
  const html = await res.text(); const t = strip(html);
  check(res.status === 200 && t.includes("No incluyas números de teléfono") && html.includes('value="Bazar HTTP 300 123 4567"'), "escuela con teléfono en el título → bloqueado, conserva lo escrito (no se guarda nada)");
  check(!html.includes(ref.miradorSchoolId), "el schoolId enviado no vuelve en la respuesta");
}
{
  const res = await school.request(NEW, { method: "POST", body: body(form, WITH_EMAIL), headers: { origin: BASE } });
  const t = strip(await res.text());
  check(res.status === 200 && t.includes("No incluyas correos electrónicos"), "escuela con correo en el texto → bloqueado (no se guarda nada)");
}

console.log("── Revisión del admin");
check((await anon.visit(REVIEW)).path === "/ingresar", `sin sesión: ${REVIEW} → /ingresar`);
for (const [b, expect] of [[school, "/panel/escuela"]]) check((await b.visit(REVIEW)).path === expect, `escuela: ${REVIEW} → ${expect}`);
{
  const b = new Browser(); await login(b, "aliado");
  check((await b.visit(REVIEW)).path === "/panel/aliado", `aliado: ${REVIEW} → /panel/aliado`);
}
{
  const b = new Browser(); await login(b, "admin");
  const r = await b.visit(REVIEW); const t = strip(r.html);
  check(r.status === 200 && t.includes("Publicaciones por revisar") && t.includes("Una publicación solo es pública después de aprobarla"), "admin: página de revisión");
  privacy("revisión admin", r.html);
  const ov = await b.visit("/panel/admin"); const ot = strip(ov.html);
  check(ot.includes("Tablón") && (ot.includes("El tablón aún no está disponible") || ov.html.includes(`href="${REVIEW}"`)), "panel admin: sección «Tablón»");
  check(!/<button|<form/.test(ov.html.replace(/<header[\s\S]*?<\/header>/, "")), "panel admin: sigue sin botones de acción (la revisión está en su propia página)");
}

finish();
