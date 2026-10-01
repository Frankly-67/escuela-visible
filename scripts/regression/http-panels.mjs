// Paneles por rol (B2): aislamiento entre escuelas y aliados, roles, parámetros manipulados,
// filtros del admin, páginas de detalle y privacidad del HTML completo (incluido el payload RSC).
//
// SOLO LECTURA. Requiere un servidor local levantado (REGRESSION_BASE_URL, por defecto
// http://localhost:3000), .env.local con DEMO_ACCOUNT_PASSWORD y la secret key (solo para
// leer la referencia de privacidad). Las expectativas codifican el estado DEMO posterior al
// E2E real de B4 (ver docs/REGRESIONES.md).
import { Browser, check, finish, login, strip } from "./lib/http.mjs";
import { loadReference } from "./lib/reference.mjs";

const ref = await loadReference();

const NEED = "769e4e92-4d46-4421-9d7b-c998f125a480";
// Estado DEMO tras el E2E real de B3 (aprobado): La Cascada publicada, Los Robles no aprobada.
const CASCADA_NEED = "67c4425c-0622-4cd4-9306-b055da760f19";
const ROBLES_NEED = "9b9912da-8149-466e-9eeb-b7dc829bd477";
const PERSONS = ref.personIds;
const SCHOOLS = ref.schoolIds;
const FORBIDDEN = ["supporter_id", "confirmed_by", "created_by", "validated_by", "delivery_note", "delivery_evidence_path", "submission_error", "attempts", "sb_secret_", "school_id"];
let scanned = 0;
function privacy(label, html) {
  scanned++;
  const keys = FORBIDDEN.filter((k) => html.includes(k));
  if (/\?"note\?"\s*:/.test(html)) keys.push("note");  // clave de datos (no el atributo ARIA role="note")
  const persons = PERSONS.filter((p) => html.includes(p)).length;
  const schools = SCHOOLS.filter((p) => html.includes(p)).length;
  const emails = /[\w.+-]+@[\w-]+\.(example|com|co|org|test)\b/.test(html);
  const verified = /verificad[oa]/i.test(html);
  const ok_ = keys.length === 0 && persons === 0 && schools === 0 && !emails && !verified;
  check(ok_, `privacidad ${label}: ${ok_ ? "0 coincidencias" : JSON.stringify({ keys, persons, schools, emails, verified })}`);
}
const verifyLinks = (html) => new Set([...html.matchAll(/href="\/verify\/([0-9a-f-]{36})"/g)].map((m) => m[1]));
const TAMPER = `?schoolId=${ref.miradorSchoolId}&supporterId=${NEED}&userId=${NEED}&role=admin`;
// Next incluye en su payload la URL pedida (con su query): se quitan esos valores, que vienen del propio navegador.
const unecho = (html) => [ref.miradorSchoolId, NEED].reduce((h, v) => h.split(v).join(""), html);
const noActions = (html) => !/<button|<form/.test(html.replace(/<header[\s\S]*?<\/header>/, ""));

console.log("── Sin sesión");
{
  const b = new Browser();
  for (const p of ["/panel/escuela", "/panel/aliado", "/panel/admin", `/panel/escuela/necesidades/${NEED}`, `/panel/admin/necesidades/${NEED}`]) {
    const r = await b.visit(p);
    check(r.path === "/ingresar", `${p} → ${r.path}`);
  }
}

