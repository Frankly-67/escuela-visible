/**
 * Tablón de Escuela Visible: reglas puras (sin I/O).
 *
 * Flujo: la escuela envía una publicación (pending_review) → el admin la
 * aprueba (published, pública) o no (rejected). Sin edición después de
 * enviar. Las publicaciones no generan eventos ni se publican en Hedera.
 * Las mismas reglas las aplica la base de datos (board_* y su trigger).
 */
import { Constants, type Enums } from "@/types/database";

import { hasRole, isSchoolRepOf, type Actor, type Decision } from "./permissions";

export type BoardPostKind = Enums<"board_post_kind">;
export type BoardPostStatus = Enums<"board_post_status">;

export const BOARD_POST_KINDS = Constants.public.Enums.board_post_kind;
export const BOARD_POST_STATUSES = Constants.public.Enums.board_post_status;

export const BOARD_KIND_LABEL: Record<BoardPostKind, string> = {
  bazar: "Bazar",
  sancocho: "Sancocho",
  actividad: "Actividad deportiva o cultural",
  mejora_infraestructura: "Mejora de infraestructura",
  materiales_escolares: "Materiales escolares",
  campana: "Campaña",
  proyecto_terminado: "Proyecto terminado",
};

export const BOARD_STATUS_LABEL: Record<BoardPostStatus, string> = {
  pending_review: "Pendiente de revisión",
  published: "Publicada",
  rejected: "No aprobada",
};

const TRANSITIONS: Record<BoardPostStatus, readonly BoardPostStatus[]> = {
  pending_review: ["published", "rejected"],
  published: [],
  rejected: [],
};

export function canTransitionPost(from: BoardPostStatus, to: BoardPostStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const deny = (code: "FORBIDDEN_ROLE" | "NOT_SCHOOL_MEMBER" | "INVALID_TRANSITION", message: string): Decision => ({
  ok: false,
  code,
  message,
});

/** Publicar en el tablón: solo el representante de esa escuela. */
export function authorizeCreatePost(actor: Actor, target: { schoolId: string }): Decision {
  if (!hasRole(actor, "school_rep")) {
    return deny("FORBIDDEN_ROLE", "Solo el representante de la escuela puede publicar en el tablón.");
  }
  if (!isSchoolRepOf(actor, target.schoolId)) {
    return deny("NOT_SCHOOL_MEMBER", "Solo puedes publicar para tu propia escuela.");
  }
  return { ok: true };
}

/** Aprobar o no aprobar: solo admin, y solo desde pending_review. */
export function authorizeReviewPost(actor: Actor, post: { status: BoardPostStatus }, to: "published" | "rejected"): Decision {
  if (!hasRole(actor, "admin")) {
    return deny("FORBIDDEN_ROLE", "Solo la administración de la plataforma puede revisar publicaciones.");
  }
  if (!canTransitionPost(post.status, to)) {
    return deny("INVALID_TRANSITION", "Esta publicación no está pendiente de revisión.");
  }
  return { ok: true };
}

/**
 * Filtro por tipo del tablón público (`?tipo=`). Sin valor → todos;
 * un valor que no es un tipo válido → inválido (no se consulta la base).
 */
export function parseBoardKindFilter(
  value: string | string[] | undefined,
): { ok: true; kind: BoardPostKind | null } | { ok: false } {
  if (value === undefined) return { ok: true, kind: null };
  if (typeof value !== "string" || !(BOARD_POST_KINDS as readonly string[]).includes(value)) return { ok: false };
  return { ok: true, kind: value as BoardPostKind };
}
