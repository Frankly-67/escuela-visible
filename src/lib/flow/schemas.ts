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
