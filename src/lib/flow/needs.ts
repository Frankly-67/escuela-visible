import "server-only";

import { randomUUID } from "node:crypto";

import { authorizeCreateNeed, authorizeValidateNeed, type Actor } from "@/lib/domain/permissions";
import { buildEvent } from "@/lib/events/build";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import { FlowError, flowErrorFromRpc } from "./errors";
import { createNeedInputSchema, type CreateNeedInput } from "./schemas";

type CreateNeedArgs = Database["public"]["Functions"]["flow_create_need"]["Args"];
type ValidateNeedArgs = Database["public"]["Functions"]["flow_validate_need"]["Args"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * NEED_CREATED: el representante de la escuela crea una necesidad.
 *
 *  1. valida los datos y el permiso (mensajes claros para la interfaz);
 *  2. construye el evento canónico (buildEvent: payload de 9 campos + SHA-256);
 *  3. llama a flow_create_need, que en UNA transacción vuelve a validar todo,
 *     recalcula el SHA-256, crea la necesidad (pending_validation) y registra
 *     el evento en hedera_events (submission_status = pending).
 *
 * No publica en Hedera: eso lo hace publishEvent(eventId) después.
 */
export async function createNeed(actor: Actor, input: CreateNeedInput) {
  const parsed = createNeedInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new FlowError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(". "));
  }
  const data = parsed.data;

  const decision = authorizeCreateNeed(actor, { schoolId: data.schoolId });
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const needId = randomUUID();
  const event = buildEvent({
    type: "NEED_CREATED",
    needId,
    schoolId: data.schoolId,
    commitmentId: null,
    actorRole: "school_rep",
  });

  const args = {
    p_actor_id: actor.id,
    p_need_id: needId,
    p_school_id: data.schoolId,
    p_kind: data.kind,
    p_title: data.title,
    p_description: data.description,
    p_category: data.category,
    p_priority: data.priority,
    p_goal_quantity: data.goalQuantity,
    p_goal_unit: data.goalUnit,
    // Los tipos generados marcan todos los argumentos como no nulos; la
    // función acepta null en p_event_date (necesidades sin fecha).
    p_event_date: data.eventDate as string,
    p_event_id: event.payload.eventId,
    p_payload_canonical: event.payloadCanonical,
    p_payload_hash: event.payloadHash,
  } satisfies CreateNeedArgs;

  const { error } = await createAdminClient().rpc("flow_create_need", args);
  if (error) throw flowErrorFromRpc(error);

  return { needId, eventId: event.payload.eventId, event };
}

/**
 * NEED_VALIDATED: la administración valida una necesidad pendiente y la
 * hace pública (pending_validation → published).
 *
 *  1. lee el estado y la escuela de la necesidad (la escuela del evento sale
 *     de la base, no del cliente);
 *  2. comprueba permiso y transición (authorizeValidateNeed);
 *  3. construye el evento canónico NEED_VALIDATED (rol admin);
 *  4. llama a flow_validate_need, que en UNA transacción bloquea la fila,
 *     vuelve a validar actor, estado y evento (SHA-256), publica la necesidad
 *     y registra el evento pendiente en hedera_events.
 *
 * No publica en Hedera: eso lo hace publishEvent(eventId) después.
 */
export async function validateNeed(actor: Actor, needId: string) {
  if (!UUID.test(needId)) throw new FlowError("INVALID_INPUT", "Identificador de necesidad inválido.");

  const db = createAdminClient();
  const { data: need, error: readError } = await db
    .from("needs")
    .select("id, school_id, status")
    .eq("id", needId)
    .maybeSingle();
  if (readError) throw new Error(`No se pudo leer la necesidad: ${readError.message}`);
  if (!need) throw new FlowError("NOT_FOUND", "La necesidad no existe.");

  const decision = authorizeValidateNeed(actor, { schoolId: need.school_id, status: need.status });
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const event = buildEvent({
    type: "NEED_VALIDATED",
    needId: need.id,
    schoolId: need.school_id,
    commitmentId: null,
    actorRole: "admin",
  });

  const args = {
    p_actor_id: actor.id,
    p_need_id: need.id,
    p_event_id: event.payload.eventId,
    p_payload_canonical: event.payloadCanonical,
    p_payload_hash: event.payloadHash,
  } satisfies ValidateNeedArgs;

  const { error } = await db.rpc("flow_validate_need", args);
  if (error) throw flowErrorFromRpc(error);

  return { needId: need.id, eventId: event.payload.eventId, event };
}
