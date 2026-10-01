// Estado de los datos DEMO (Supabase) y del registro en Hedera — SOLO LECTURA.
//
// Comprueba que los datos coinciden con el estado aprobado tras el E2E real de B4
// y que cada evento sigue VERIFICADO contra el Mirror Node (las mismas 13
// comprobaciones que /verify). También revisa la privacidad de los mensajes HCS
// (exactamente los 9 campos canónicos, sin ids ni nombres de personas).
//
// Requiere .env.local (Supabase con secret key para leer; Hedera: solo red, topic
// y cuenta pública — no usa la clave del operador). No escribe nada.
//
// Si los datos DEMO cambian de forma legítima (un nuevo E2E autorizado), hay que
// actualizar EXPECTED y documentarlo en docs/REGRESIONES.md.
import "../lib/load-env";

import { getHederaPublicConfig } from "@/lib/env.server";
import { getTopicMessage, listTopicMessages } from "@/lib/hedera/mirror";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromEventRow, verifyEvent } from "@/lib/verify/verify-event";

const EXPECTED = {
  counts: { schools: 3, profiles: 5, needs: 3, commitments: 2, hedera_events: 11 },
  topicMessages: 11,
  elMirador: {
    needId: "769e4e92-4d46-4421-9d7b-c998f125a480",
    status: "published",
    // Huella de "sin cambios": la fila no se ha actualizado desde su validación.
    updatedAt: "2026-10-01T02:07:28.854701+00:00",
    commitment: { id: "ca217541-30da-4521-9687-c9bbce257a14", status: "confirmed", quantity: 5, updatedAt: "2026-10-01T02:31:26.133077+00:00" },
    events: "1:NEED_CREATED,2:NEED_VALIDATED,3:COMMITMENT_CREATED,4:DELIVERY_REPORTED,5:SCHOOL_CONFIRMED",
  },
  laCascada: {
    needId: "67c4425c-0622-4cd4-9306-b055da760f19",
    status: "completed",
    commitment: { id: "da2bf45a-104b-4461-b605-1607014b353e", status: "confirmed", quantity: 30 },
    events: "6:NEED_CREATED,7:NEED_VALIDATED,9:COMMITMENT_CREATED,10:DELIVERY_REPORTED,11:SCHOOL_CONFIRMED",
  },
  losRobles: { needId: "9b9912da-8149-466e-9eeb-b7dc829bd477", status: "cancelled", events: "8:NEED_CREATED" },
};
const CANONICAL_FIELDS = "actorRole,app,commitmentId,eventId,needId,schoolId,timestamp,type,v";

let ok = true;
const check = (condition: boolean, text: string) => {
  ok &&= condition;
  console.log(`${condition ? "✓" : "✗"} ${text}`);
};

const db = createAdminClient();
const count = async (table: "schools" | "profiles" | "needs" | "commitments" | "hedera_events") => {
  const { count: n, error } = await db.from(table).select("id", { count: "exact" }).limit(1);
  if (error) throw new Error(`No se pudo contar ${table}`);
  return n ?? -1;
};

console.log("── Supabase (solo lectura)");
const counts = {
  schools: await count("schools"),
  profiles: await count("profiles"),
  needs: await count("needs"),
  commitments: await count("commitments"),
  hedera_events: await count("hedera_events"),
};
check(JSON.stringify(counts) === JSON.stringify(EXPECTED.counts), `conteos ${JSON.stringify(counts)}`);

const { data: needs } = await db.from("needs").select("id, status, goal_quantity, updated_at, completed_at");
const { data: progress } = await db.from("need_progress").select("need_id, committed_quantity, confirmed_quantity");
const { data: commitments } = await db.from("commitments").select("id, need_id, status, quantity, updated_at");
const { data: events } = await db.from("hedera_events").select("*").order("sequence_number");
if (!needs || !progress || !commitments || !events) throw new Error("No se pudieron leer los datos.");

const eventsOf = (needId: string) =>
  events.filter((e) => e.need_id === needId).map((e) => `${e.sequence_number}:${e.event_type}`).join(",");
const progressOf = (needId: string) => progress.find((p) => p.need_id === needId);

