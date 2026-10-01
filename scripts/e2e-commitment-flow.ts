/**
 * Flujo de apoyo real, por pasos independientes:
 *   commit   → aliado se compromete       → COMMITMENT_CREATED
 *   report   → el mismo aliado reporta    → DELIVERY_REPORTED
 *   confirm  → la escuela confirma        → SCHOOL_CONFIRMED
 *
 *   npm run e2e:commitment -- <needId> --step commit --quantity 5            (vista previa)
 *   npm run e2e:commitment -- <needId> --step commit --quantity 5 --confirm
 *   npm run e2e:commitment -- <needId> --step report  [--commitment <id>] [--confirm]
 *   npm run e2e:commitment -- <needId> --step confirm [--commitment <id>] [--confirm]
 *
 * - Por defecto SOLO LECTURA. Con --confirm ejecuta ÚNICAMENTE el paso
 *   indicado y publica como máximo UN mensaje HCS (el de ese paso).
 * - Antes de actuar exige que todos los eventos anteriores de la necesidad
 *   estén VERIFIED (excepto el propio evento del paso si quedó pendiente:
 *   en ese caso solo lo publica, sin repetir la operación).
 * - Las notas (note, delivery_note) quedan en NULL.
 * - Nunca crea un segundo compromiso del aliado para la misma necesidad.
 */
import "./lib/load-env";

import type { Actor } from "@/lib/domain/permissions";
import {
  authorizeConfirmReceipt,
  authorizeCreateCommitment,
  authorizeReportDelivery,
} from "@/lib/domain/permissions";
import { formatQuantity } from "@/lib/domain/labels";
import { availableQuantity, shouldCompleteNeed } from "@/lib/domain/state-machine";
import { getHederaEnv } from "@/lib/env.server";
import { buildEvent } from "@/lib/events/build";
import type { HederaEventType } from "@/lib/events/types";
import { MAX_HCS_MESSAGE_BYTES } from "@/lib/events/types";
import { getActorById } from "@/lib/flow/actor";
import { confirmReceipt, createCommitment, reportDelivery } from "@/lib/flow/commitments";
import { hashscanTransactionUrl } from "@/lib/hedera/links";
import { publishEvent } from "@/lib/hedera/publish";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

import { DEMO_ACCOUNTS } from "./lib/demo-accounts";
import { anonClient, findUserIdByEmail, printChecks, topicMessageCount, verifyStoredEvent } from "./lib/e2e";

