import "server-only";

import { randomUUID } from "node:crypto";

import { authorizeCreatePost, authorizeReviewPost } from "@/lib/domain/board";
import type { Actor } from "@/lib/domain/permissions";
import { FlowError, flowErrorFromRpc } from "@/lib/flow/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

import { createBoardPostInputSchema, type CreateBoardPostInput } from "./schemas";

type CreatePostArgs = Database["public"]["Functions"]["board_create_post"]["Args"];
type ReviewPostArgs = Database["public"]["Functions"]["board_publish_post"]["Args"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/*
 * Escrituras del tablón (mismo patrón que las necesidades):
 *  1. validan datos y permiso aquí (mensajes claros para la interfaz);
 *  2. llaman a una RPC board_* (solo service_role) que, en una transacción,
 *     vuelve a validar actor, rol, escuela, estado y privacidad.
 * No generan eventos ni publican en Hedera.
 */

/** La escuela envía una publicación: queda pendiente de revisión. */
export async function createPost(actor: Actor, input: CreateBoardPostInput) {
  const parsed = createBoardPostInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new FlowError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(". "));
  }
  const data = parsed.data;

  const decision = authorizeCreatePost(actor, { schoolId: data.schoolId });
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const postId = randomUUID();
  const args = {
    p_actor_id: actor.id,
    p_post_id: postId,
    p_school_id: data.schoolId,
    p_kind: data.kind,
    p_title: data.title,
    p_body: data.body,
    // Los tipos generados marcan todos los argumentos como no nulos; la
    // función acepta null en p_event_date (publicaciones sin fecha).
    p_event_date: data.eventDate as string,
  } satisfies CreatePostArgs;

  const { error } = await createAdminClient().rpc("board_create_post", args);
  if (error) throw flowErrorFromRpc(error);

  return { postId };
}

/**
 * Revisión del admin: pending_review → published (pública) o → rejected.
 * El estado se lee de la base, no del formulario.
 */
async function reviewPost(actor: Actor, postId: string, to: "published" | "rejected") {
  if (!UUID.test(postId)) throw new FlowError("INVALID_INPUT", "Identificador de publicación inválido.");

  const db = createAdminClient();
  const { data: post, error: readError } = await db
    .from("board_posts")
    .select("id, status")
    .eq("id", postId)
    .maybeSingle();
  if (readError) throw new Error(`No se pudo leer la publicación: ${readError.message}`);
  if (!post) throw new FlowError("NOT_FOUND", "La publicación no existe.");

  const decision = authorizeReviewPost(actor, post, to);
  if (!decision.ok) throw new FlowError(decision.code, decision.message);

  const args = { p_actor_id: actor.id, p_post_id: post.id } satisfies ReviewPostArgs;
  const { error } = await db.rpc(to === "published" ? "board_publish_post" : "board_reject_post", args);
  if (error) throw flowErrorFromRpc(error);

  return { postId: post.id };
}

export const publishPost = (actor: Actor, postId: string) => reviewPost(actor, postId, "published");
export const rejectPost = (actor: Actor, postId: string) => reviewPost(actor, postId, "rejected");
