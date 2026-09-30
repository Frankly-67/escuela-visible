import "server-only";

import { z } from "zod";

/**
 * Variables SOLO de servidor. Importar este módulo desde un componente cliente
 * rompe el build gracias a `server-only`.
 */

const supabaseServerSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY no está definida"),
});

// Operador (cuenta que paga y firma). No incluye el topic: se usa también
// antes de que el topic exista (chequeo de credenciales, creación del topic).
const hederaOperatorSchema = z.object({
  HEDERA_NETWORK: z.enum(["testnet", "mainnet", "previewnet"]).default("testnet"),
  HEDERA_OPERATOR_ID: z.string().regex(/^\d+\.\d+\.\d+$/, "HEDERA_OPERATOR_ID inválido"),
  HEDERA_OPERATOR_KEY: z.string().min(1, "HEDERA_OPERATOR_KEY no está definida"),
  HEDERA_OPERATOR_KEY_TYPE: z.enum(["ecdsa", "ed25519"]).default("ecdsa"),
  HEDERA_MIRROR_NODE_URL: z.url().default("https://testnet.mirrornode.hedera.com"),
});

const hederaSchema = hederaOperatorSchema.extend({
  HEDERA_TOPIC_ID: z.string().regex(/^\d+\.\d+\.\d+$/, "HEDERA_TOPIC_ID inválido"),
});

export type HederaOperatorEnv = z.infer<typeof hederaOperatorSchema>;
export type HederaEnv = z.infer<typeof hederaSchema>;

const demoSchema = z.object({
  DEMO_ACCOUNT_PASSWORD: z
    .string()
    .min(12, "DEMO_ACCOUNT_PASSWORD debe tener al menos 12 caracteres"),
});

// Se validan de forma perezosa para que el build no exija credenciales.
export function getSupabaseSecretKey(): string {
  return supabaseServerSchema.parse(process.env).SUPABASE_SECRET_KEY;
}

export function getHederaEnv(): HederaEnv {
  return hederaSchema.parse(process.env);
}

export function getHederaOperatorEnv(): HederaOperatorEnv {
  return hederaOperatorSchema.parse(process.env);
}

/** Solo para scripts DEMO. Nunca se usa en rutas de la app. */
export function getDemoAccountPassword(): string {
  return demoSchema.parse(process.env).DEMO_ACCOUNT_PASSWORD;
}

/**
 * Valida cada grupo de variables sin exponer valores: devuelve solo
 * qué variables faltan o tienen formato inválido.
 */
export function checkServerEnv() {
  const groups = {
    supabase: supabaseServerSchema,
    hedera: hederaSchema,
    demo: demoSchema,
  } as const;

  return Object.fromEntries(
    Object.entries(groups).map(([name, schema]) => {
      const result = schema.safeParse(process.env);
      return [
        name,
        result.success
          ? { ok: true as const, issues: [] }
          : {
              ok: false as const,
              issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
            },
      ];
    }),
  ) as Record<keyof typeof groups, { ok: boolean; issues: string[] }>;
}
