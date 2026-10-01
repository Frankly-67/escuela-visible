/**
 * DTOs de los paneles (Escuela, Aliado, Admin) y su mapeo desde filas de la
 * base de datos. Funciones puras: sin I/O.
 *
 * Cada mapeo copia campo a campo una LISTA BLANCA. Aunque la fila de entrada
 * traiga columnas sensibles (supporter_id, confirmed_by, created_by,
 * validated_by, notas, evidencia, submission_error, attempts…), nunca llegan
 * al DTO. Nunca usar spread (`...row`) aquí.
 */
import type { Enums } from "@/types/database";

import type { CommitmentStatus, NeedStatus } from "./state-machine";

// --- Filtro de estado (?estado=) -------------------------------------------

export const NEED_STATUSES = ["pending_validation", "published", "completed", "cancelled"] as const satisfies readonly NeedStatus[];

/**
 * Valida el filtro de presentación `?estado=` del panel Admin.
 * - Sin parámetro (undefined) → null: sin filtro (todas).
 * - Un valor exacto del enum → ese estado.
 * - Cualquier otra cosa (vacío, mayúsculas, roles, ids, repetido…) → "invalid".
 */
export function parseNeedStatusFilter(value: string | string[] | undefined): NeedStatus | null | "invalid" {
  if (value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  return (NEED_STATUSES as readonly string[]).includes(value) ? (value as NeedStatus) : "invalid";
}

// --- Filas de entrada (solo lo que se lee; pueden traer más columnas) -------

export type NeedRow = {
  id: string;
  kind: Enums<"need_kind">;
  title: string;
  description: string;
  category: Enums<"need_category">;
  priority: Enums<"need_priority">;
  goal_quantity: number;
  goal_unit: string;
  event_date: string | null;
  status: NeedStatus;
  validated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SchoolRow = {
  name: string;
  slug: string;
  municipality: string;
  department: string;
  vereda: string | null;
  is_demo: boolean;
};

export type ProgressRow = {
  goal_quantity: number | null;
  committed_quantity: number | null;
  confirmed_quantity: number | null;
  active_commitments: number | null;
};

export type CommitmentRow = {
  id: string;
  need_id: string;
  quantity: number;
  status: CommitmentStatus;
  created_at: string;
  delivery_reported_at: string | null;
  confirmed_at: string | null;
};

export type EventRow = {
  id: string;
  event_type: Enums<"hedera_event_type">;
  sequence_number: number | null;
  submission_status: Enums<"hedera_submission_status">;
};

export type ActivityRow = {
  event_id: string | null;
  event_type: Enums<"hedera_event_type"> | null;
  created_at: string | null;
  submission_status: Enums<"hedera_submission_status"> | null;
  need_id: string | null;
  need_title: string | null;
  school_name: string | null;
  school_slug: string | null;
  school_municipality: string | null;
  school_is_demo: boolean | null;
};

// --- DTOs ------------------------------------------------------------------

export type NeedCounts = Record<NeedStatus, number>;

export type PanelSchoolDTO = {
  name: string;
  slug: string;
  municipality: string;
  department: string;
  vereda: string | null;
  is_demo: boolean;
};

export type NeedDTO = {
  id: string;
  kind: Enums<"need_kind">;
  title: string;
  description: string;
  category: Enums<"need_category">;
  priority: Enums<"need_priority">;
  goal_quantity: number;
  goal_unit: string;
  event_date: string | null;
  status: NeedStatus;
  validated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SchoolNeedDTO = NeedDTO & {
  progress: { goal: number; committed: number; confirmed: number; active: number };
};

export const PENDING_DELIVERY_TEXT = "Entrega reportada por un aliado";

export type PendingDeliveryDTO = {
  commitmentId: string;
  needId: string;
  needTitle: string;
  quantity: number;
  goalUnit: string;
  deliveryReportedAt: string | null;
  text: typeof PENDING_DELIVERY_TEXT;
};

export type SchoolPanelDTO = {
  school: PanelSchoolDTO;
  counts: NeedCounts;
  needs: SchoolNeedDTO[];
  pendingDeliveries: PendingDeliveryDTO[];
};

export type PanelEventDTO = {
  eventId: string;
  type: Enums<"hedera_event_type">;
  /** Número de registro en el topic, si ya se publicó (para enlazar a /verify). */
  registryNumber: number | null;
  published: boolean;
};

export type SupporterCommitmentDTO = {
  id: string;
  needId: string;
  quantity: number;
  status: CommitmentStatus;
  createdAt: string;
  deliveryReportedAt: string | null;
  confirmedAt: string | null;
  need: {
    id: string;
    title: string;
    category: Enums<"need_category">;
    priority: Enums<"need_priority">;
    goalQuantity: number;
    goalUnit: string;
    status: NeedStatus;
  } | null;
  school: {
    name: string;
    slug: string;
    municipality: string;
    department: string;
    vereda: string | null;
    isDemo: boolean;
  } | null;
  progress: { goal: number; committed: number; confirmed: number } | null;
  events: PanelEventDTO[];
};

export type SupporterPanelDTO = { commitments: SupporterCommitmentDTO[] };

export type PublicationCounts = Record<Enums<"hedera_submission_status">, number>;

export type ActivityDTO = {
  eventId: string;
  type: Enums<"hedera_event_type">;
  recordedAt: string;
  published: boolean;
  needId: string;
  needTitle: string;
  school: { name: string; slug: string; municipality: string; isDemo: boolean };
};

export type AdminOverviewDTO = {
  counts: NeedCounts;
  /** Solo cantidades por estado de publicación; nunca errores ni intentos. */
  publication: PublicationCounts;
  recentActivity: ActivityDTO[];
};

export type AdminNeedDTO = NeedDTO & { school: { name: string; slug: string } | null };

export type AdminNeedsResult =
  | { ok: true; filter: NeedStatus | null; needs: AdminNeedDTO[] }
  | { ok: false; error: "INVALID_STATUS" };

export type AdminNeedReviewDTO = NeedDTO & { school: PanelSchoolDTO | null };

// --- Mapeos con lista blanca -------------------------------------------------

export function toPanelSchoolDTO(row: SchoolRow): PanelSchoolDTO {
  return {
    name: row.name,
    slug: row.slug,
    municipality: row.municipality,
    department: row.department,
    vereda: row.vereda,
    is_demo: row.is_demo,
  };
}

export function toNeedDTO(row: NeedRow): NeedDTO {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    goal_quantity: row.goal_quantity,
    goal_unit: row.goal_unit,
    event_date: row.event_date,
    status: row.status,
    validated_at: row.validated_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toSchoolNeedDTO(row: NeedRow, progress: ProgressRow | undefined): SchoolNeedDTO {
  return {
    ...toNeedDTO(row),
    progress: {
      goal: row.goal_quantity,
      committed: progress?.committed_quantity ?? 0,
      confirmed: progress?.confirmed_quantity ?? 0,
      active: progress?.active_commitments ?? 0,
    },
  };
}

export function toPendingDeliveryDTO(
  row: CommitmentRow,
  need: Pick<NeedRow, "id" | "title" | "goal_unit">,
): PendingDeliveryDTO {
  return {
    commitmentId: row.id,
    needId: need.id,
    needTitle: need.title,
    quantity: row.quantity,
    goalUnit: need.goal_unit,
    deliveryReportedAt: row.delivery_reported_at,
    text: PENDING_DELIVERY_TEXT,
  };
}

export function toPanelEventDTO(row: EventRow): PanelEventDTO {
  const published = row.submission_status === "submitted" && row.sequence_number !== null;
  return {
    eventId: row.id,
    type: row.event_type,
    registryNumber: published ? row.sequence_number : null,
    published,
  };
}

export function toSupporterCommitmentDTO(
  row: CommitmentRow,
  need: (Pick<NeedRow, "id" | "title" | "category" | "priority" | "goal_quantity" | "goal_unit" | "status">) | undefined,
  school: SchoolRow | undefined,
  progress: ProgressRow | undefined,
  events: EventRow[],
): SupporterCommitmentDTO {
  return {
    id: row.id,
    needId: row.need_id,
    quantity: row.quantity,
    status: row.status,
    createdAt: row.created_at,
    deliveryReportedAt: row.delivery_reported_at,
    confirmedAt: row.confirmed_at,
    need: need
      ? {
          id: need.id,
          title: need.title,
          category: need.category,
          priority: need.priority,
          goalQuantity: need.goal_quantity,
          goalUnit: need.goal_unit,
          status: need.status,
        }
      : null,
    school: school
      ? {
          name: school.name,
          slug: school.slug,
          municipality: school.municipality,
          department: school.department,
          vereda: school.vereda,
          isDemo: school.is_demo,
        }
      : null,
    progress: need
      ? {
          goal: need.goal_quantity,
          committed: progress?.committed_quantity ?? 0,
          confirmed: progress?.confirmed_quantity ?? 0,
        }
      : null,
    events: events.map(toPanelEventDTO),
  };
}

export function toAdminNeedDTO(row: NeedRow, school: Pick<SchoolRow, "name" | "slug"> | undefined): AdminNeedDTO {
  return { ...toNeedDTO(row), school: school ? { name: school.name, slug: school.slug } : null };
}

export function toAdminNeedReviewDTO(row: NeedRow, school: SchoolRow | undefined): AdminNeedReviewDTO {
  return { ...toNeedDTO(row), school: school ? toPanelSchoolDTO(school) : null };
}

/** Actividad reciente (vista impact_feed). Descarta filas incompletas. */
export function toActivityDTO(row: ActivityRow): ActivityDTO | null {
  if (!row.event_id || !row.event_type || !row.created_at || !row.need_id || !row.need_title || !row.school_name || !row.school_slug) {
    return null;
  }
  return {
    eventId: row.event_id,
    type: row.event_type,
    recordedAt: row.created_at,
    published: row.submission_status === "submitted",
    needId: row.need_id,
    needTitle: row.need_title,
    school: {
      name: row.school_name,
      slug: row.school_slug,
      municipality: row.school_municipality ?? "",
      isDemo: row.school_is_demo ?? false,
    },
  };
}

// --- Agregados -----------------------------------------------------------------

export function countNeedsByStatus(rows: readonly { status: NeedStatus }[]): NeedCounts {
  const counts: NeedCounts = { pending_validation: 0, published: 0, completed: 0, cancelled: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

export function countPublication(rows: readonly { submission_status: Enums<"hedera_submission_status"> }[]): PublicationCounts {
  const counts: PublicationCounts = { pending: 0, submitted: 0, failed: 0 };
  for (const row of rows) counts[row.submission_status] += 1;
  return counts;
}

/**
 * Eventos de la escuela del actor para UNA necesidad, a partir de una
 * consulta agrupada. Defensa en profundidad: descarta cualquier evento de otra
 * escuela o de otra necesidad aunque la consulta lo hubiera traído.
 */
export function selectSchoolNeedEvents<T extends { school_id: string; need_id: string }>(
  rows: readonly T[],
  schoolId: string,
  needId: string,
): T[] {
  return rows.filter((row) => row.school_id === schoolId && row.need_id === needId);
}

/** Agrupa filas por una clave (p. ej. eventos por commitment_id), sin claves nulas. */
export function groupBy<T, K extends string>(rows: readonly T[], key: (row: T) => K | null): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}
