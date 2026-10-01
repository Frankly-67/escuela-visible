import { z } from "zod";

import { CONTACT_DATA_MESSAGE, findContactData } from "@/lib/domain/contact-data";
import { Constants } from "@/types/database";

const E = Constants.public.Enums;
const uuid = z.uuid().regex(/^[0-9a-f-]{36}$/, "UUID debe estar en minúsculas");

/** Sin teléfonos ni correos (misma regla que la base de datos). */
const withoutContactData = (text: string, ctx: z.RefinementCtx) => {
  const found = findContactData(text);
  if (found) ctx.addIssue({ code: "custom", message: CONTACT_DATA_MESSAGE[found] });
};

/**
 * Publicación nueva del tablón. Los límites son los de la base de datos
 * (título 3–120, texto ≤ 2000, fecha opcional). Solo texto: sin imágenes,
 * contactos, precios ni enlaces a necesidades. Nada de esto viaja a Hedera.
 */
export const createBoardPostInputSchema = z.strictObject({
  schoolId: uuid,
  kind: z.enum(E.board_post_kind, "Elige un tipo de publicación."),
  title: z
    .string()
    .trim()
    .min(3, "El título es muy corto")
    .max(120, "El título es muy largo")
    .superRefine(withoutContactData),
  body: z.string().trim().max(2000, "El texto es muy largo").default("").superRefine(withoutContactData),
  eventDate: z.iso.date("La fecha no es válida.").nullable().default(null),
});

export type CreateBoardPostInput = z.input<typeof createBoardPostInputSchema>;
