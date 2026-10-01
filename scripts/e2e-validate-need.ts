/**
 * Validación real de una necesidad existente:
 *   admin → validateNeed (flow_validate_need: pending_validation → published +
 *   hedera_events NEED_VALIDATED pending) → publishEvent → HCS → Mirror Node →
 *   verifyEvent → VERIFIED.
 *
 *   npm run e2e:validate-need -- <needId>              → vista previa: SOLO LECTURA
 *   npm run e2e:validate-need -- <needId> --confirm    → valida y publica 1 mensaje HCS
 *
 * Reanudable: si el NEED_VALIDATED ya existe, no valida otra vez; solo lo
 * publica si falta, y verifica.
 */
import "./lib/load-env";

import { createClient } from "@supabase/supabase-js";

import { authorizeValidateNeed } from "@/lib/domain/permissions";
import { publicEnv } from "@/lib/env";
import { getHederaEnv } from "@/lib/env.server";
import { buildEvent } from "@/lib/events/build";
import { MAX_HCS_MESSAGE_BYTES } from "@/lib/events/types";
import { getActorById } from "@/lib/flow/actor";
import { validateNeed } from "@/lib/flow/needs";
import { hashscanTopicUrl, hashscanTransactionUrl } from "@/lib/hedera/links";
import { getTopicMessage, listTopicMessages } from "@/lib/hedera/mirror";
import { publishEvent } from "@/lib/hedera/publish";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { fromEventRow, verifyEvent, type VerificationResult } from "@/lib/verify/verify-event";

import { DEMO_ACCOUNTS } from "./lib/demo-accounts";

const needId = process.argv.slice(2).find((a) => !a.startsWith("--"));
const confirm = process.argv.includes("--confirm");
const db = createAdminClient();
const env = getHederaEnv();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const verifyConfig = { expectedTopicId: env.HEDERA_TOPIC_ID, operatorAccountId: env.HEDERA_OPERATOR_ID };

async function findUserId(email: string) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`No existe la cuenta ${email} (ejecutar npm run demo:accounts)`);
  return user.id;
}

async function eventsOf(id: string) {
  const { data, error } = await db.from("hedera_events").select("*").eq("need_id", id).order("created_at");
  if (error) throw new Error(error.message);
  return data;
}

/** Verifica un evento contra el Mirror Node, esperando la indexación (máx. ~30 s). */
async function verify(eventId: string, waitForMirror: boolean): Promise<VerificationResult> {
  let result: VerificationResult | null = null;
  for (let i = 0; i < (waitForMirror ? 15 : 1); i++) {
    const { data: row, error } = await db.from("hedera_events").select("*").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    const local = fromEventRow(row);
    const mirror =
      local.topicId && local.sequenceNumber !== null
        ? await getTopicMessage({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: local.topicId, sequenceNumber: local.sequenceNumber })
        : null;
    result = verifyEvent(local, mirror, verifyConfig);
    if (result.status !== "AWAITING_MIRROR") break;
    await sleep(2000);
  }
  return result!;
}

/** ¿Ve el público (publishable key, sin sesión) esta necesidad? Lectura bajo RLS. */
async function publiclyVisible(id: string) {
  const anon = createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false },
  });
  const { data } = await anon.from("needs").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