{
  const e = EXPECTED.elMirador;
  const need = needs.find((n) => n.id === e.needId);
  const c = commitments.filter((x) => x.need_id === e.needId);
  check(need?.status === e.status && need.updated_at === e.updatedAt, `El Mirador: ${need?.status}, sin cambios desde su validación`);
  check(c.length === 1 && c[0].id === e.commitment.id && c[0].status === e.commitment.status && c[0].quantity === e.commitment.quantity && c[0].updated_at === e.commitment.updatedAt, "El Mirador: su compromiso (5, confirmed) sin cambios");
  check(eventsOf(e.needId) === e.events, `El Mirador: eventos ${eventsOf(e.needId)}`);
}
{
  const e = EXPECTED.laCascada;
  const need = needs.find((n) => n.id === e.needId);
  const p = progressOf(e.needId);
  const c = commitments.filter((x) => x.need_id === e.needId);
  check(need?.status === e.status && need.completed_at !== null && Number(p?.committed_quantity) === 30 && Number(p?.confirmed_quantity) === 30, `La Cascada: ${need?.status}, ${p?.confirmed_quantity}/${need?.goal_quantity} confirmado`);
  check(c.length === 1 && c[0].id === e.commitment.id && c[0].status === e.commitment.status && c[0].quantity === e.commitment.quantity, "La Cascada: 1 compromiso de 30, confirmed");
  check(eventsOf(e.needId) === e.events, `La Cascada: eventos ${eventsOf(e.needId)}`);
}
{
  const e = EXPECTED.losRobles;
  const need = needs.find((n) => n.id === e.needId);
  check(need?.status === e.status && commitments.every((x) => x.need_id !== e.needId) && eventsOf(e.needId) === e.events, `Los Robles: ${need?.status}, 0 compromisos, eventos ${eventsOf(e.needId)}`);
}
check(events.every((e) => e.submission_status === "submitted"), "todos los eventos están publicados (submitted)");

console.log("── Hedera (solo lectura: Mirror Node)");
const hedera = getHederaPublicConfig();
const listed = await listTopicMessages({ mirrorUrl: hedera.HEDERA_MIRROR_NODE_URL, topicId: hedera.HEDERA_TOPIC_ID });
if (listed.kind !== "found") {
  check(false, `Mirror Node no disponible (${listed.kind === "unavailable" ? listed.reason : listed.kind})`);
} else {
  const messages = listed.data;
  check(messages.length === EXPECTED.topicMessages, `topic ${hedera.HEDERA_TOPIC_ID}: ${messages.length} mensajes`);

  // Privacidad HCS: {hash, payload} con exactamente los 9 campos; sin personas.
  const { data: people } = await db.from("profiles").select("id, display_name");
  const personIds = (people ?? []).map((p) => p.id);
  const names = (people ?? []).map((p) => p.display_name).filter((n): n is string => Boolean(n));
  let canonical = 0;
  let clean = 0;
  for (const m of messages) {
    const raw = Buffer.from(m.messageBase64, "base64").toString("utf8");
    const parsed = JSON.parse(raw) as { hash?: string; payload?: Record<string, unknown> };
    if (Object.keys(parsed).sort().join(",") === "hash,payload" && parsed.payload && Object.keys(parsed.payload).sort().join(",") === CANONICAL_FIELDS) canonical++;
    if (!personIds.some((id) => raw.includes(id)) && !names.some((n) => raw.includes(n)) && !raw.includes("@")) clean++;
  }
  check(canonical === messages.length, `mensajes con {hash, payload} y los 9 campos canónicos: ${canonical}/${messages.length}`);
  check(clean === messages.length, `mensajes sin ids de personas, nombres ni emails: ${clean}/${messages.length}`);

  // Verificación de cada evento (13 comprobaciones, como /verify).
  let verified = 0;
  for (const row of events) {
    const local = fromEventRow(row);
    const mirror =
      local.sequenceNumber !== null && local.topicId
        ? await getTopicMessage({ mirrorUrl: hedera.HEDERA_MIRROR_NODE_URL, topicId: local.topicId, sequenceNumber: local.sequenceNumber })
        : null;
    const result = verifyEvent(local, mirror, { expectedTopicId: hedera.HEDERA_TOPIC_ID, operatorAccountId: hedera.HEDERA_OPERATOR_ID });
    const passed = result.checks.filter((c) => c.outcome === "pass").length;
    if (result.status === "VERIFIED" && passed === 13) verified++;
    else console.log(`   · evento #${row.sequence_number} (${row.event_type}): ${result.status} ${passed}/13`);
  }
  check(verified === events.length, `eventos VERIFIED 13/13: ${verified}/${events.length}`);
}

console.log(`\n${ok ? "TODO OK" : "HAY FALLOS"}`);
process.exitCode = ok ? 0 : 1;
