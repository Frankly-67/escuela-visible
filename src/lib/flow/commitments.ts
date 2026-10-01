import "server-only";

import { randomUUID } from "node:crypto";

import type { z } from "zod";

import {
  authorizeConfirmReceipt,
  authorizeCreateCommitment,
  authorizeReportDelivery,
  type Actor,
} from "@/lib/domain/permissions";
import { buildEvent } from "@/lib/events/build";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import { FlowError, flowErrorFromRpc } from "./errors";
import {
  confirmReceiptInputSchema,
  createCommitmentInputSchema,
  reportDeliveryInputSchema,
  type ConfirmReceiptInput,
  type CreateCommitmentInput,
  type ReportDeliveryInput,
} from "./schemas";

type Fn = Database["public"]["Functions"];

/*
 * Flujo de apoyo: committed → delivery_reported → confirmed.
 *
 * Cada función sigue el mismo patrón que createNeed/validateNeed:
 *  1. valida la entrada y lee el estado ACTUAL de la base (escuela, estado,
 *     dueño del compromiso; nunca del cliente);
 *  2. comprueba permiso y transición con las funciones del dominio;
 *  3. construye el evento canónico con buildEvent;
 *  4. llama a la RPC flow_*, que en UNA transacción vuelve a validar todo
 *     (actor, rol, escuela, dueño, estado, cantidad, SHA-256), cambia el
 *     estado y registra el evento pendiente en hedera_events.
 *
 * No publican en Hedera: eso lo hace publishEvent(eventId) después.
 * Las notas se guardan solo en Supabase; nunca forman parte del evento.
 */

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new FlowError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(". "));
  return parsed.data;
}

async function loadNeed(needId: string) {
  const db = createAdminClient();
  const { data: need, error } = await db
    .from("needs")
    .select("id, school_id, status, goal_quantity")
    .eq("id", needId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la necesidad: ${error.message}`);
  if (!need) throw new FlowError("NOT_FOUND", "La necesidad no existe.");
  return need;
}

async function loadCommitmentWithNeed(commitmentId: string) {
  const db = createAdminClient();
  const { data: commitment, error } = await db
    .from("commitments")
    .select("id, need_id, supporter_id, status, quantity")
    .eq("id", commitmentId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el compromiso: ${error.message}`);
  if (!commitment) throw new FlowError("NOT_FOUND", "El compromiso no existe.");
  return { commitment, need: await loadNeed(commitment.need_id) };
}

/** COMMITMENT_CREATED: un supporter se compromete con una necesidad publicada. */
export async function createCommitment(actor: Actor, input: CreateCommitmentInput) {
  const data = parse(createCommitmentInputSchema, input);
  const need = await loadNeed(data.needId);

  const { data: progress, error: progressError } = await createAdminClient()
    .from("need_progress")
    .select("committed_quantity")
    .eq("need_id", need.id)
    .maybeSingle();
  if (progressError) throw new Error(`No se pudo leer el progreso: ${progressError.message}`);

  const decision = authorizeCreateCommitment(
    actor,
    {
      schoolId: need.school_id,
      status: need.status,
      goalQuantity: need.goal_quantity,
      committedQuantity: progress?.committed_quantity ?? 0,
    },
    data.quantity,
  );
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const commitmentId = randomUUID();
  const event = buildEvent({
    type: "COMMITMENT_CREATED",
    needId: need.id,
    schoolId: need.school_id,
    commitmentId,
    actorRole: "supporter",
  });

  const args = {
    p_actor_id: actor.id,
    p_commitment_id: commitmentId,
    p_need_id: need.id,
    p_quantity: data.quantity,
    // Los tipos generados marcan los argumentos como no nulos; la función
    // acepta null (nullif(btrim(p_note), '')).
    p_note: data.note as string,
    p_event_id: event.payload.eventId,
    p_payload_canonical: event.payloadCanonical,
    p_payload_hash: event.payloadHash,
  } satisfies Fn["flow_create_commitment"]["Args"];

  const { error } = await createAdminClient().rpc("flow_create_commitment", args);
  if (error) throw flowErrorFromRpc(error);

  return { commitmentId, needId: need.id, eventId: event.payload.eventId, event };
}

/** DELIVERY_REPORTED: el MISMO supporter informa la entrega. No es recepción. */
export async function reportDelivery(actor: Actor, input: ReportDeliveryInput) {
  const data = parse(reportDeliveryInputSchema, input);
  const { commitment, need } = await loadCommitmentWithNeed(data.commitmentId);

  const decision = authorizeReportDelivery(
    actor,
    { schoolId: need.school_id, status: need.status },
    { supporterId: commitment.supporter_id, status: commitment.status },
  );
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const event = buildEvent({
    type: "DELIVERY_REPORTED",
    needId: need.id,
    schoolId: need.school_id,
    commitmentId: commitment.id,
    actorRole: "supporter",
  });

  const args = {
    p_actor_id: actor.id,
    p_commitment_id: commitment.id,
    p_delivery_note: data.deliveryNote as string, // acepta null (ver createCommitment)
    p_event_id: event.payload.eventId,
    p_payload_canonical: event.payloadCanonical,
    p_payload_hash: event.payloadHash,
  } satisfies Fn["flow_report_delivery"]["Args"];

  const { error } = await createAdminClient().rpc("flow_report_delivery", args);
  if (error) throw flowErrorFromRpc(error);

  return { commitmentId: commitment.id, needId: need.id, eventId: event.payload.eventId, event };
}

/**
 * SCHOOL_CONFIRMED: el representante de la escuela de la necesidad confirma
 * la recepción. Cierra la ayuda. Si lo confirmado alcanza la meta, la RPC
 * pasa la necesidad a completed (sin evento propio).
 */
export async function confirmReceipt(actor: Actor, input: ConfirmReceiptInput) {
  const data = parse(confirmReceiptInputSchema, input);
  const { commitment, need } = await loadCommitmentWithNeed(data.commitmentId);

  const decision = authorizeConfirmReceipt(
    actor,
    { schoolId: need.school_id, status: need.status },
    { status: commitment.status },
  );
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const event = buildEvent({
    type: "SCHOOL_CONFIRMED",
    needId: need.id,
    schoolId: need.school_id,
    commitmentId: commitment.id,
    actorRole: "school_rep",
  });

  const args = {
    p_actor_id: actor.id,
    p_commitment_id: commitment.id,
    p_event_id: event.payload.eventId,
    p_payload_canonical: event.payloadCanonical,
    p_payload_hash: event.payloadHash,
  } satisfies Fn["flow_confirm_receipt"]["Args"];

  const { data: result, error } = await createAdminClient().rpc("flow_confirm_receipt", args);
  if (error) throw flowErrorFromRpc(error);

  const needCompleted = Boolean((result as { needCompleted?: boolean } | null)?.needCompleted);
  return { commitmentId: commitment.id, needId: need.id, eventId: event.payload.eventId, event, needCompleted };
}
