/**
 * Utilidades de las regresiones HTTP (solo lectura).
 *
 * - Hablan con un servidor de Escuela Visible YA levantado (`npm run build && npm start`).
 * - Por seguridad solo aceptan una URL local (localhost / 127.0.0.1); para otra URL hay
 *   que poner REGRESSION_ALLOW_REMOTE=1 a propósito (no recomendado: ver docs/REGRESIONES.md).
 * - Inician sesión con las cuentas DEMO (DEMO_ACCOUNT_PASSWORD). La contraseña nunca se imprime.
 */
import { loadEnv } from "./env.mjs";

loadEnv();

export const BASE = (process.env.REGRESSION_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1"].includes(host) && process.env.REGRESSION_ALLOW_REMOTE !== "1") {
  console.error(`REGRESSION_BASE_URL (${BASE}) no es local. Estas pruebas están pensadas para un servidor local.`);
  process.exit(2);
}

export const D = "demo.escuelavisible.example";
export const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
if (!PASSWORD) {
  console.error("Falta DEMO_ACCOUNT_PASSWORD (en .env.local o en el entorno).");
  process.exit(2);
}

let ok = true;
let passed = 0;
let failed = 0;

export function check(condition, text) {
  ok &&= Boolean(condition);
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "✓" : "✗"} ${text}`);
}

/** Resumen final y código de salida (0 = todo OK). */
export function finish() {
  console.log(`\n${ok ? "TODO OK" : "HAY FALLOS"} · ${passed} ✓ · ${failed} ✗`);
  process.exitCode = ok ? 0 : 1;
}

/** Texto visible de una página (sin scripts ni etiquetas). */
export const strip = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** Navegador mínimo: guarda cookies y sigue (o no) redirecciones. */
export class Browser {
  jar = new Map();
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a));
      if (expired || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async request(path, init = {}) {
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: this.cookieHeader() } });
    this.store(res);
    return res;
  }
  /** GET siguiendo redirecciones; devuelve { path, status, html, hops }. */
  async visit(path) {
    const hops = [];
    for (let i = 0; i < 6; i++) {
      const res = await this.request(path);
      if (res.status >= 300 && res.status < 400) {
        path = new URL(res.headers.get("location"), BASE).pathname;
        hops.push(path);
        continue;
      }
      return { path, status: res.status, html: await res.text(), hops };
    }
    throw new Error("demasiadas redirecciones");
  }
  hasAuthCookie() {
    return [...this.jar.keys()].some((k) => /^sb-.*-auth-token/.test(k));
  }
}

/** Envía un <form> de Server Action como un navegador sin JS (progressive enhancement). */
export async function submitForm(browser, pagePath, html, formMatcher, fields) {
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find(formMatcher);
  if (!form) throw new Error(`formulario no encontrado en ${pagePath}`);
  const body = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const value = (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (name) body.append(name, value);
  }
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return browser.request(pagePath, { method: "POST", body });
}

/** Inicia sesión con una cuenta DEMO (`<local>@demo.escuelavisible.example`). */
export async function login(browser, local) {
  const page = await browser.visit("/ingresar");
  return submitForm(browser, "/ingresar", page.html, (f) => f.includes('name="password"'), { email: `${local}@${D}`, password: PASSWORD });
}