console.log("── Escuela El Mirador");
{
  const b = new Browser(); await login(b, "el-mirador");
  const r = await b.visit("/panel/escuela"); const t = strip(r.html);
  check(r.status === 200 && t.includes("El Mirador") && t.includes("DEMO"), "ve su escuela (con DEMO)");
  check(r.html.includes(`href="/panel/escuela/necesidades/${NEED}"`) && /5 de 20 \S+ confirmados por la escuela/.test(t), "ve su necesidad con progreso «5 de 20 … confirmados por la escuela»");
  check(["0 Pendientes de validación", "1 Abiertas a apoyos", "0 Completadas", "0 No aprobadas", "0 Entregas por confirmar"].every((x) => t.includes(x)), "resumen: 0 / 1 / 0 / 0 / 0 entregas");
  check(t.includes("No hay entregas pendientes de confirmar.") && t.includes("Solo lo confirmado por la escuela cuenta como recibido"), "estado vacío de entregas y texto de recepción");
  check(noActions(r.html), "sin botones ni formularios de acción en el contenido");
  privacy("El Mirador /panel/escuela", r.html);
  const rt = await b.visit("/panel/escuela" + TAMPER);
  check(strip(rt.html) === t, "con ?schoolId=&supporterId=&userId=&role= el contenido es idéntico");
  const h = await b.visit(`/panel/escuela/necesidades/${NEED}`); const ht = strip(h.html);
  const links = verifyLinks(h.html);
  check(h.status === 200 && [1, 2, 3, 4, 5].every((n) => ht.includes(`Registro n.º ${n} en Hedera`)), "historial: 5 pasos (registros 1–5)");
  check(links.size === 5, `historial: ${links.size} enlaces distintos a /verify`);
  check(/5 de 20 \S+ confirmados por la escuela/.test(ht), "historial: progreso 5 de 20");
  privacy("El Mirador historial", h.html);
  for (const bad of ["no-es-uuid", "00000000-0000-4000-8000-000000000000"]) {
    const x = await b.visit(`/panel/escuela/necesidades/${bad}`);
    check(x.status === 404, `historial ${bad} → ${x.status}`);
  }
  const cross = await b.visit(`/panel/admin/necesidades/${NEED}`);
  check(cross.path === "/panel/escuela", `escuela → revisión admin → ${cross.path}`);
  const cross2 = await b.visit(`/panel/aliado`);
  check(cross2.path === "/panel/escuela", `escuela → panel aliado → ${cross2.path}`);
}

console.log("── Escuela La Cascada");
{
  const b = new Browser(); await login(b, "la-cascada");
  const r = await b.visit("/panel/escuela"); const t = strip(r.html);
  check(r.status === 200 && t.includes("La Cascada") && !t.includes("El Mirador") && !r.html.includes(NEED) && !r.html.includes(ROBLES_NEED) && !t.includes("Pintura para un aula"), "ve solo La Cascada (nada de El Mirador ni de Los Robles)");
  const rt = await b.visit("/panel/escuela" + TAMPER);
  check(strip(rt.html) === t && !unecho(rt.html).includes(NEED), "con ?schoolId= de El Mirador: mismo contenido, nada de El Mirador");
  privacy("La Cascada ?schoolId= (sin el eco de la URL)", unecho(rt.html));
  check(["0 Pendientes de validación", "0 Abiertas a apoyos", "1 Completadas", "0 No aprobadas", "0 Entregas por confirmar"].every((x) => t.includes(x)) && t.includes("Refrigerios para jornada comunitaria (DEMO)") && /30 de 30 \S+ confirmados por la escuela/.test(t) && (r.html.match(/href="\/panel\/escuela\/necesidades\/[0-9a-f-]{36}"/g) ?? []).length === 1 && r.html.includes(`href="/panel/escuela/necesidades/${CASCADA_NEED}"`), "1 necesidad propia (completada 30/30) y 0 entregas");
  const hr = await b.visit(`/panel/escuela/necesidades/${ROBLES_NEED}`);
  check(hr.status === 404 && !strip(hr.html).includes("Pintura"), `historial de Los Robles → ${hr.status}`);
  privacy("La Cascada /panel/escuela", r.html);
  const h = await b.visit(`/panel/escuela/necesidades/${NEED}`);
  check(h.status === 404 && !strip(h.html).includes("El Mirador"), `historial de El Mirador → ${h.status}`);
  privacy("La Cascada 404", h.html);
}