type Step = "commit" | "report" | "confirm";
const STEP_EVENT: Record<Step, HederaEventType> = {
  commit: "COMMITMENT_CREATED",
  report: "DELIVERY_REPORTED",
  confirm: "SCHOOL_CONFIRMED",
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const needId = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--") );
const step = flag("step") as Step | undefined;
const quantityArg = flag("quantity");
const commitmentArg = flag("commitment");
const confirm = args.includes("--confirm");

const db = createAdminClient();
const env = getHederaEnv();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function usage(message: string): never {
  console.error(`${message}\nUso: npm run e2e:commitment -- <needId> --step commit|report|confirm [--quantity N] [--commitment <id>] [--confirm]`);
  process.exit(2);
}

async function main() {
  if (!needId || !UUID.test(needId)) usage("Falta el id de la necesidad.");
  if (!step || !(step in STEP_EVENT)) usage("Falta --step commit|report|confirm.");
  if (commitmentArg && !UUID.test(commitmentArg)) usage("--commitment no es un UUID válido.");
  const quantity = quantityArg === undefined ? undefined : Number(quantityArg);
  if (step === "commit" && (quantity === undefined || Number.isNaN(quantity))) usage("El paso commit requiere --quantity (p. ej. 5).");
  if (step !== "commit" && quantityArg !== undefined) usage("--quantity solo aplica al paso commit.");

  // --- Contexto (solo lectura) ----------------------------------------------------
  const { data: need, error: needError } = await db
    .from("needs")
    .select("id, title, status, school_id, goal_quantity, goal_unit")
    .eq("id", needId)
    .maybeSingle();
  if (needError) throw new Error(needError.message);
  if (!need) throw new Error(`No existe la necesidad ${needId}. No se hizo nada.`);

  const { data: school, error: schoolError } = await db.from("schools").select("name, slug, is_demo").eq("id", need.school_id).single();
  if (schoolError) throw new Error(schoolError.message);
  if (!school.is_demo) throw new Error("La escuela no es DEMO: se aborta.");

  const supporterAccount = DEMO_ACCOUNTS.find((a) => a.key === "aliado")!;
  const repAccount = DEMO_ACCOUNTS.find((a) => a.role === "school_rep" && a.schoolSlug === school.slug);
  if (!repAccount) throw new Error(`No hay cuenta DEMO de representante para ${school.slug}.`);
  const supporter = await getActorById(await findUserIdByEmail(supporterAccount.email));
  const actorAccount = step === "confirm" ? repAccount : supporterAccount;
  const actor: Actor = step === "confirm" ? await getActorById(await findUserIdByEmail(repAccount.email)) : supporter;

  const { data: progress } = await db.from("need_progress").select("committed_quantity, confirmed_quantity").eq("need_id", need.id).maybeSingle();
  const committed = progress?.committed_quantity ?? 0;
  const confirmed = progress?.confirmed_quantity ?? 0;

  // Compromiso objetivo: el indicado, o el único del aliado en esta necesidad.
  const { data: supporterCommitments, error: cErr } = await db
    .from("commitments")
    .select("*")
    .eq("need_id", need.id)
    .eq("supporter_id", supporter.id)
    .neq("status", "cancelled")
    .order("created_at");
  if (cErr) throw new Error(cErr.message);
  if (commitmentArg && !supporterCommitments.some((c) => c.id === commitmentArg)) {
    throw new Error("El compromiso indicado no es del aliado DEMO en esta necesidad.");
  }
  if (!commitmentArg && supporterCommitments.length > 1) {
    throw new Error("El aliado tiene varios compromisos en esta necesidad: indica --commitment <id>.");
  }
  const target: Tables<"commitments"> | null =
    supporterCommitments.find((c) => c.id === commitmentArg) ?? supporterCommitments[0] ?? null;

  // Eventos de la necesidad: el del paso (si ya existe) se reanuda; el resto debe estar VERIFIED.
  const { data: events, error: evErr } = await db.from("hedera_events").select("*").eq("need_id", need.id).order("created_at");
  if (evErr) throw new Error(evErr.message);
  const ownEvent = target ? events.find((e) => e.event_type === STEP_EVENT[step] && e.commitment_id === target.id) ?? null : null;

  console.log(`Paso: ${step} (${STEP_EVENT[step]}) — ${confirm ? "EJECUCIÓN" : "vista previa, solo lectura"}`);
  console.log(`  necesidad           ${need.title} — ${school.name} (${need.status})`);
  console.log(`  progreso            comprometido ${formatQuantity(committed, need.goal_unit)}, confirmado ${formatQuantity(confirmed, need.goal_unit)} de ${formatQuantity(need.goal_quantity, need.goal_unit)}`);
  console.log(`  actor               ${actorAccount.email} → ${actor.role}`);
  console.log(`  compromiso          ${target ? `${target.id} (${target.status}, ${formatQuantity(target.quantity, need.goal_unit)})` : "ninguno del aliado"}`);
  console.log(`  topic               ${env.HEDERA_TOPIC_ID}, mensajes actuales: ${await topicMessageCount()}`);
  console.log("  eventos previos:");
  for (const ev of events) {
    if (ownEvent && ev.id === ownEvent.id) {
      console.log(`    · ${ev.event_type.padEnd(19)} seq ${ev.sequence_number ?? "-"}  (evento de este paso, ${ev.submission_status})`);
      continue;
    }
    const v = await verifyStoredEvent(ev.id);
    console.log(`    ${v.status === "VERIFIED" ? "✓" : "✗"} ${ev.event_type.padEnd(19)} seq ${ev.sequence_number ?? "-"}  ${v.status}`);
    if (v.status !== "VERIFIED") throw new Error(`El evento ${ev.event_type} (${ev.id}) no está VERIFIED: no se construye encima. No se hizo nada.`);
  }

  // --- Plan del paso -----------------------------------------------------------------
  let resume = false;
  let plan: string[] = [];
  let decisionMessage: string;

  if (ownEvent) {
    if (ownEvent.submission_status === "submitted") throw new Error(`Este paso ya está hecho (${STEP_EVENT[step]} ${ownEvent.id}, seq ${ownEvent.sequence_number}). No se hizo nada.`);
    resume = true;
    decisionMessage = `reanudar: solo publicar el ${STEP_EVENT[step]} pendiente (${ownEvent.id})`;
  } else if (step === "commit") {
    if (target) throw new Error(`El aliado ya tiene un compromiso en esta necesidad (${target.id}, ${target.status}). No se crea otro.`);
    const d = authorizeCreateCommitment(
      actor,
      { schoolId: need.school_id, status: need.status, goalQuantity: need.goal_quantity, committedQuantity: committed },
      quantity!,
    );
    if (!d.ok) throw new Error(`No permitido: ${d.message}`);
    decisionMessage = `sí: crear compromiso de ${formatQuantity(quantity!, need.goal_unit)} (disponible ${formatQuantity(availableQuantity(need.goal_quantity, committed), need.goal_unit)})`;
    plan = [
      `commitments: nueva fila — quantity ${quantity}, note NULL, status committed, supporter ${supporter.id}`,
      `progreso: comprometido ${committed} → ${committed + quantity!} de ${need.goal_quantity}; la necesidad sigue ${need.status}`,
    ];
  } else {
    if (!target) throw new Error("No hay compromiso del aliado: ejecuta primero --step commit. No se hizo nada.");
    const needRef = { schoolId: need.school_id, status: need.status };
    const d =
      step === "report"
        ? authorizeReportDelivery(actor, needRef, { supporterId: target.supporter_id, status: target.status })
        : authorizeConfirmReceipt(actor, needRef, { status: target.status });
    if (!d.ok) throw new Error(`No permitido: ${d.message}`);
    if (step === "report") {
      decisionMessage = "sí: committed → delivery_reported";
      plan = [`commitments ${target.id}: status committed → delivery_reported, delivery_note NULL, delivery_reported_at = ahora`];
    } else {
      const after = confirmed + target.quantity;
      const completes = shouldCompleteNeed(need.goal_quantity, after);
      decisionMessage = "sí: delivery_reported → confirmed";
      plan = [
        `commitments ${target.id}: status delivery_reported → confirmed, confirmed_by ${actor.id}, confirmed_at = ahora`,
        `progreso: confirmado ${confirmed} → ${after} de ${need.goal_quantity} → la necesidad ${completes ? "pasa a COMPLETED (irreversible)" : `sigue ${need.status}`}`,
      ];
    }
  }

  console.log(`  permiso/transición  ${decisionMessage}`);
  if (plan.length) {
    console.log("\nCambios en Supabase");
    for (const line of plan) console.log(`  ${line}`);
  }
  if (!resume) {
    const sample = buildEvent({
      type: STEP_EVENT[step],
      needId: need.id,
      schoolId: need.school_id,
      commitmentId: target?.id ?? "00000000-0000-4000-8000-000000000000",
      actorRole: step === "confirm" ? "school_rep" : "supporter",
    });
    console.log(`\nEvento HCS (EJEMPLO: eventId, timestamp${step === "commit" ? " y commitmentId" : ""} se generan al ejecutar)`);
    console.log(`  mensaje           ${sample.message}`);
    console.log(`  tamaño            ${sample.messageBytes} bytes (máx. ${MAX_HCS_MESSAGE_BYTES}) → 1 chunk`);
  }

  if (!confirm) {
    const extra = step === "commit" ? ` --quantity ${quantity}` : target && commitmentArg ? ` --commitment ${target.id}` : "";
    console.log(`\nVISTA PREVIA: no se escribió nada ni se publicó nada.\nPara ejecutar: npm run e2e:commitment -- ${need.id} --step ${step}${extra} --confirm`);
    return;
  }

  // --- Ejecución: UN paso, como máximo UN mensaje HCS -----------------------------
  let eventId: string;
  if (resume) {
    eventId = ownEvent!.id;
  } else if (step === "commit") {
    const r = await createCommitment(actor, { needId: need.id, quantity: quantity!, note: null });
    eventId = r.eventId;
    console.log(`\n1. createCommitment OK → compromiso ${r.commitmentId}, evento ${eventId} (pending)`);
  } else if (step === "report") {
    const r = await reportDelivery(actor, { commitmentId: target!.id, deliveryNote: null });
    eventId = r.eventId;
    console.log(`\n1. reportDelivery OK → evento ${eventId} (pending)`);
  } else {
    const r = await confirmReceipt(actor, { commitmentId: target!.id });
    eventId = r.eventId;
    console.log(`\n1. confirmReceipt OK → evento ${eventId} (pending)${r.needCompleted ? " — necesidad COMPLETED" : ""}`);
  }

  const outcome = await publishEvent(eventId);
  console.log(`2. publishEvent → ${JSON.stringify(outcome)}`);
  if (outcome.status !== "submitted" && outcome.status !== "already_submitted") {
    throw new Error("La publicación no terminó; el evento queda en hedera_events para reintentar con este mismo comando.");
  }

  const result = await verifyStoredEvent(eventId, true);
  console.log(`3. verifyEvent ${STEP_EVENT[step]} → ${result.status}`);
  printChecks(result);
  if (result.remote) {
    console.log(`   posición ${result.remote.sequenceNumber} · consenso ${result.remote.consensusTimestamp}`);
    console.log(`   ${hashscanTransactionUrl(env.HEDERA_NETWORK, result.remote.consensusTimestamp)}`);
  }

  console.log("\n4. Eventos anteriores:");
  let allVerified = result.status === "VERIFIED";
  for (const ev of events.filter((e) => e.id !== eventId)) {
    const v = await verifyStoredEvent(ev.id);
    allVerified &&= v.status === "VERIFIED";
    console.log(`   ${v.status === "VERIFIED" ? "✓" : "✗"} ${ev.event_type} seq ${ev.sequence_number} → ${v.status}`);
  }

  const { data: pub } = await anonClient().from("need_progress").select("committed_quantity, confirmed_quantity").eq("need_id", need.id).maybeSingle();
  console.log(`   progreso visible al público: comprometido ${pub?.committed_quantity ?? "?"}, confirmado ${pub?.confirmed_quantity ?? "?"} de ${need.goal_quantity}`);

  process.exitCode = allVerified ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : "desconocido"}`);
  process.exitCode = 1;
});
