import { z } from "zod";

import { Constants } from "@/types/database";

import { SHA256_HEX_PATTERN } from "./hash";
import {
  COMMITMENT_EVENT_TYPES,
  EVENT_ACTOR_ROLE,
  EVENT_APP_ID,
  EVENT_SCHEMA_VERSION,
  type EventPayloadV1,
  type HcsMessageV1,
} from "./types";

// UUID en minúsculas (como los devuelve Postgres): un mismo id no puede
// producir dos hashes distintos por cambiar mayúsculas.
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/, "UUID debe estar en minúsculas");

const commitmentTypes: readonly string[] = COMMITMENT_EVENT_TYPES;

/**
 * Esquema ESTRICTO del payload: cualquier campo no aprobado (título, nota,
 * nombre, foto…) hace fallar la validación. Es la barrera de privacidad
 * de lo que llega a Hedera.
 */
export const eventPayloadSchema = z
  .strictObject({
    v: z.literal(EVENT_SCHEMA_VERSION),
    app: z.literal(EVENT_APP_ID),
    eventId: uuid,
    type: z.enum(Constants.public.Enums.hedera_event_type),
    needId: uuid,
    schoolId: uuid,
    commitmentId: uuid.nullable(),
    actorRole: z.enum(Constants.public.Enums.user_role),
    timestamp: z.iso.datetime({ precision: 3 }),
  })
  .superRefine((p, ctx) => {
    const needsCommitment = commitmentTypes.includes(p.type);
    if (needsCommitment && p.commitmentId === null) {
      ctx.addIssue({ code: "custom", path: ["commitmentId"], message: `${p.type} requiere commitmentId` });
    }
    if (!needsCommitment && p.commitmentId !== null) {
      ctx.addIssue({ code: "custom", path: ["commitmentId"], message: `${p.type} no admite commitmentId` });
    }
    if (EVENT_ACTOR_ROLE[p.type] !== p.actorRole) {
      ctx.addIssue({
        code: "custom",
        path: ["actorRole"],
        message: `${p.type} solo puede originarlo ${EVENT_ACTOR_ROLE[p.type]}`,
      });
    }
  }) satisfies z.ZodType<EventPayloadV1>;

export const hcsMessageSchema = z.strictObject({
  hash: z.string().regex(SHA256_HEX_PATTERN, "hash debe ser SHA-256 hex en minúsculas"),
  payload: eventPayloadSchema,
}) satisfies z.ZodType<HcsMessageV1>;
