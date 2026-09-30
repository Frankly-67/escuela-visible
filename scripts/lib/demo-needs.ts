/**
 * Necesidades DEMO (ficticias). Texto institucional y agregado: sin nombres,
 * fotos, datos médicos ni datos personales. Ningún texto de aquí va a Hedera.
 */
import type { CreateNeedInput } from "@/lib/flow/schemas";

type DemoNeed = Omit<CreateNeedInput, "schoolId"> & { schoolSlug: string };

/** Primera necesidad real del MVP: su NEED_CREATED será el mensaje #1 del topic. */
export const FIRST_DEMO_NEED: DemoNeed = {
  schoolSlug: "escuela-demo-el-mirador",
  kind: "need",
  title: "Kits de materiales escolares (DEMO)",
  description:
    "Necesidad ficticia de demostración. La escuela solicita kits básicos de útiles " +
    "(cuadernos, lápices, colores y regla) para el trabajo en el aula multigrado. " +
    "Se expresa de forma agregada y no identifica a ningún estudiante.",
  category: "materiales",
  priority: "media",
  goalQuantity: 20,
  goalUnit: "kits",
  eventDate: null,
};
