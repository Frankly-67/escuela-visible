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

/** Estados de un compromiso que usa el flujo (`cancelled` no tiene transiciones). */
export const COMMITMENT_STATUS_LABEL: Record<Exclude<Enums<"commitment_status">, "cancelled">, string> = {
  committed: "Apoyo comprometido",
  delivery_reported: "Entrega reportada",
  confirmed: "Recepción confirmada por la escuela",
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

/** Nombre de cada paso del flujo en la historia pública. */
export const EVENT_LABEL: Record<Enums<"hedera_event_type">, string> = {
  NEED_CREATED: "Necesidad registrada",
  NEED_VALIDATED: "Necesidad validada",
  COMMITMENT_CREATED: "Apoyo comprometido",
  DELIVERY_REPORTED: "Entrega reportada",
  SCHOOL_CONFIRMED: "Recepción confirmada por la escuela",
};

/** Quién actuó, como ROL (nunca nombres de personas). */
export const ROLE_LABEL: Record<Enums<"user_role">, string> = {
  school_rep: "La escuela",
  admin: "Escuela Visible",
  supporter: "Un aliado",
};

const TIME_ZONE = "America/Bogota";
const dateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: TIME_ZONE });

/** "30 de septiembre de 2026" (hora de Colombia). */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** "30 de septiembre de 2026 a las 9:31 p. m." (hora de Colombia). */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** "5 de 20 kits confirmados por la escuela · 25 %". */
export function formatConfirmedProgress(confirmed: number, goal: number, unit: string, percent: number): string {
  return `${quantityFormat.format(confirmed)} de ${formatQuantity(goal, unit)} confirmados por la escuela · ${percent} %`;
}
