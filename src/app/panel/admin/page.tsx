import { requireActor } from "@/lib/auth/session";

export default async function AdminPanelPage() {
  await requireActor(["admin"]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Panel de administración</h1>
      <p className="text-sm text-muted-foreground">Rol: Escuela Visible / Administrador</p>
      <p className="max-w-2xl text-muted-foreground">
        El panel está preparado. Aquí podrás revisar las necesidades pendientes de validación y consultar el historial;
        esas acciones se habilitarán en las siguientes fases.
      </p>
    </section>
  );
}
