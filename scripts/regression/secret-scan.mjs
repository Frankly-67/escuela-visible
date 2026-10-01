// Escaneo de secretos en los archivos del repositorio (versionados y nuevos no
// ignorados). No usa red. Falla si encuentra una coincidencia peligrosa.
//
//  1. VALORES reales de .env.local (si existe): SUPABASE_SECRET_KEY,
//     HEDERA_OPERATOR_KEY y DEMO_ACCOUNT_PASSWORD. Se comparan, nunca se imprimen.
//  2. Formatos de credenciales: secret key de Supabase (sb_secret_…), JWT
//     (claves service_role antiguas), claves privadas PEM y claves privadas
//     DER de Hedera (ED25519 / ECDSA secp256k1).
//
// Permitido: .env.example (solo nombres, sin valores) y los emails DEMO del dominio
// reservado `.example` (RFC 2606), que no pertenecen a ninguna persona.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import { loadEnv, ROOT } from "./lib/env.mjs";

loadEnv();

const list = (args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const files = [...new Set([...list(["ls-files"]), ...list(["ls-files", "--others", "--exclude-standard"])])].filter((f) => {
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|lock)$/i.test(f) || f === "package-lock.json") return false;
  try {
    return statSync(path.join(ROOT, f)).size < 2_000_000;
  } catch {
    return false;
  }
});

const secretValues = Object.entries({
  "valor de SUPABASE_SECRET_KEY": process.env.SUPABASE_SECRET_KEY,
  "valor de HEDERA_OPERATOR_KEY": process.env.HEDERA_OPERATOR_KEY,
  "valor de DEMO_ACCOUNT_PASSWORD": process.env.DEMO_ACCOUNT_PASSWORD,
}).filter(([, v]) => typeof v === "string" && v.length >= 8);

const patterns = {
  "secret key de Supabase (sb_secret_…)": /sb_secret_[A-Za-z0-9_-]{16,}/,
  "JWT (p. ej. clave service_role)": /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/,
  "clave privada PEM": /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  "clave privada DER ED25519": /302e020100300506032b657004220420[0-9a-fA-F]{64}/,
  "clave privada DER ECDSA secp256k1": /3030020100300706052b8104000a04220420[0-9a-fA-F]{64}/,
};

const findings = [];
for (const f of files) {
  const text = readFileSync(path.join(ROOT, f), "utf8");
  for (const [label, value] of secretValues) if (text.includes(value)) findings.push(`${f}: ${label}`);
  for (const [label, re] of Object.entries(patterns)) if (re.test(text)) findings.push(`${f}: ${label}`);
}

console.log(`archivos revisados: ${files.length} · secretos comparados por valor: ${secretValues.length}${secretValues.length ? "" : " (no hay .env.local)"}`);
for (const label of [...secretValues.map(([l]) => l), ...Object.keys(patterns)]) {
  const n = findings.filter((x) => x.endsWith(`: ${label}`)).length;
  console.log(`${n === 0 ? "✓" : "✗"} ${label}: ${n}`);
}
for (const f of findings) console.log(`   ✗ ${f}`);
console.log(`\n${findings.length === 0 ? "TODO OK" : "HAY FALLOS: posible secreto en el repositorio"}`);
process.exitCode = findings.length === 0 ? 0 : 1;
