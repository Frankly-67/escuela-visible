import Link from "next/link";

import { DemoBadge } from "@/components/common/demo-badge";
import { NeedProgressBars } from "@/components/needs/need-progress";
import { COMMITMENT_STATUS_LABEL, formatDate, formatQuantity } from "@/lib/domain/labels";
import type { SupporterCommitmentDTO } from "@/lib/domain/panel";
import { computeProgress } from "@/lib/domain/progress";

import { EventLinks } from "./event-links";

const STATUS_STYLE: Record<keyof typeof COMMITMENT_STATUS_LABEL, string> = {
  committed: "bg-secondary text-secondary-foreground",
  delivery_reported: "bg-primary/10 text-primary",
  confirmed: "bg-primary text-primary-foreground",
};

/** Un compromiso del aliado en sesión (DTO de B1). Solo lectura. */
export function CommitmentCard({ commitment }: { commitment: SupporterCommitmentDTO }) {
  const { need, school, progress } = commitment;
  const status = commitment.status === "cancelled" ? null : commitment.status;
  const unit = need?.goalUnit ?? "";
  const dates = [
    { label: "Comprometido", value: commitment.createdAt },
    { label: "Entrega reportada", value: commitment.deliveryReportedAt },
    { label: "Recepción confirmada", value: commitment.confirmedAt },
  ];

  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        {status && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
            {COMMITMENT_STATUS_LABEL[status]}
          </span>
        )}
        {status === "delivery_reported" && (
          <span className="text-xs text-muted-foreground">Esperando confirmación de la escuela</span>
        )}
      </div>

      {need && school ? (
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link href={`/escuelas/${school.slug}`} className="font-medium text-foreground hover:underline">
              {school.name}
            </Link>
            {school.isDemo && <DemoBadge />}
            <span>· {school.municipality}</span>
          </p>
          <h3 className="text-lg leading-snug font-semibold">
            <Link href={`/necesidades/${need.id}`} className="hover:underline">
              {need.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">
            Tu apoyo: <span className="font-medium text-foreground">{formatQuantity(commitment.quantity, unit)}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">La necesidad ya no está disponible públicamente.</p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-xs">
        {dates.map((d) => (
          <div key={d.label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd className="font-medium">{d.value ? formatDate(d.value) : "—"}</dd>
          </div>
        ))}
      </dl>

      {need && progress && (
        <NeedProgressBars progress={computeProgress(progress.goal, progress.committed, progress.confirmed)} unit={unit} compact />
      )}

      <section className="flex flex-col gap-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Pasos registrados</h4>
        <EventLinks events={commitment.events} />
      </section>
    </article>
  );
}
