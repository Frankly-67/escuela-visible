import type { Enums } from "@/types/database";

import type { HederaEventType } from "@/lib/events/types";

import {
  canTransitionCommitment,
  canTransitionNeed,
  checkCommitmentQuantity,
  needAcceptsCommitments,
  type CommitmentStatus,
  type NeedStatus,
} from "./state-machine";

export type UserRole = Enums<"user_role">;

/** Quién intenta actuar. Se obtiene del perfil en el servidor, nunca del cliente. */
export type Actor = {
  id: string;
  role: UserRole;
  schoolId: string | null;
};

export type DenialCode =
  | "FORBIDDEN_ROLE"
  | "NOT_SCHOOL_MEMBER"
  | "NOT_COMMITMENT_OWNER"
  | "INVALID_TRANSITION"
  | "NEED_NOT_OPEN"
  | "INVALID_QUANTITY"
  | "QUANTITY_EXCEEDS_AVAILABLE";

export type Decision = { ok: true } | { ok: false; code: DenialCode; message: string };

const allow: Decision = { ok: true };
const deny = (code: DenialCode, message: string): Decision => ({ ok: false, code, message });

// --- Comprobaciones básicas ------------------------------------------------

export function hasRole(actor: Actor, role: UserRole): boolean {
  return actor.role === role;
}

/** El actor es representante de ESA escuela. */
export function isSchoolRepOf(actor: Actor, schoolId: string): boolean {
  return actor.role === "school_rep" && actor.schoolId !== null && actor.schoolId === schoolId;
}

/** El actor es el supporter que creó el compromiso. */
export function ownsCommitment(actor: Actor, commitment: { supporterId: string }): boolean {
  return actor.role === "supporter" && actor.id === commitment.supporterId;
}

// --- Acciones del flujo ----------------------------------------------------

export type FlowAction =
  | "create_need"
  | "validate_need"
  | "reject_need"
  | "create_commitment"
  | "report_delivery"
  | "confirm_receipt";

/** Evento HCS que genera cada acción. Rechazar no genera evento en Phase 2. */
export const ACTION_EVENT = {
  create_need: "NEED_CREATED",
  validate_need: "NEED_VALIDATED",
  reject_need: null,
  create_commitment: "COMMITMENT_CREATED",
  report_delivery: "DELIVERY_REPORTED",
  confirm_receipt: "SCHOOL_CONFIRMED",
} as const satisfies Record<FlowAction, HederaEventType | null>;

type NeedRef = { schoolId: string; status: NeedStatus };

/** NEED_CREATED: solo el representante de esa escuela. */
export function authorizeCreateNeed(actor: Actor, target: { schoolId: string }): Decision {
  if (!hasRole(actor, "school_rep")) {
    return deny("FORBIDDEN_ROLE", "Solo el representante de la escuela puede crear necesidades.");
  }
  if (!isSchoolRepOf(actor, target.schoolId)) {
    return deny("NOT_SCHOOL_MEMBER", "Solo puedes crear necesidades para tu propia escuela.");
  }
  return allow;
}

/** NEED_VALIDATED: solo admin, y solo desde pending_validation. */
export function authorizeValidateNeed(actor: Actor, need: NeedRef): Decision {
  if (!hasRole(actor, "admin")) {
    return deny("FORBIDDEN_ROLE", "Solo la administración de la plataforma puede validar necesidades.");
  }
  if (!canTransitionNeed(need.status, "published")) {
    return deny("INVALID_TRANSITION", "Esta necesidad no está pendiente de validación.");
  }
  return allow;
}

/** Rechazo: solo admin, y solo desde pending_validation. Sin evento HCS. */
export function authorizeRejectNeed(actor: Actor, need: NeedRef): Decision {
  if (!hasRole(actor, "admin")) {
    return deny("FORBIDDEN_ROLE", "Solo la administración de la plataforma puede rechazar necesidades.");
  }
  if (!canTransitionNeed(need.status, "cancelled")) {
    return deny("INVALID_TRANSITION", "Esta necesidad no está pendiente de validación.");
  }
  return allow;
}

/**
 * COMMITMENT_CREATED: solo supporter, sobre una necesidad publicada, y por
 * una cantidad que no supere lo todavía disponible.
 */
export function authorizeCreateCommitment(
  actor: Actor,
  need: NeedRef & { goalQuantity: number; committedQuantity: number },
  quantity: number,
): Decision {
  if (!hasRole(actor, "supporter")) {
    return deny("FORBIDDEN_ROLE", "Solo los aliados pueden comprometerse a ayudar.");
  }
  if (!needAcceptsCommitments(need.status)) {
    return deny("NEED_NOT_OPEN", "Esta necesidad no está abierta a compromisos.");
  }
  const check = checkCommitmentQuantity(quantity, need.goalQuantity, need.committedQuantity);
  if (!check.ok) {
    return check.code === "INVALID_QUANTITY"
      ? deny("INVALID_QUANTITY", "La cantidad debe ser mayor que cero y tener como máximo 2 decimales.")
      : deny("QUANTITY_EXCEEDS_AVAILABLE", `La cantidad supera lo disponible (${check.available}).`);
  }
  return allow;
}

/** DELIVERY_REPORTED: solo el mismo supporter que creó el compromiso. */
export function authorizeReportDelivery(
  actor: Actor,
  need: NeedRef,
  commitment: { supporterId: string; status: CommitmentStatus },
): Decision {
  if (!hasRole(actor, "supporter")) {
    return deny("FORBIDDEN_ROLE", "Solo el aliado que se comprometió puede reportar la entrega.");
  }
  if (!ownsCommitment(actor, commitment)) {
    return deny("NOT_COMMITMENT_OWNER", "Solo puedes reportar la entrega de tus propios compromisos.");
  }
  if (!needAcceptsCommitments(need.status)) {
    return deny("NEED_NOT_OPEN", "Esta necesidad ya no está abierta.");
  }
  if (!canTransitionCommitment(commitment.status, "delivery_reported")) {
    return deny("INVALID_TRANSITION", "La entrega de este compromiso ya fue reportada o cerrada.");
  }
  return allow;
}

/**
 * SCHOOL_CONFIRMED: solo el representante de la escuela de la necesidad,
 * y solo después de que el aliado reportó la entrega.
 */
export function authorizeConfirmReceipt(
  actor: Actor,
  need: NeedRef,
  commitment: { status: CommitmentStatus },
): Decision {
  if (!hasRole(actor, "school_rep")) {
    return deny("FORBIDDEN_ROLE", "Solo el representante de la escuela puede confirmar la recepción.");
  }
  if (!isSchoolRepOf(actor, need.schoolId)) {
    return deny("NOT_SCHOOL_MEMBER", "Solo puedes confirmar recepciones de tu propia escuela.");
  }
  if (!needAcceptsCommitments(need.status)) {
    return deny("NEED_NOT_OPEN", "Esta necesidad ya no está abierta.");
  }
  if (!canTransitionCommitment(commitment.status, "confirmed")) {
    return deny(
      "INVALID_TRANSITION",
      commitment.status === "committed"
        ? "El aliado todavía no ha reportado la entrega."
        : "Esta recepción ya fue confirmada o el compromiso está cerrado.",
    );
  }
  return allow;
}
