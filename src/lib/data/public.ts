import "server-only";

import { cache } from "react";

import { computeProgress, type NeedProgress } from "@/lib/domain/progress";
import type { TimelineCommitmentInput, TimelineEventInput } from "@/lib/domain/timeline";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/**
 * Lecturas públicas. Usan el cliente con la sesión del visitante y la
 * publishable key: RLS decide qué se ve (p. ej. solo necesidades publicadas
 * o completadas para el público). Nunca la secret key.
 */

export type PublicSchool = Pick<
  Tables<"schools">,
  "id" | "slug" | "name" | "department" | "municipality" | "vereda" | "latitude" | "longitude" | "description" | "is_demo"
>;

export type PublicNeed = Pick<
  Tables<"needs">,
  | "id"
  | "school_id"
  | "kind"
  | "title"
  | "description"
  | "category"
  | "priority"
  | "goal_quantity"
  | "goal_unit"
  | "event_date"
  | "status"
  | "created_at"
> & { progress: NeedProgress };

const SCHOOL_FIELDS = "id, slug, name, department, municipality, vereda, latitude, longitude, description, is_demo";
const NEED_FIELDS =
  "id, school_id, kind, title, description, category, priority, goal_quantity, goal_unit, event_date, status, created_at";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function withProgress(needs: Omit<PublicNeed, "progress">[]): Promise<PublicNeed[]> {
  if (needs.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("need_progress")
    .select("need_id, committed_quantity, confirmed_quantity")
    .in("need_id", needs.map((n) => n.id));
  if (error) throw new Error(`No se pudo leer el progreso: ${error.message}`);
  const byNeed = new Map(data.map((p) => [p.need_id, p]));
  return needs.map((need) => {
    const p = byNeed.get(need.id);
    return {
      ...need,
      progress: computeProgress(need.goal_quantity, p?.committed_quantity ?? 0, p?.confirmed_quantity ?? 0),
    };
  });
}

export async function listSchools(): Promise<PublicSchool[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").select(SCHOOL_FIELDS).order("name");
  if (error) throw new Error(`No se pudieron leer las escuelas: ${error.message}`);
  return data;
}

// cache(): la página y generateMetadata comparten una sola consulta por petición.
export const getSchoolBySlug = cache(async (slug: string): Promise<PublicSchool | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").select(SCHOOL_FIELDS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`No se pudo leer la escuela: ${error.message}`);
  return data;
});

/** Necesidades de una escuela visibles para quien consulta (RLS). */
export async function listNeedsBySchool(schoolId: string): Promise<PublicNeed[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("needs")
    .select(NEED_FIELDS)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las necesidades: ${error.message}`);
  return withProgress(data);
}

/** Necesidad y su escuela, si es visible para quien consulta (RLS). */
export const getNeed = cache(async (id: string): Promise<{ need: PublicNeed; school: PublicSchool } | null> => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("needs").select(NEED_FIELDS).eq("id", id).maybeSingle();
  if (error) throw new Error(`No se pudo leer la necesidad: ${error.message}`);
  if (!data) return null;

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select(SCHOOL_FIELDS)
    .eq("id", data.school_id)
    .single();
  if (schoolError) throw new Error(`No se pudo leer la escuela: ${schoolError.message}`);

  const [need] = await withProgress([data]);
  return { need, school };
});

/*
 * Historia pública de una necesidad. Columnas EXPLÍCITAS y seguras:
 * sin payload, submission_error, attempts ni ids de personas; sin notas.
 */
const EVENT_FIELDS = "id, event_type, commitment_id, actor_role, sequence_number, created_at, submission_status";
const COMMITMENT_FIELDS = "id, quantity, status, confirmed_at";

export const listNeedEvents = cache(async (needId: string): Promise<TimelineEventInput[]> => {
  if (!UUID.test(needId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hedera_events")
    .select(EVENT_FIELDS)
    .eq("need_id", needId)
    .order("created_at");
  if (error) throw new Error(`No se pudo leer la historia: ${error.message}`);
  return data.map((e) => ({
    id: e.id,
    eventType: e.event_type,
    commitmentId: e.commitment_id,
    actorRole: e.actor_role,
    sequenceNumber: e.sequence_number,
    createdAt: e.created_at,
    submissionStatus: e.submission_status,
  }));
});

export const listNeedCommitments = cache(async (needId: string): Promise<TimelineCommitmentInput[]> => {
  if (!UUID.test(needId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commitments")
    .select(COMMITMENT_FIELDS)
    .eq("need_id", needId)
    .neq("status", "cancelled");
  if (error) throw new Error(`No se pudieron leer los apoyos: ${error.message}`);
  return data.map((c) => ({ id: c.id, quantity: c.quantity, status: c.status, confirmedAt: c.confirmed_at }));
});

/**
 * Caso DEMO verificable para la portada: la necesidad pública de una escuela
 * DEMO con la confirmación de escuela más reciente. Se busca en los datos (no
 * se fija un id en el código); si no hay ninguna, devuelve null.
 */
export async function findDemoVerifiedCase(): Promise<{ needId: string; schoolName: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impact_feed")
    .select("need_id, school_name")
    .eq("event_type", "SCHOOL_CONFIRMED")
    .eq("submission_status", "submitted")
    .eq("school_is_demo", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la actividad: ${error.message}`);
  return data?.need_id && data.school_name ? { needId: data.need_id, schoolName: data.school_name } : null;
}
