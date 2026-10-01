import Link from "next/link";

import { CommitmentCard } from "@/components/panel/commitment-card";
import { SummaryCards } from "@/components/panel/summary-cards";
import { requireActor } from "@/lib/auth/session";
import { getSupporterPanel } from "@/lib/data/panel";
import { COMMITMENT_STATUS_LABEL } from "@/lib/domain/labels";

export default async function SupporterPanelPage() {
  await requireActor(["supporter"]);
  // Los compromisos salen de la sesión (actor.id) dentro de getSupporterPanel(); nunca de la URL.
  const { commitments } = await getSupporterPanel();
  const count = (status: keyof typeof COMMITMENT_STATUS_LABEL) => commitments.filter((c) => c.status === status).length;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Panel del aliado</h1>
        <p className="max-w-2xl text-muted-foreground">
          Tus compromisos con las escuelas y cada paso registrado. Para apoyar una necesidad publicada, entra en su página y
          elige «Quiero apoyar». Cuando entregues, repórtalo aquí; la escuela confirmará la recepción.
        </p>
      </header>

      <SummaryCards
        label="Resumen de tus compromisos"
        items={[
          { label: COMMITMENT_STATUS_LABEL.committed, value: count("committed") },
          {
            label: COMMITMENT_STATUS_LABEL.delivery_reported,
            value: count("delivery_reported"),
            hint: "Esperando confirmación de la escuela",
          },
          { label: COMMITMENT_STATUS_LABEL.confirmed, value: count("confirmed") },
        ]}
      />

      <section aria-labelledby="compromisos" className="flex flex-col gap-4">
        <h2 id="compromisos" className="text-2xl font-semibold tracking-tight">
          Mis compromisos
        </h2>
        {commitments.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            <p>Todavía no tienes compromisos.</p>
            <Link href="/#escuelas" className="self-start font-medium text-primary underline-offset-4 hover:underline">
              Explorar escuelas
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {commitments.map((c) => (
              <CommitmentCard key={c.id} commitment={c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