console.log("── Escuela Los Robles");
{
  const b = new Browser(); await login(b, "los-robles");
  const r = await b.visit("/panel/escuela"); const t = strip(r.html);
  check(r.status === 200 && t.includes("Los Robles") && t.includes("Pintura para un aula") && !t.includes("El Mirador") && !t.includes("Refrigerios") && !r.html.includes(NEED) && !r.html.includes(CASCADA_NEED), "ve solo Los Robles (su necesidad no aprobada)");
  check(["0 Pendientes de validación", "0 Abiertas a apoyos", "0 Completadas", "1 No aprobadas", "0 Entregas por confirmar"].every((x) => t.includes(x)), "resumen 0 / 0 / 0 / 1 / 0");
  privacy("Los Robles /panel/escuela", r.html);
  const rt = await b.visit("/panel/escuela" + TAMPER);
  check(strip(rt.html) === t, "con ?schoolId= de El Mirador: mismo contenido");
  for (const other of [NEED, CASCADA_NEED]) {
    const h = await b.visit(`/panel/escuela/necesidades/${other}`);
    check(h.status === 404, `historial de otra escuela ${other.slice(0, 8)}… → ${h.status}`);
  }
}

console.log("── Aliado");
{
  const b = new Browser(); await login(b, "aliado");
  const r = await b.visit("/panel/aliado"); const t = strip(r.html);
  const cards = (r.html.match(/<article/g) ?? []).length;
  check(r.status === 200 && cards === 2, `${cards} compromisos`);
  check(["0 Apoyo comprometido", "0 Entrega reportada", "2 Recepción confirmada por la escuela"].every((x) => t.includes(x)), "resumen 0 / 0 / 2");
  const articles = [...r.html.matchAll(/<article[\s\S]*?<\/article>/g)].map((m) => strip(m[0]));
  check(articles.length === 2 && articles.every((a) => a.includes("Recepción confirmada por la escuela")), "estado de ambos compromisos: «Recepción confirmada por la escuela»");
  check(t.includes("El Mirador") && t.includes("DEMO") && /5 de 20 \S+ confirmados por la escuela/.test(t), "escuela, DEMO y progreso de la necesidad");
  const links = verifyLinks(r.html);
  check(links.size === 6 && [3, 4, 5, 9, 10, 11].every((n) => t.includes(`Registro n.º ${n} en Hedera`)), `${links.size} enlaces a /verify (registros 3, 4, 5, 9, 10, 11)`);
  check(noActions(r.html), "sin botones de acción (no reportar entrega)");
  privacy("Aliado /panel/aliado", r.html);
  const rt = await b.visit("/panel/aliado" + TAMPER);
  check(strip(rt.html) === t, "con ?supporterId=&userId=… el contenido es idéntico");
  for (const p of ["/panel/escuela", `/panel/admin/necesidades/${NEED}`, `/panel/escuela/necesidades/${NEED}`]) {
    const x = await b.visit(p);
    check(x.path === "/panel/aliado", `aliado → ${p} → ${x.path}`);
  }
}

