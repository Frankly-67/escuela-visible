import "server-only";

import { requireActor } from "@/lib/auth/session";
import {
  countNeedsByStatus,
  countPublication,
  groupBy,
  parseNeedStatusFilter,
  selectSchoolNeedEvents,
  toActivityDTO,
  toAdminNeedDTO,
  toAdminNeedReviewDTO,
  toPanelSchoolDTO,
  toPendingDeliveryDTO,
  toSchoolNeedDTO,
  toSupporterCommitmentDTO,
  type ActivityDTO,
  type AdminNeedReviewDTO,
  type AdminNeedsResult,
  type AdminOverviewDTO,
  type CommitmentRow,
  type ProgressRow,
  type SchoolPanelDTO,
  type SupporterPanelDTO,
} from "@/lib/domain/panel";
import { buildTimeline, type TimelineStep } from "@/lib/domain/timeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas de los paneles (solo lectura).
 *
 * - Cada función exportada llama a `requireActor([rol])` y toma el contexto de
 *   la SESIÓN (actor.schoolId, actor.id). Ninguna acepta userId, supporterId,
 *   schoolId ni role como parámetro.
 * - Por defecto, cliente con la sesión: RLS + permisos de columnas (B0/B0.1).
 * - Única excepción: `readSupporterCommitments` (privada) usa el cliente admin,
 *   porque `commitments.supporter_id` no es legible con la sesión.
 * - Columnas explícitas y DTOs con lista blanca (`@/lib/domain/panel`). Sin
 *   verificación en vivo: los paneles solo enlazan a /verify/[eventId].
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCHOOL_FIELDS = "id, name, slug, municipality, department, vereda, is_demo";
const NEED_FIELDS =
  "id, school_id, kind, title, description, category, priority, goal_quantity, goal_unit, event_date, status, validated_at, completed_at, created_at, updated_at";
const PROGRESS_FIELDS = "need_id, goal_quantity, committed_quantity, confirmed_quantity, active_commitments";
const COMMITMENT_FIELDS = "id, need_id, quantity, status, created_at, delivery_reported_at, confirmed_at";
const EVENT_FIELDS = "id, event_type, commitment_id, sequence_number, submission_status";
const ACTIVITY_FIELDS =
  "event_id, event_type, created_at, submission_status, need_id, need_title, school_name, school_slug, school_municipality, school_is_demo";
const RECENT_ACTIVITY_LIMIT = 10;

type SessionClient = Awaited<ReturnType<typeof createClient>>;

async function readProgress(supabase: SessionClient, needIds: string[]): Promise<Map<string, ProgressRow>> {
  if (needIds.length === 0) return new Map();
  const { data, error } = await supabase.from("need_progress").select(PROGRESS_FIELDS).in("need_id", needIds);
  if (error) throw new Error(`No se pudo leer el progreso: ${error.message}`);
  return new Map(data.flatMap((p) => (p.need_id ? [[p.need_id, p] as const] : [])));
}

// --- ESCUELA -------------------------------------------------------------------

/** Panel de la escuela del representante en sesión (actor.schoolId). */
export async function getSchoolPanel(): Promise<SchoolPanelDTO | null> {
  const actor = await requireActor(["school_rep"]);
  const schoolId = actor.schoolId;
  if (!schoolId) return null;

  const supabase = await createClient();
  const [schoolRes, needsRes] = await Promise.all([
    supabase.from("schools").select(SCHOOL_FIELDS).eq("id", schoolId).maybeSingle(),
    supabase.from("needs").select(NEED_FIELDS).eq("school_id", schoolId).order("created_at", { ascending: false }),
  ]);
  if (schoolRes.error) throw new Error(`No se pudo leer la escuela: ${schoolRes.error.message}`);
  if (needsRes.error) throw new Error(`No se pudieron leer las necesidades: ${needsRes.error.message}`);
  if (!schoolRes.data) return null;

  // Solo necesidades de la escuela del actor (RLS también deja ver las
  // públicas de otras escuelas; el filtro school_id lo impide).
  const needs = needsRes.data.filter((n) => n.school_id === schoolId);
  const needIds = needs.map((n) => n.id);

  const [progress, pendingRes] = await Promise.all([
    readProgress(supabase, needIds),
    needIds.length === 0
      ? Promise.resolve({ data: [] as CommitmentRow[], error: null })
      : supabase
          .from("commitments")
          .select(COMMITMENT_FIELDS)
          .in("need_id", needIds)
          .eq("status", "delivery_reported")
          .order("delivery_reported_at"),
  ]);
  if (pendingRes.error) throw new Error(`No se pudieron leer las entregas: ${pendingRes.error.message}`);

  const needById = new Map(needs.map((n) => [n.id, n]));
  return {
    school: toPanelSchoolDTO(schoolRes.data),
    counts: countNeedsByStatus(needs),
    needs: needs.map((n) => toSchoolNeedDTO(n, progress.get(n.id))),
    pendingDeliveries: pendingRes.data.flatMap((c) => {
      const need = needById.get(c.need_id);
      return need ? [toPendingDeliveryDTO(c, need)] : [];
    }),
  };
}

