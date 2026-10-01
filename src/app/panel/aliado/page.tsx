import Link from "next/link";

import { requireActor } from "@/lib/auth/session";

export default async function SupporterPanelPage() {
  await requireActor(["supporter"]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Panel del aliado</h1>
      <p className="text-sm text-muted-foreground">Rol: Aliado</p>
      <p className="max-w-2xl text-muted-foreground">
        El panel está preparado. Aquí podrás ver tus compromisos y reportar tus entregas; esas acciones se habilitarán en
        las siguientes fases. Mientras tanto, puedes{" "}
        <Link href="/#escuelas" className="font-medium text-primary underline-offset-4 hover:underline">
          explorar las escuelas y sus necesidades
        </Link>
        .
      </p>
    </section>
  );
}