console.log("── Admin");
{
  const b = new Browser(); await login(b, "admin");
  const r = await b.visit("/panel/admin"); const t = strip(r.html);
  check(["3 Todas", "0 Pendientes de validación", "1 Abiertas a apoyos", "1 Completadas", "1 No aprobadas"].every((x) => t.includes(x)), "contadores 3 / 0 / 1 / 1 / 1");
  check(["11 Publicados", "0 Pendientes", "0 Fallidos"].every((x) => t.includes(x)) && !t.includes("Hay registros con publicación fallida"), "publicación 11 / 0 / 0, sin aviso de fallos");
  const activity = r.html.slice(r.html.indexOf('id="actividad"'));
  check(verifyLinks(activity).size === 10, `actividad reciente: ${verifyLinks(activity).size} eventos con «Ver verificación» (límite 10)`);
  check(r.html.includes(`href="/panel/admin/necesidades/${NEED}"`) && t.includes("Revisar"), "lista con «Revisar»");
  check(noActions(r.html), "sin botones validar/rechazar");
  privacy("Admin /panel/admin", r.html);
  for (const [s, n] of [["pending_validation", 0], ["published", 1], ["completed", 1], ["cancelled", 1]]) {
    const x = await b.visit(`/panel/admin?estado=${s}`); const xt = strip(x.html);
    const found = (x.html.match(/href="\/panel\/admin\/necesidades\//g) ?? []).length;
    check(x.status === 200 && found === n && (n > 0 || xt.includes("No hay necesidades en este estado.")) && /aria-current="page"/.test(x.html), `filtro ${s}: ${found} necesidad(es)`);
    privacy(`Admin ?estado=${s}`, x.html);
  }
  for (const v of ["admin", "supporter", "school", NEED, "'; drop", "PUBLISHED", "Published", ""]) {
    const x = await b.visit(`/panel/admin?estado=${encodeURIComponent(v)}`); const xt = strip(x.html);
    check(x.status === 200 && xt.includes("El filtro de estado no es válido.") && xt.includes("Ver todas") && !x.html.includes(`href="/panel/admin/necesidades/`), `filtro inválido ${JSON.stringify(v)} → mensaje, sin lista`);
  }
  {
    const x = await b.visit(`/panel/admin?estado=published&estado=completed`);
    check(strip(x.html).includes("El filtro de estado no es válido."), "filtro repetido → inválido");
  }
  const rt = await b.visit("/panel/admin" + TAMPER);
  check(strip(rt.html) === t, "con ?schoolId=&userId=&role=… el contenido es idéntico");
  const rv = await b.visit(`/panel/admin/necesidades/${NEED}`); const rvt = strip(rv.html);
  check(rv.status === 200 && rvt.includes("Revisión de privacidad") && rvt.includes("No incluye nombres de menores.") && rvt.includes("Esta necesidad ya fue revisada.") && rvt.includes("DEMO") && rv.html.includes(`href="/necesidades/${NEED}"`), "página de revisión: campos, escuela DEMO, checklist, enlace");
  check(noActions(rv.html), "revisión sin botones validar/rechazar");
  privacy("Admin revisión", rv.html);
  for (const bad of ["x", "00000000-0000-4000-8000-000000000000"]) {
    const x = await b.visit(`/panel/admin/necesidades/${bad}`);
    check(x.status === 404, `revisión ${bad} → ${x.status}`);
  }
  const cross = await b.visit(`/panel/escuela/necesidades/${NEED}`);
  check(cross.path === "/panel/admin", `admin → historial escuela → ${cross.path}`);
  const cross2 = await b.visit(`/panel/aliado`);
  check(cross2.path === "/panel/admin", `admin → panel aliado → ${cross2.path}`);
}

console.log("── Regresión pública");
{
  const b = new Browser();
  for (const p of ["/", "/escuelas/escuela-demo-el-mirador", `/necesidades/${NEED}`]) {
    const r = await b.visit(p); check(r.status === 200, `${p} → ${r.status}`);
  }
  const ids = ["6d6f7a9a-fdd4-4fb6-8e7a-073d6bcf7abd", "266343ed-0569-4a0b-bac7-fee66eb289ee", "372c08d0-5e99-4040-b786-b3dd3a79d1d9", "c17ce442-3be6-4712-bd0e-d3c286e4f266", "4ab91ead-e462-4b2b-9550-62b9f43d8f0a"];
  for (const id of ids) {
    const s = strip((await b.visit(`/verify/${id}`)).html); const m = s.match(/\((\d+) de (\d+) correctas\)/);
    check(s.includes("Coincide con el registro publicado en Hedera") && m?.[1] === "13" && m?.[2] === "13", `/verify/${id.slice(0, 8)}… ${m ? `${m[1]}/${m[2]}` : "?"}`);
  }
}
console.log(`\npáginas de panel escaneadas: ${scanned}`);

finish();