/**
 * Historia de una necesidad de la escuela del actor. Si `needId` no es de su
 * escuela (o no existe), devuelve null sin distinguir el motivo.
 */
export async function getSchoolNeedHistory(needId: string): Promise<TimelineStep[] | null> {
  const actor = await requireActor(["school_rep"]);
  const schoolId = actor.schoolId;
  if (!schoolId || !UUID.test(needId)) return null;

  const supabase = await createClient();
  const { data: need, error } = await supabase
    .from("needs")
    .select("id, school_id, goal_unit")
    .eq("id", needId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la necesidad: ${error.message}`);
  if (!need || need.school_id !== schoolId) return null;

  const [eventsRes, commitmentsRes] = await Promise.all([
    supabase
      .from("hedera_events")
      .select("id, event_type, need_id, school_id, commitment_id, actor_role, sequence_number, created_at, submission_status")
      .eq("school_id", schoolId)
      .eq("need_id", need.id)
      .order("created_at"),
    supabase.from("commitments").select("id, quantity, status, confirmed_at").eq("need_id", need.id).neq("status", "cancelled"),
  ]);
  if (eventsRes.error) throw new Error(`No se pudo leer la historia: ${eventsRes.error.message}`);
  if (commitmentsRes.error) throw new Error(`No se pudieron leer los apoyos: ${commitmentsRes.error.message}`);

  const events = selectSchoolNeedEvents(eventsRes.data, schoolId, need.id).map((e) => ({
    id: e.id,
    eventType: e.event_type,
    commitmentId: e.commitment_id,
    actorRole: e.actor_role,
    sequenceNumber: e.sequence_number,
    createdAt: e.created_at,
    submissionStatus: e.submission_status,
  }));
  const commitments = commitmentsRes.data.map((c) => ({
    id: c.id,
    quantity: c.quantity,
    status: c.status,
    confirmedAt: c.confirmed_at,
  }));
  return buildTimeline(events, commitments, need.goal_unit);
}

// --- ALIADO ----------------------------------------------------------------------

/**
 * ÚNICA lectura con el cliente admin (salta RLS y permisos de columnas).
 * No exportada. `actorId` SIEMPRE viene de requireActor(['supporter']).
 * - filtro obligatorio supporter_id = actorId;
 * - columnas explícitas: supporter_id solo se usa para filtrar, no se
 *   selecciona; tampoco confirmed_by, notas ni evidencia.
 */
async function readSupporterCommitments(actorId: string): Promise<CommitmentRow[]> {
  if (!UUID.test(actorId)) throw new Error("Actor inválido");
  const { data, error } = await createAdminClient()
    .from("commitments")
    .select(COMMITMENT_FIELDS)
    .eq("supporter_id", actorId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los compromisos: ${error.message}`);
  return data;
}

