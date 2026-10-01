import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getSessionActor } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false },
};

export default async function SignInPage() {
  // Con sesión válida no tiene sentido volver a ingresar.
  if (await getSessionActor()) redirect("/panel");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-16 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Ingresar</h1>
        <p className="text-muted-foreground">
          Acceso para escuelas, aliados y el equipo de Escuela Visible. El registro público no está habilitado.
        </p>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <LoginForm />
      </div>
    </div>
  );
}
