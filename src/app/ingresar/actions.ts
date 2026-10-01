"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});

/**
 * Inicio de sesión con correo y contraseña (Supabase Auth). Las cookies de
 * sesión las escribe @supabase/ssr. El rol NO se decide aquí: /panel lo lee
 * de la sesión y de `profiles`.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = credentialsSchema.safeParse({ email, password: String(formData.get("password") ?? "") });
  if (!parsed.success) {
    return { error: "Escribe un correo válido y tu contraseña.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    return { error: "Correo o contraseña incorrectos.", email };
  }

  redirect("/panel");
}

/** Cierra la sesión en Supabase y borra las cookies. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
