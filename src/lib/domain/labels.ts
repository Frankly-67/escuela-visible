import type { Enums } from "@/types/database";

/** Textos de interfaz para los valores de la base de datos. */

export const CATEGORY_LABEL: Record<Enums<"need_category">, string> = {
  infraestructura: "Infraestructura",
  materiales: "Materiales",
  alimentacion: "Alimentación",
  conectividad: "Conectividad",
  transporte: "Transporte",
  actividad_comunitaria: "Actividad comunitaria",
};

export const PRIORITY_LABEL: Record<Enums<"need_priority">, string> = {
  alta: "Prioridad alta",
  media: "Prioridad media",
  baja: "Prioridad baja",
};

export const NEED_STATUS_LABEL: Record<Enums<"need_status">, string> = {
  pending_validation: "Pendiente de validación",
  published: "Abierta a apoyos",
  completed: "Completada",
  cancelled: "No aprobada",
};

export const NEED_KIND_LABEL: Record<Enums<"need_kind">, string> = {
  need: "Necesidad",
  campaign: "Campaña comunitaria",
};

const quantityFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** "20 kits", "1,5 m²". */
export function formatQuantity(quantity: number, unit: string): string {
  return `${quantityFormat.format(quantity)} ${unit}`;
}
