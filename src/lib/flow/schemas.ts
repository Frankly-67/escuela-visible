import { z } from "zod";

import { Constants } from "@/types/database";

const E = Constants.public.Enums;
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/, "UUID debe estar en minúsculas");
const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/**
 * Datos de una necesidad nueva. Solo texto institucional: la interfaz avisará
 * que no se incluyan nombres de menores, fotos ni datos personales. Ningún
 * texto de aquí viaja a Hedera (solo ids, tipo, rol y fecha).
 */
export const createNeedInputSchema = z.strictObject({
  schoolId: uuid,
  kind: z.enum(E.need_kind).default("need"),
  title: z.string().trim().min(3, "El título es muy corto").max(120, "El título es muy largo"),
  description: z.string().trim().max(2000, "La descripción es muy larga").default(""),
  category: z.enum(E.need_category),
  priority: z.enum(E.need_priority).default("media"),
  goalQuantity: z
    .number()
    .positive("La meta debe ser mayor que cero")
    .max(9_999_999_999.99)
    .refine(twoDecimals, "La meta admite máximo 2 decimales"),
  goalUnit: z.string().trim().min(1, "Indica la unidad"),
  eventDate: z.iso.date().nullable().default(null),
});

export type CreateNeedInput = z.input<typeof createNeedInputSchema>;
export type CreateNeedData = z.output<typeof createNeedInputSchema>;

/*
 * Compromisos y entregas. Los límites son los que YA exige la base de datos
 * (numeric(12,2), note ≤ 500, delivery_note ≤ 1000); el límite de cantidad
 * restante lo comprueban authorizeCreateCommitment y flow_create_commitment.
 * Las notas nunca viajan a Hedera.
 */
export const createCommitmentInputSchema = z.strictObject({
  needId: uuid,
  quantity: z
    .number()
    .positive("La cantidad debe ser mayor que cero")
    .max(9_999_999_999.99)
    .refine(twoDecimals, "La cantidad admite máximo 2 decimales"),
  note: z.string().trim().max(500, "La nota es muy larga").nullable().default(null),
});

export const reportDeliveryInputSchema = z.strictObject({
  commitmentId: uuid,
  deliveryNote: z.string().trim().max(1000, "La nota de entrega es muy larga").nullable().default(null),
});

export const confirmReceiptInputSchema = z.strictObject({
  commitmentId: uuid,
});

export type CreateCommitmentInput = z.input<typeof createCommitmentInputSchema>;
export type ReportDeliveryInput = z.input<typeof reportDeliveryInputSchema>;
export type ConfirmReceiptInput = z.input<typeof confirmReceiptInputSchema>;
