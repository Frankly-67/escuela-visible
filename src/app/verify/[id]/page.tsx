import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoBadge } from "@/components/common/demo-badge";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { HederaRecordDetails } from "@/components/verify/hedera-record-details";
import { VerificationChecks } from "@/components/verify/verification-checks";
import { VerificationStatus } from "@/components/verify/verification-status";
import { getNeed, listNeedCommitments } from "@/lib/data/public";
import { verifyEventLive } from "@/lib/data/verification";
import { EVENT_LABEL, formatDateTime } from "@/lib/domain/labels";
import { buildTimeline } from "@/lib/domain/timeline";
import { VERIFICATION_MEANING } from "@/lib/domain/verification-text";

export const metadata: Metadata = {
  title: "Verificación del registro",
  description: "Comprobación en vivo de un paso registrado por Escuela Visible contra el registro publicado en Hedera.",
};

/**
 * Verificación pública EN VIVO: cada visita consulta Hedera (Mirror Node) en
 * el momento. El resultado nunca se toma de lo guardado en Supabase.
 */
export default async function VerifyPage(props: PageProps<"/verify/[id]">) {
  const { id } = await props.params;
  const verification = await verifyEventLive(id);
  if (!verification) notFound();
  const { event, result, checkedAt, network } = verification;

  const needResult = await getNeed(event.needId);
  if (!needResult) notFound();
  const { need, school } = needResult;

  const commitments = await listNeedCommitments(need.id);
  const [step] = buildTimeline(
    [
      {
        id: event.id,
        eventType: event.eventType,
        commitmentId: event.commitmentId,
        actorRole: event.actorRole,
        sequenceNumber: event.sequenceNumber,
        createdAt: event.createdAt,
        submissionStatus: event.submissionStatus,
      },
    ],
    commitments,
    need.goal_unit,
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
      <Breadcrumbs
        items={[
          { label: "Inicio", href: "/" },
          { label: school.name, href: `/escuelas/${school.slug}` },
          { label: need.title, href: `/necesidades/${need.id}` },
          { label: "Verificación" },
        ]}
      />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {step.registryNumber !== null ? `Registro n.º ${step.registryNumber} en Hedera` : "Pendiente de publicación en Hedera"}
          </span>
          {school.is_demo && <DemoBadge />}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{EVENT_LABEL[event.eventType]}</h1>
        <p className="text-lg">{step.description}</p>
        <p className="text-sm text-muted-foreground">
          {step.actor} · registrado en Escuela Visible el {formatDateTime(event.createdAt)} ·{" "}
          <Link href={`/necesidades/${need.id}`} className="font-medium text-foreground hover:underline">
            {need.title}
          </Link>{" "}
          · {school.name}
        </p>
      </header>

      <VerificationStatus status={result.status} eventType={event.eventType} checkedAt={checkedAt} />

      <section aria-labelledby="significado" className="grid gap-4 sm:grid-cols-2">
        <h2 id="significado" className="sr-only">
          Qué significa esta verificación
        </h2>
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-5 text-sm">
          <p className="font-semibold">Qué significa</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {VERIFICATION_MEANING.means.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-5 text-sm">
          <p className="font-semibold">Qué no significa</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
            {VERIFICATION_MEANING.doesNotMean.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <VerificationChecks checks={result.checks} />

      <HederaRecordDetails
        network={network}
        topicId={result.remote?.topicId ?? event.topicId}
        sequenceNumber={result.remote?.sequenceNumber ?? event.sequenceNumber}
        consensusTimestamp={result.remote?.consensusTimestamp ?? event.consensusTimestamp}
        transactionId={event.transactionId}
        storedHash={event.payloadHash}
        publishedHash={result.remote?.hash ?? null}
        payloadCanonical={event.payloadCanonical}
      />

      <p>
        <Link href={`/necesidades/${need.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          ← Volver a la necesidad
        </Link>
      </p>
    </div>
  );
}
