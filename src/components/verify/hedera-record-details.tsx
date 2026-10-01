import { formatDateTime } from "@/lib/domain/labels";
import { hederaTimestampToIso } from "@/lib/domain/timeline";
import { hashscanTopicUrl, hashscanTransactionUrl, type HederaNetwork } from "@/lib/hedera/links";

/**
 * Datos técnicos del registro en Hedera. Todo es información pública de la
 * red (topic, posición, marca de consenso, transacción, hash) y el contenido
 * publicado, que solo tiene identificadores, tipo, rol y fecha.
 */
export function HederaRecordDetails({
  network,
  topicId,
  sequenceNumber,
  consensusTimestamp,
  transactionId,
  storedHash,
  publishedHash,
  payloadCanonical,
}: {
  network: HederaNetwork;
  topicId: string | null;
  sequenceNumber: number | null;
  consensusTimestamp: string | null;
  transactionId: string | null;
  storedHash: string;
  publishedHash: string | null;
  payloadCanonical: string;
}) {
  const external = { target: "_blank", rel: "noopener noreferrer" } as const;
  let pretty = payloadCanonical;
  try {
    pretty = JSON.stringify(JSON.parse(payloadCanonical), null, 2);
  } catch {
    // Se muestra tal cual si no es JSON.
  }

  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold">
        Detalles técnicos
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-5 border-t px-5 py-4 text-sm">
        <dl className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Row label="Red" value={`Hedera ${network}`} />
          <Row label="Topic" value={topicId ?? "—"} mono />
          <Row label="Número de registro" value={sequenceNumber !== null ? String(sequenceNumber) : "—"} />
          <Row
            label="Publicado en Hedera el"
            value={consensusTimestamp ? `${formatDateTime(hederaTimestampToIso(consensusTimestamp))} (${consensusTimestamp})` : "—"}
          />
          <Row label="ID de transacción" value={transactionId ?? "—"} mono />
          <Row label="Hash guardado (SHA-256)" value={storedHash} mono />
          <Row label="Hash publicado en Hedera" value={publishedHash ?? "—"} mono />
        </dl>

        <div className="flex flex-col gap-2">
          <p className="font-medium">Contenido publicado</p>
          <p className="text-xs text-muted-foreground">
            Solo identificadores, tipo de paso, rol y fecha. Sin nombres, notas ni datos personales.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">{pretty}</pre>
        </div>

        {topicId && (
          <div className="flex flex-col gap-1">
            <p className="font-medium">Consultar en un explorador independiente</p>
            <a href={hashscanTopicUrl(network, topicId)} {...external} className="text-primary underline-offset-4 hover:underline">
              Ver el topic de Escuela Visible en HashScan (se abre en otra pestaña)
            </a>
            {consensusTimestamp && (
              <a
                href={hashscanTransactionUrl(network, consensusTimestamp)}
                {...external}
                className="text-primary underline-offset-4 hover:underline"
              >
                Ver esta transacción en HashScan (se abre en otra pestaña)
              </a>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all ${mono ? "font-mono text-xs leading-5" : ""}`}>{value}</dd>
    </>
  );
}
