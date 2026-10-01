// Páginas públicas, /verify (verificación en vivo contra el Mirror Node) y paneles con el estado DEMO
// actual: caso activo (El Mirador), completado (La Cascada) y no aprobado (Los Robles).
//
// SOLO LECTURA. Requiere un servidor local levantado (REGRESSION_BASE_URL, por defecto
// http://localhost:3000), .env.local con DEMO_ACCOUNT_PASSWORD y la secret key (solo para
// leer la referencia de privacidad). Las expectativas codifican el estado DEMO posterior al
// E2E real de B4 (ver docs/REGRESIONES.md).
import { Browser, check, finish, login, strip } from "./lib/http.mjs";
import { loadReference } from "./lib/reference.mjs";

const ref = await loadReference();

const CASCADA_NEED = "67c4425c-0622-4cd4-9306-b055da760f19";
const ROBLES_NEED = "9b9912da-8149-466e-9eeb-b7dc829bd477";
const EV = { created6: "79762af8-abf1-4643-8851-66d99a28fca9", validated7: "346b6ff3-a3df-4b40-acdb-094064c96280", created8: "a0693286-f3de-46cf-815f-dc6675e612fc" };
const OLD = ["6d6f7a9a-fdd4-4fb6-8e7a-073d6bcf7abd", "266343ed-0569-4a0b-bac7-fee66eb289ee", "372c08d0-5e99-4040-b786-b3dd3a79d1d9", "c17ce442-3be6-4712-bd0e-d3c286e4f266", "4ab91ead-e462-4b2b-9550-62b9f43d8f0a"];
const PERSONS = ref.personIds;
const CLAIMS = [/Hedera demuestra/i, /Hedera confirma la entrega/i, /Hedera prueba la recepci/i, /entrega verificada/i, /garantiza que la ayuda/i];
const honest = (label, html) => {
  const t = strip(html);
  const bad = CLAIMS.filter((re) => re.test(t)).map(String);
  const persons = PERSONS.filter((p) => html.includes(p)).length;
  check(bad.length === 0 && persons === 0 && !/@demo\.escuelavisible/.test(html), `${label}: sin afirmaciones prohibidas, 0 UUIDs de personas, sin emails`);
};
const verifyPage = async (b, id) => {
  const r = await b.visit(`/verify/${id}`); const s = strip(r.html); const m = s.match(/\((\d+) de (\d+) correctas\)/);
  return { status: r.status, ok: s.includes("Coincide con el registro publicado en Hedera") && m?.[1] === "13" && m?.[2] === "13", m: m ? `${m[1]}/${m[2]}` : "-", html: r.html };
};

console.log("── Público (sin sesión)");
const anon = new Browser();
{
  const c = await anon.visit("/escuelas/escuela-demo-la-cascada"); const t = strip(c.html);
  check(c.status === 200 && t.includes("Refrigerios para jornada comunitaria (DEMO)") && c.html.includes(`/necesidades/${CASCADA_NEED}`), "La Cascada (pública): muestra la necesidad publicada");
  honest("escuela La Cascada", c.html);
  const r = await anon.visit("/escuelas/escuela-demo-los-robles"); const rt = strip(r.html);
  check(r.status === 200 && !rt.includes("Pintura para un aula") && !r.html.includes(ROBLES_NEED), "Los Robles (pública): la necesidad no aprobada NO aparece");
  honest("escuela Los Robles", r.html);
  const n = await anon.visit(`/necesidades/${CASCADA_NEED}`); const nt = strip(n.html);
  check(n.status === 200 && nt.includes("Completada") && [6, 7, 9, 10, 11].every((k) => nt.includes(`Registro n.º ${k} en Hedera`)) && n.html.includes(`/verify/${EV.created6}`) && n.html.includes(`/verify/${EV.validated7}`) && n.html.includes("/verify/17146fd2-a578-49d2-8fee-01e17fccc662"), "necesidad La Cascada (pública): «Completada», historial registros 6, 7, 9, 10, 11 con enlaces a /verify");
  check(/30 de 30 refrigerios confirmados por la escuela/.test(nt) && nt.includes("La escuela confirmó la recepción de 30 refrigerios"), "progreso 30 de 30 confirmado por la escuela");
  honest("necesidad La Cascada", n.html);
  const x = await anon.visit(`/necesidades/${ROBLES_NEED}`);
  check(x.status === 404 && !strip(x.html).includes("Pintura para un aula"), `necesidad Los Robles (cancelada) pública → ${x.status}`);
  const home = await anon.visit("/");
  check(home.status === 200 && !strip(home.html).includes("Pintura para un aula"), "portada 200, sin la necesidad no aprobada");
  for (const [k, id] of [["NEED_CREATED La Cascada", EV.created6], ["NEED_VALIDATED La Cascada", EV.validated7]]) {
    const v = await verifyPage(anon, id); check(v.status === 200 && v.ok, `/verify ${k} (público): ${v.status} · ${v.m} · coincide`);
    honest(`/verify ${k}`, v.html);
  }
  const v8 = await anon.visit(`/verify/${EV.created8}`);
  check(v8.status === 404, `/verify NEED_CREATED Los Robles (necesidad no aprobada) para el público → ${v8.status} (RLS: no es pública)`);
  for (const id of OLD) { const v = await verifyPage(anon, id); check(v.ok, `/verify ${id.slice(0, 8)}… (El Mirador) ${v.m}`); }
}

