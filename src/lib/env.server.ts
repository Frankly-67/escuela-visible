import "server-only";

import { z } from "zod";

/**
 * Variables SOLO de servidor. Importar este módulo desde un componente cliente
 * rompe el build gracias a `server-only`.
 */

const supabaseServerSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY no está definida"),
});

const hederaSchema = z.object({
  HEDERA_NETWORK: z.enum(["testnet", "mainnet", "previewnet"]).default("testnet"),
  HEDERA_OPERATOR_ID: z.string().regex(/^\d+\.\d+\.\d+$/, "HEDERA_OPERATOR_ID inválido"),
  HEDERA_OPERATOR_KEY: z.string().min(1, "HEDERA_OPERATOR_KEY no está definida"),
  HEDERA_OPERATOR_KEY_TYPE: z.enum(["ecdsa", "ed25519"]).default("ecdsa"),
  HEDERA_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/, "HEDERA_TOPIC_ID inválido"),
  HEDERA_MIRROR_NODE_URL: z.url().default("https://testnet.mirrornode.hedera.com"),
});

export type HederaEnv = z.infer<typeof hederaSchema>;

// Se validan de forma perezosa para que el build no exija credenciales.
export function getSupabaseSecretKey(): string {
  return supabaseServerSchema.parse(process.env).SUPABASE_SECRET_KEY;
}

export function getHederaEnv(): HederaEnv {
  return hederaSchema.parse(process.env);
}
