/**
 * Primer flujo E2E real:
 *   El Mirador (DEMO) crea una necesidad → flow_create_need (need + hedera_events
 *   pending) → publishEvent → HCS → Mirror Node → verifyEvent → VERIFIED.
 *
 *   npm run e2e:first-event               → vista previa: SOLO LECTURA
 *   npm run e2e:first-event -- --confirm  → escribe en Supabase y publica 1 mensaje HCS
 *
 * Reanudable: si la necesidad ya existe (mismo título y escuela), no la crea
 * otra vez; solo publica su NEED_CREATED si falta, y verifica.
 */
import "./lib/load-env";

import { authorizeCreateNeed, type Actor } from "@/lib/domain/permissions";
import { getHederaEnv } from "@/lib/env.server";
import { buildEvent } from "@/lib/events/build";
import { MAX_HCS_MESSAGE_BYTES } from "@/lib/events/types";
import { getActorById } from "@/lib/flow/actor";
import { createNeed } from "@/lib/flow/needs";
import { createNeedInputSchema } from "@/lib/flow/schemas";
import { hashscanTopicUrl, hashscanTransactionUrl } from "@/lib/hedera/links";
import { getTopicMessage, listTopicMessages } from "@/lib/hedera/mirror";
import { publishEvent } from "@/lib/hedera/publish";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromEventRow, verifyEvent } from "@/lib/verify/verify-event";

import { DEMO_ACCOUNTS } from "./lib/demo-accounts";
import { FIRST_DEMO_NEED } from "./lib/demo-needs";

const confirm = process.argv.includes("--confirm");
const db = createAdminClient();
const env = getHederaEnv();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findUserId(email: string) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`No existe la cuenta ${email} (ejecutar npm run demo:accounts)`);
  return user.id;
}

