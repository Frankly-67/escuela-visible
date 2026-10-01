import "server-only";

import { requireActor } from "@/lib/auth/session";
import type { BoardPostKind, BoardPostStatus } from "@/lib/domain/board";
import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas del tablón (solo lectura).
 *
 * - Siempre con el cliente de la sesión (publishable key): RLS decide qué se
 *   ve (el público, solo lo publicado) y los permisos de columnas ocultan
 *   created_by y reviewed_by. Nunca la secret key.
 * - Columnas explícitas y DTOs con lista blanca: sin ids de escuelas ni de
 *   personas.
 * - Si la tabla aún no existe (migración no aplicada en ese entorno),
 *   devuelven { available: false } en lugar de romper la página.
 */

export type BoardSchoolDTO = { name: string; slug: string; municipality: string; department: string; isDemo: boolean };

export type PublicPostDTO = {
  id: string;
  kind: BoardPostKind;
  title: string;
  body: string;
  eventDate: string | null;
  publishedAt: string | null;
  school: BoardSchoolDTO | null;
};

export type SchoolPostDTO = Omit<PublicPostDTO, "school"> & { status: BoardPostStatus; createdAt: string };
export type PendingPostDTO = Omit<PublicPostDTO, "publishedAt"> & { createdAt: string };

export type BoardResult<T> = { available: true; posts: T[] } | { available: false };

const PUBLIC_LIMIT = 100;
const POST_FIELDS = "id, kind, title, body, event_date, status, published_at, created_at";
const WITH_SCHOOL = `${POST_FIELDS}, school:schools(name, slug, municipality, department, is_demo)`;

type PostRow = {
  id: string;
  kind: BoardPostKind;
  title: string;
  body: string;
  event_date: string | null;
  status: BoardPostStatus;
  published_at: string | null;
  created_at: string;
};
type SchoolRow = { name: string; slug: string; municipality: string; department: string; is_demo: boolean } | null;

/** Tabla inexistente (PostgREST: PGRST205; Postgres: 42P01). */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

const toSchool = (s: SchoolRow): BoardSchoolDTO | null =>
  s ? { name: s.name, slug: s.slug, municipality: s.municipality, department: s.department, isDemo: s.is_demo } : null;

export const toPublicPostDTO = (row: PostRow & { school: SchoolRow }): PublicPostDTO => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  body: row.body,
  eventDate: row.event_date,
  publishedAt: row.published_at,
  school: toSchool(row.school),
});

// --- PÚBLICO -------------------------------------------------------------------

/** Publicaciones aprobadas, las más recientes primero; opcionalmente de un tipo. */
export async function listPublishedPosts(kind: BoardPostKind | null): Promise<BoardResult<PublicPostDTO>> {
  const supabase = await createClient();
  let query = supabase.from("board_posts").select(WITH_SCHOOL).eq("status", "published");
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("published_at", { ascending: false }).limit(PUBLIC_LIMIT);
  if (isMissingTable(error)) return { available: false };
  if (error) throw new Error(`No se pudo leer el tablón: ${error.message}`);
  return { available: true, posts: (data as (PostRow & { school: SchoolRow })[]).map(toPublicPostDTO) };
}

/** Publicaciones aprobadas de una escuela (página pública de la escuela). */
export async function listSchoolPublishedPosts(schoolId: string): Promise<BoardResult<PublicPostDTO>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select(WITH_SCHOOL)
    .eq("school_id", schoolId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(PUBLIC_LIMIT);
  if (isMissingTable(error)) return { available: false };
  if (error) throw new Error(`No se pudieron leer las publicaciones: ${error.message}`);
  return { available: true, posts: (data as (PostRow & { school: SchoolRow })[]).map(toPublicPostDTO) };
}

// --- PANELES -------------------------------------------------------------------

/** Publicaciones de la escuela del representante en sesión (todas sus estados). */
export async function getSchoolPosts(): Promise<BoardResult<SchoolPostDTO>> {
  const actor = await requireActor(["school_rep"]);
  if (!actor.schoolId) return { available: true, posts: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select(POST_FIELDS)
    .eq("school_id", actor.schoolId)
    .order("created_at", { ascending: false });
  if (isMissingTable(error)) return { available: false };
  if (error) throw new Error(`No se pudieron leer las publicaciones: ${error.message}`);
  return {
    available: true,
    posts: (data as PostRow[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      eventDate: r.event_date,
      publishedAt: r.published_at,
      status: r.status,
      createdAt: r.created_at,
    })),
  };
}

/** Publicaciones pendientes de revisión (admin), las más antiguas primero. */
export async function getPendingPosts(): Promise<BoardResult<PendingPostDTO>> {
  await requireActor(["admin"]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_posts")
    .select(WITH_SCHOOL)
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });
  if (isMissingTable(error)) return { available: false };
  if (error) throw new Error(`No se pudieron leer las publicaciones: ${error.message}`);
  return {
    available: true,
    posts: (data as (PostRow & { school: SchoolRow })[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      eventDate: r.event_date,
      createdAt: r.created_at,
      school: toSchool(r.school),
    })),
  };
}
