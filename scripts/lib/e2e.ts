/**
 * Utilidades compartidas por los scripts E2E (solo lectura salvo que el
 * script llame explícitamente a una función del flujo).
 */
import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { getHederaEnv } from "@/lib/env.server";
import { getTopicMessage, listTopicMessages } from "@/lib/hedera/mirror";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { fromEventRow, verifyEvent, type VerificationResult } from "@/lib/verify/verify-event";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function findUserIdByEmail(email: string): Promise<string> {
  const { data, error } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`No existe la cuenta ${email} (ejecutar npm run demo:accounts)`);
  return user.id;
}

/** Verifica un evento contra el Mirror Node; con `wait`, espera la indexación (~30 s). */
export async function verifyStoredEvent(eventId: string, wait = false): Promise<VerificationResult> {
  const env = getHederaEnv();
  const db = createAdminClient();
  let result: VerificationResult | null = null;
  for (let i = 0; i < (wait ? 15 : 1); i++) {
    const { data: row, error } = await db.from("hedera_events").select("*").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    const local = fromEventRow(row);
    const mirror =
      local.topicId && local.sequenceNumber !== null
        ? await getTopicMessage({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: local.topicId, sequenceNumber: local.sequenceNumber })
        : null;
    result = verifyEvent(local, mirror, { expectedTopicId: env.HEDERA_TOPIC_ID, operatorAccountId: env.HEDERA_OPERATOR_ID });
    if (result.status !== "AWAITING_MIRROR") break;
    await sleep(2000);
  }
  return result!;
}

export async function topicMessageCount(): Promise<number | string> {
  const env = getHederaEnv();
  const r = await listTopicMessages({ mirrorUrl: env.HEDERA_MIRROR_NODE_URL, topicId: env.HEDERA_TOPIC_ID });
  return r.kind === "found" ? r.data.length : r.kind;
}

/** Cliente anónimo (publishable key, sin sesión): ve lo mismo que el público bajo RLS. */
export function anonClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false },
  });
}

export function printChecks(result: VerificationResult, indent = "   ") {
  for (const c of result.checks) {
    const mark = c.outcome === "pass" ? "✓" : c.outcome === "fail" ? "✗" : "·";
    console.log(`${indent}${mark} ${String(c.step).padStart(2)}. ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  }
}