console.log("── Paneles");
{
  const b = new Browser(); await login(b, "la-cascada");
  const p = await b.visit("/panel/escuela"); const t = strip(p.html);
  check(["0 Pendientes de validación", "0 Abiertas a apoyos", "1 Completadas", "0 No aprobadas", "0 Entregas por confirmar"].every((x) => t.includes(x)) && t.includes("Refrigerios para jornada comunitaria (DEMO)") && !t.includes("El Mirador"), "panel La Cascada: 1 completada, 0 entregas pendientes, solo su necesidad");
  const h = await b.visit(`/panel/escuela/necesidades/${CASCADA_NEED}`);
  check(h.status === 200 && [6, 7, 9, 10, 11].every((k) => strip(h.html).includes(`Registro n.º ${k} en Hedera`)), "historial en el panel: 5 pasos (6, 7, 9, 10, 11)");
  honest("panel La Cascada", p.html);
}
{
  const b = new Browser(); await login(b, "los-robles");
  const p = await b.visit("/panel/escuela"); const t = strip(p.html);
  check(["0 Pendientes de validación", "0 Abiertas a apoyos", "1 No aprobadas"].every((x) => t.includes(x)) && t.includes("Pintura para un aula"), "panel Los Robles: 1 no aprobada (visible solo para su escuela)");
  const h = await b.visit(`/panel/escuela/necesidades/${ROBLES_NEED}`); const ht = strip(h.html);
  check(h.status === 200 && ht.includes("No aprobada") && ht.includes("Registro n.º 8 en Hedera") && !ht.includes("Registro n.º 9"), "historial Los Robles: solo NEED_CREATED (registro 8); el rechazo no tiene registro");
  const v = await verifyPage(b, EV.created8); check(v.ok, `/verify NEED_CREATED Los Robles con sesión de su escuela: ${v.m}`);
  honest("panel Los Robles", p.html);
}
{
  const b = new Browser(); await login(b, "admin");
  const p = await b.visit("/panel/admin"); const t = strip(p.html);
  check(["4 Todas", "0 Pendientes de validación", "2 Abiertas a apoyos", "1 Completadas", "1 No aprobadas", "13 Publicados", "0 Pendientes", "0 Fallidos"].every((x) => t.includes(x)), "panel admin: 4 / 0 / 2 / 1 / 1 · publicación 13 / 0 / 0");
  for (const id of [CASCADA_NEED, ROBLES_NEED]) {
    const r = await b.visit(`/panel/admin/necesidades/${id}`); const rt = strip(r.html);
    check(rt.includes("Esta necesidad ya fue revisada.") && !rt.includes("Validar y publicar"), `revisión ${id.slice(0, 8)}…: ya revisada, sin botones`);
  }
  honest("panel admin", p.html);
}
{
  const b = new Browser(); await login(b, "aliado");
  const p = await b.visit("/panel/aliado"); const t = strip(p.html);
  check((p.html.match(/<article/g) ?? []).length === 2 && t.includes("2 Recepción confirmada por la escuela") && t.includes("0 Entrega reportada"), "panel aliado: 2 compromisos confirmados, 0 entregas reportadas pendientes");
}

finish();
