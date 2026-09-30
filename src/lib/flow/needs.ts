import "server-only";

import { randomUUID } from "node:crypto";

import { authorizeCreateNeed, type Actor } from "@/lib/domain/permissions";
import { buildEvent } from "@/lib/events/build";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import { FlowError, flowErrorFromRpc } from "./errors";
import { createNeedInputSchema, type CreateNeedInput } from "./schemas";

type CreateNeedArgs = Database["public"]["Functions"]["flow_create_need"]["Args"];

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