async function main() {
  if (!needId || !/^[0-9a-f-]{36}$/.test(needId)) {
    console.error("Uso: npm run e2e:validate-need -- <needId> [--confirm]");
    process.exitCode = 2;
    return;
  }

  // --- Precondiciones (solo lectura) -----------------------------------------
  const adminAccount = DEMO_ACCOUNTS.find((a) => a.key === "admin")!;
  const actor = await getActorById(await findUserId(adminAccount.email));

  const { data: need, error: needError } = await db
    .from("needs")
    .select("id, title, status, school_id, validated_by, validated_at")
    .eq("id", needId)
    .maybeSingle();
  if (needError) throw new Error(needError.message);
  if (!need) throw new Error(`No existe la necesidad ${needId}. No se hizo nada.`);

  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("name, is_demo")
    .eq("id", need.school_id)
    .single();
  if (schoolError) throw new Error(schoolError.message);
  if (!school.is_demo) throw new Error("La escuela no es DEMO: se aborta.");

  const events = await eventsOf(needId);
  const created = events.find((e) => e.event_type === "NEED_CREATED");
  const validated = events.find((e) => e.event_type === "NEED_VALIDATED");
  if (!created) throw new Error("La necesidad no tiene NEED_CREATED: se aborta.");

  const createdCheck = await verify(created.id, false);
  const topicNow = await listTopicMessages({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: env.HEDERA_TOPIC_ID });
  const decision = authorizeValidateNeed(actor, { schoolId: need.school_id, status: need.status });

  console.log("Precondiciones");
  console.log(`  necesidad           ${need.title} (${need.id})`);
  console.log(`  escuela             ${school.name}`);
  console.log(`  estado              ${need.status}`);
  console.log(`  actor               ${adminAccount.email} → ${actor.role}`);
  console.log(`  NEED_CREATED        seq ${created.sequence_number} → ${createdCheck.status}`);
  console.log(`  NEED_VALIDATED      ${validated ? `ya existe (${validated.id}, ${validated.submission_status}) → se reanuda` : "no existe → se crea"}`);
  console.log(`  permiso/transición  ${validated ? "(ya validada)" : decision.ok ? "sí: pending_validation → published" : `NO: ${decision.message}`}`);
  console.log(`  topic               ${env.HEDERA_TOPIC_ID}, mensajes actuales: ${topicNow.kind === "found" ? topicNow.data.length : topicNow.kind}`);
  console.log(`  visible al público  ${(await publiclyVisible(needId)) ? "sí" : "no"}`);

  if (createdCheck.status !== "VERIFIED") throw new Error("El NEED_CREATED no está VERIFIED: no se construye encima. No se hizo nada.");
  if (!validated && !decision.ok) throw new Error(`No se puede validar: ${decision.message}`);

  if (!confirm) {
    if (!validated) {
      const sample = buildEvent({ type: "NEED_VALIDATED", needId, schoolId: need.school_id, actorRole: "admin" });
      console.log("\nCambios en needs (misma fila)");
      console.log(`  status              pending_validation → published`);
      console.log(`  validated_by        null → ${actor.id} (Administración DEMO)`);
      console.log(`  validated_at        null → <momento de la validación>`);
      console.log("\nEvento HCS (EJEMPLO: eventId y timestamp se generan al ejecutar)");
      console.log(`  payload canónico  ${sample.payloadCanonical}`);
      console.log(`  mensaje           ${sample.message}`);
      console.log(`  tamaño            ${sample.messageBytes} bytes (máx. ${MAX_HCS_MESSAGE_BYTES}) → 1 chunk`);
    }
    console.log(`\nVISTA PREVIA: no se escribió nada ni se publicó nada. Para ejecutar: npm run e2e:validate-need -- ${needId} --confirm`);
    return;
  }

  // --- 1. validateNeed -----------------------------------------------------------
  let eventId: string;
  if (validated) {
    eventId = validated.id;
    console.log(`\n1. NEED_VALIDATED existente ${eventId}`);
  } else {
    eventId = (await validateNeed(actor, needId)).eventId;
    console.log(`\n1. flow_validate_need OK → necesidad published, evento ${eventId} (pending)`);
  }

  // --- 2. publishEvent → HCS -----------------------------------------------------
  const outcome = await publishEvent(eventId);
  console.log(`2. publishEvent → ${JSON.stringify(outcome)}`);
  if (outcome.status !== "submitted" && outcome.status !== "already_submitted") {
    throw new Error("La publicación no terminó; el evento queda en hedera_events para reintentar.");
  }

  // --- 3. Mirror Node + verifyEvent ---------------------------------------------
  const result = await verify(eventId, true);
  console.log(`3. verifyEvent NEED_VALIDATED → ${result.status}`);
  for (const c of result.checks) {
    console.log(`   ${c.outcome === "pass" ? "✓" : c.outcome === "fail" ? "✗" : "·"} ${String(c.step).padStart(2)}. ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  if (result.remote) {
    console.log(`\n   topic      ${result.remote.topicId}  ${hashscanTopicUrl(env.HEDERA_NETWORK, result.remote.topicId)}`);
    console.log(`   posición   ${result.remote.sequenceNumber}`);
    console.log(`   consenso   ${result.remote.consensusTimestamp}  ${hashscanTransactionUrl(env.HEDERA_NETWORK, result.remote.consensusTimestamp)}`);
  }

  // --- 4. Comprobaciones finales (solo lectura) -----------------------------------
  const createdAfter = await verify(created.id, false);
  console.log(`\n4. NEED_CREATED sigue → ${createdAfter.status}`);
  console.log(`   visible al público → ${(await publiclyVisible(needId)) ? "sí" : "no"}`);

  process.exitCode = result.status === "VERIFIED" && createdAfter.status === "VERIFIED" ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : "desconocido"}`);
  process.exitCode = 1;
});
