import type { Enums } from "@/types/database";

export type NeedStatus = Enums<"need_status">;
export type CommitmentStatus = Enums<"commitment_status">;

/**
 * Transiciones permitidas de una necesidad.
 *
 *   (escuela crea) → pending_validation ──(admin valida)──→ published ──(confirmado ≥ meta)──→ completed
 *                           └──(admin rechaza)──→ cancelled
 *
 * published = validada y abierta a compromisos.
 */
export const NEED_TRANSITIONS = {
  pending_validation: ["published", "cancelled"],
  published: ["completed"],
  completed: [],
  cancelled: [],
} as const satisfies Record<NeedStatus, readonly NeedStatus[]>;

/**
 * Transiciones permitidas de un compromiso.
 *
 *   (aliado se compromete) → committed ──(aliado reporta)──→ delivery_reported ──(escuela confirma)──→ confirmed
 *
 * Informar la entrega NO es recibirla: solo la confirmación de la escuela
 * lleva a `confirmed`. No existe atajo committed → confirmed.
 * `cancelled` existe en la base de datos pero no tiene transiciones en Phase 2.
 */
export const COMMITMENT_TRANSITIONS = {
  committed: ["delivery_reported"],
  delivery_reported: ["confirmed"],
  confirmed: [],
  cancelled: [],
} as const satisfies Record<CommitmentStatus, readonly CommitmentStatus[]>;

export const INITIAL_NEED_STATUS = "pending_validation" as const satisfies NeedStatus;
export const INITIAL_COMMITMENT_STATUS = "committed" as const satisfies CommitmentStatus;

export function canTransitionNeed(from: NeedStatus, to: NeedStatus): boolean {
  return (NEED_TRANSITIONS[from] as readonly NeedStatus[]).includes(to);
}

export function canTransitionCommitment(from: CommitmentStatus, to: CommitmentStatus): boolean {
  return (COMMITMENT_TRANSITIONS[from] as readonly CommitmentStatus[]).includes(to);
}

/** Solo una necesidad publicada (validada y abierta) acepta compromisos. */
export function needAcceptsCommitments(status: NeedStatus): boolean {
  return status === "published";
}

// --- Cantidades -------------------------------------------------------------
// Las cantidades son numeric(12,2) en la base de datos. Se comparan en
// centésimas enteras para evitar errores de coma flotante (0.1 + 0.2).

const toCents = (value: number) => Math.round(value * 100);

/** Cantidad todavía disponible para comprometer (nunca negativa). */
export function availableQuantity(goalQuantity: number, committedQuantity: number): number {
  return Math.max(0, toCents(goalQuantity) - toCents(committedQuantity)) / 100;
}

export type QuantityCheck =
  | { ok: true }
  | { ok: false; code: "INVALID_QUANTITY" | "QUANTITY_EXCEEDS_AVAILABLE"; available: number };

/**
 * La cantidad comprometida debe ser positiva, con máximo 2 decimales, y no
 * superar lo que todavía no está comprometido.
 */
export function checkCommitmentQuantity(
  quantity: number,
  goalQuantity: number,
  committedQuantity: number,
): QuantityCheck {
  const available = availableQuantity(goalQuantity, committedQuantity);
  const hasAtMostTwoDecimals = Number.isFinite(quantity) && Math.abs(quantity * 100 - toCents(quantity)) < 1e-6;

  if (!hasAtMostTwoDecimals || quantity <= 0) return { ok: false, code: "INVALID_QUANTITY", available };
  if (toCents(quantity) > toCents(available)) return { ok: false, code: "QUANTITY_EXCEEDS_AVAILABLE", available };
  return { ok: true };
}

/** La necesidad se completa cuando lo CONFIRMADO por la escuela alcanza la meta. */
export function shouldCompleteNeed(goalQuantity: number, confirmedQuantity: number): boolean {
  return toCents(confirmedQuantity) >= toCents(goalQuantity);
}
