// Escaneo del bundle del CLIENTE (.next/static) tras `npm run build`. No usa red.
//
// FUGA (falla la prueba):
//  1. VALORES reales de secretos de .env.local (si existe): SUPABASE_SECRET_KEY,
//     HEDERA_OPERATOR_KEY, DEMO_ACCOUNT_PASSWORD. Se comparan, nunca se imprimen.
//     Es la comprobación decisiva.
//  2. Señales de código de servidor que no debe viajar al navegador: nombres de
//     variables secretas, prefijo de secret key de Supabase, cliente admin,
//     publicador HCS, nombres de RPC flow_*, SDK de Hedera, columnas privadas y
//     emails DEMO. (Señales heurísticas: el minificador puede renombrar
//     identificadores, por eso el punto 1 es el que manda.)
//
// PERMITIDO (no se busca): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// y NEXT_PUBLIC_SITE_URL son públicos por diseño y deben estar en el bundle.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { loadEnv, ROOT } from "./lib/env.mjs";

loadEnv();
const STATIC = path.join(ROOT, ".next", "static");
if (!existsSync(STATIC)) {
  console.error("No existe .next/static: ejecuta `npm run build` antes de `npm run test:bundle`.");
  process.exit(2);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|css|json|map|txt|html)$/.test(name)) files.push(p);
  }
})(STATIC);

const secretValues = Object.entries({
  "valor de SUPABASE_SECRET_KEY": process.env.SUPABASE_SECRET_KEY,
  "valor de HEDERA_OPERATOR_KEY": process.env.HEDERA_OPERATOR_KEY,
  "valor de DEMO_ACCOUNT_PASSWORD": process.env.DEMO_ACCOUNT_PASSWORD,
}).filter(([, v]) => typeof v === "string" && v.length >= 8);

const signals = {
  "nombre SUPABASE_SECRET_KEY": "SUPABASE_SECRET_KEY",
  "nombre HEDERA_OPERATOR_KEY": "HEDERA_OPERATOR_KEY",
  "SERVICE_ROLE": "SERVICE_ROLE",
  "prefijo sb_secret_": "sb_secret_",
  createAdminClient: "createAdminClient",
  publishEvent: "publishEvent",
  readSupporterCommitments: "readSupporterCommitments",
  "RPC flow_create_need": "flow_create_need",
  "RPC flow_validate_need": "flow_validate_need",
  "RPC flow_reject_need": "flow_reject_need",
  "RPC flow_create_commitment": "flow_create_commitment",
  "RPC flow_report_delivery": "flow_report_delivery",
  "RPC flow_confirm_receipt": "flow_confirm_receipt",
  "RPC board_create_post": "board_create_post",
  "RPC board_publish_post": "board_publish_post",
  "RPC board_reject_post": "board_reject_post",
  "SDK @hiero-ledger": "hiero-ledger",
  "SDK @hashgraph": "@hashgraph/",
  TopicMessageSubmitTransaction: "TopicMessageSubmitTransaction",
  "columna supporter_id": "supporter_id",
  "columna confirmed_by": "confirmed_by",
  "columna delivery_note": "delivery_note",
  "columna delivery_evidence_path": "delivery_evidence_path",
  "columna submission_error": "submission_error",
  "columna reviewed_by": "reviewed_by",
  "emails DEMO": "demo.escuelavisible.example",
};

const hits = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [label, value] of secretValues) if (text.includes(value)) hits.set(label, (hits.get(label) ?? 0) + 1);
  for (const [label, value] of Object.entries(signals)) if (text.includes(value)) hits.set(label, (hits.get(label) ?? 0) + 1);
}

console.log(`bundle cliente: ${files.length} archivos en .next/static`);
console.log(`secretos comparados por valor: ${secretValues.length} (${secretValues.map(([l]) => l.replace("valor de ", "")).join(", ") || "ninguno: falta .env.local"})`);
for (const label of [...secretValues.map(([l]) => l), ...Object.keys(signals)]) {
  const n = hits.get(label) ?? 0;
  console.log(`${n === 0 ? "✓" : "✗"} ${label}: ${n}`);
}
const ok = hits.size === 0;
console.log(`\n${ok ? "TODO OK" : "HAY FALLOS: posible fuga al cliente"}`);
process.exitCode = ok ? 0 : 1;