/** Panel del aliado en sesión: sus compromisos (actor.id). */
export async function getSupporterPanel(): Promise<SupporterPanelDTO> {
  const actor = await requireActor(["supporter"]);
  const commitments = await readSupporterCommitments(actor.id);
  if (commitments.length === 0) return { commitments: [] };

  // El resto, con la sesión (datos públicos de necesidades, escuelas y eventos).
  const supabase = await createClient();
  const needIds = [...new Set(commitments.map((c) => c.need_id))];
  const [needsRes, eventsRes, progress] = await Promise.all([
    supabase.from("needs").select("id, school_id, title, category, priority, goal_quantity, goal_unit, status").in("id", needIds),
    supabase
      .from("hedera_events")
      .select(EVENT_FIELDS)
      .in("commitment_id", commitments.map((c) => c.id))
      .order("created_at"),
    readProgress(supabase, needIds),
  ]);
  if (needsRes.error) throw new Error(`No se pudieron leer las necesidades: ${needsRes.error.message}`);
  if (eventsRes.error) throw new Error(`No se pudo leer la historia: ${eventsRes.error.message}`);

  const schoolIds = [...new Set(needsRes.data.map((n) => n.school_id))];
  const schoolsRes = schoolIds.length
    ? await supabase.from("schools").select(SCHOOL_FIELDS).in("id", schoolIds)
    : { data: [], error: null };
  if (schoolsRes.error) throw new Error(`No se pudieron leer las escuelas: ${schoolsRes.error.message}`);

  const needById = new Map(needsRes.data.map((n) => [n.id, n]));
  const schoolById = new Map(schoolsRes.data.map((s) => [s.id, s]));
  const eventsByCommitment = groupBy(eventsRes.data, (e) => e.commitment_id);

  return {
    commitments: commitments.map((c) => {
      const need = needById.get(c.need_id);
      return toSupporterCommitmentDTO(
        c,
        need,
        need ? schoolById.get(need.school_id) : undefined,
        progress.get(c.need_id),
        eventsByCommitment.get(c.id) ?? [],
      );
    }),
  };
}

// --- ADMIN -----------------------------------------------------------------------

/** Resumen para el admin: cantidades por estado y actividad reciente. */
export async function getAdminOverview(): Promise<AdminOverviewDTO> {
  await requireActor(["admin"]);
  const supabase = await createClient();
  const [needsRes, eventsRes, activityRes] = await Promise.all([
    supabase.from("needs").select("status"),
    // Solo el estado: nunca submission_error ni attempts.
    supabase.from("hedera_events").select("submission_status"),
    supabase.from("impact_feed").select(ACTIVITY_FIELDS).order("created_at", { ascending: false }).limit(RECENT_ACTIVITY_LIMIT),
  ]);
  if (needsRes.error) throw new Error(`No se pudieron leer las necesidades: ${needsRes.error.message}`);
  if (eventsRes.error) throw new Error(`No se pudo leer la publicación: ${eventsRes.error.message}`);
  if (activityRes.error) throw new Error(`No se pudo leer la actividad: ${activityRes.error.message}`);

  return {
    counts: countNeedsByStatus(needsRes.data),
    publication: countPublication(eventsRes.data),
    recentActivity: activityRes.data.map(toActivityDTO).filter((a): a is ActivityDTO => a !== null),
  };
}

/**
 * Necesidades para el admin, con filtro de PRESENTACIÓN `?estado=` validado
 * contra el enum. Un valor no válido se rechaza sin consultar.
 */
export async function getAdminNeeds(estado: string | string[] | undefined): Promise<AdminNeedsResult> {
  await requireActor(["admin"]);
  const filter = parseNeedStatusFilter(estado);
  if (filter === "invalid") return { ok: false, error: "INVALID_STATUS" };

  const supabase = await createClient();
  let query = supabase.from("needs").select(NEED_FIELDS).order("created_at", { ascending: false });
  if (filter) query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las necesidades: ${error.message}`);

  const schoolIds = [...new Set(data.map((n) => n.school_id))];
  const schoolsRes = schoolIds.length
    ? await supabase.from("schools").select("id, name, slug").in("id", schoolIds)
    : { data: [], error: null };
  if (schoolsRes.error) throw new Error(`No se pudieron leer las escuelas: ${schoolsRes.error.message}`);
  const schoolById = new Map(schoolsRes.data.map((s) => [s.id, s]));

  return { ok: true, filter, needs: data.map((n) => toAdminNeedDTO(n, schoolById.get(n.school_id))) };
}

/** Datos para una futura revisión administrativa (sin acciones). */
export async function getAdminNeedReview(needId: string): Promise<AdminNeedReviewDTO | null> {
  await requireActor(["admin"]);
  if (!UUID.test(needId)) return null;

  const supabase = await createClient();
  const { data: need, error } = await supabase.from("needs").select(NEED_FIELDS).eq("id", needId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la necesidad: ${error.message}`);
  if (!need) return null;

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select(SCHOOL_FIELDS)
    .eq("id", need.school_id)
    .maybeSingle();
  if (schoolError) throw new Error(`No se pudo leer la escuela: ${schoolError.message}`);

  return toAdminNeedReviewDTO(need, school ?? undefined);
}