async function main() {
  // --- Precondiciones (solo lectura) -----------------------------------------
  const repAccount = DEMO_ACCOUNTS.find((a) => a.key === "el-mirador")!;
  const actor: Actor = await getActorById(await findUserId(repAccount.email));

  const { schoolSlug, ...fields } = FIRST_DEMO_NEED;
  const { data: school, error: schoolError } = await db
    .from("schools")
    .select("id, slug, name, is_demo")
    .eq("slug", schoolSlug)
    .single();
  if (schoolError) throw new Error(schoolError.message);
  if (!school.is_demo) throw new Error("La escuela no es DEMO: se aborta.");

  const input = createNeedInputSchema.parse({ ...fields, schoolId: school.id });
  const decision = authorizeCreateNeed(actor, { schoolId: school.id });
  if (!decision.ok) throw new Error(`Permiso denegado: ${decision.message}`);

  // Se piden hasta 2 coincidencias: si la consulta falla o hay más de una,
  // se aborta sin crear otra necesidad.
  const { data: matches, error: existingError } = await db
    .from("needs")
    .select("id, status")
    .eq("school_id", school.id)
    .eq("title", input.title)
    .limit(2);
  if (existingError) {
    throw new Error(`No se pudo comprobar si la necesidad ya existe: ${existingError.message}. No se creó nada.`);
  }
  if (matches.length > 1) {
    throw new Error(`Hay más de una necesidad "${input.title}" en ${school.name}. Se aborta sin crear otra; revisar manualmente.`);
  }
  const existing = matches[0] ?? null;

  const topicNow = await listTopicMessages({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: env.HEDERA_TOPIC_ID });

  console.log("Precondiciones");
  console.log(`  actor               ${repAccount.email} → ${actor.role} de ${school.name}`);
  console.log(`  permiso NEED_CREATED ${decision.ok ? "sí" : "no"}`);
  console.log(`  necesidad existente ${existing ? `sí (${existing.id}, ${existing.status}) → se reanuda` : "no → se crea"}`);
  console.log(`  topic               ${env.HEDERA_TOPIC_ID}, mensajes actuales: ${topicNow.kind === "found" ? topicNow.data.length : topicNow.kind}`);

  if (!confirm) {
    const sample = buildEvent({ type: "NEED_CREATED", needId: crypto.randomUUID(), schoolId: school.id, actorRole: "school_rep" });
    console.log("\nFila a crear en needs");
    console.log(JSON.stringify({
      id: "<uuid generado al ejecutar>",
      school_id: school.id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
      goal_quantity: input.goalQuantity,
      goal_unit: input.goalUnit,
      event_date: input.eventDate,
      status: "pending_validation",
      created_by: actor.id,
    }, null, 2));
    console.log("\nEvento HCS (EJEMPLO: eventId, needId y timestamp se generan al ejecutar)");
    console.log(`  payload canónico  ${sample.payloadCanonical}`);
    console.log(`  SHA-256           ${sample.payloadHash}`);
    console.log(`  mensaje           ${sample.message}`);
    console.log(`  tamaño            ${sample.messageBytes} bytes (máx. ${MAX_HCS_MESSAGE_BYTES}) → 1 chunk`);
    console.log("\nVISTA PREVIA: no se escribió nada ni se publicó nada. Para ejecutar: npm run e2e:first-event -- --confirm");
    return;
  }

  // --- 1. flow_create_need -------------------------------------------------------
  let needId: string;
  let eventId: string;
  if (existing) {
    needId = existing.id;
    const { data: ev, error } = await db
      .from("hedera_events")
      .select("id")
      .eq("need_id", needId)
      .eq("event_type", "NEED_CREATED")
      .single();
    if (error) throw new Error(`Necesidad sin NEED_CREATED: ${error.message}`);
    eventId = ev.id;
    console.log(`\n1. Necesidad existente ${needId}; evento ${eventId}`);
  } else {
    const created = await createNeed(actor, input);
    needId = created.needId;
    eventId = created.eventId;
    console.log(`\n1. flow_create_need OK → necesidad ${needId}, evento ${eventId} (pending)`);
  }

  // --- 2. publishEvent → HCS -----------------------------------------------------
  const outcome = await publishEvent(eventId);
  console.log(`2. publishEvent → ${JSON.stringify(outcome)}`);
  if (outcome.status !== "submitted" && outcome.status !== "already_submitted") {
    throw new Error("La publicación no terminó; el evento queda en hedera_events para reintentar.");
  }

  // --- 3. Mirror Node + verifyEvent ---------------------------------------------
  let result = null;
  for (let i = 0; i < 15; i++) {
    const { data: row, error } = await db.from("hedera_events").select("*").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    const local = fromEventRow(row);
    const mirror = await getTopicMessage({
      mirrorUrl: env.HEDERA_MIRROR_NODE_URL,
      topicId: local.topicId!,
      sequenceNumber: local.sequenceNumber!,
    });
    result = verifyEvent(local, mirror, { expectedTopicId: env.HEDERA_TOPIC_ID, operatorAccountId: env.HEDERA_OPERATOR_ID });
    if (result.status !== "AWAITING_MIRROR") break;
    await sleep(2000);
  }
  console.log(`3. verifyEvent → ${result!.status}`);
  for (const c of result!.checks) {
    console.log(`   ${c.outcome === "pass" ? "✓" : c.outcome === "fail" ? "✗" : "·"} ${String(c.step).padStart(2)}. ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  if (result!.remote) {
    console.log(`\n   topic      ${result!.remote.topicId}  ${hashscanTopicUrl(env.HEDERA_NETWORK, result!.remote.topicId)}`);
    console.log(`   posición   ${result!.remote.sequenceNumber}`);
    console.log(`   consenso   ${result!.remote.consensusTimestamp}  ${hashscanTransactionUrl(env.HEDERA_NETWORK, result!.remote.consensusTimestamp)}`);
  }
  process.exitCode = result!.status === "VERIFIED" ? 0 : 1;
}

main().catch((error) => {
  console.error(`\nERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : "desconocido"}`);
  process.exitCode = 1;
});
