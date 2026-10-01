import { formatDateTime } from "@/lib/domain/labels";
import { statusText } from "@/lib/domain/verification-text";
import type { VerificationStatus as Status } from "@/lib/verify/verify-event";
import type { Enums } from "@/types/database";

const TONE = {
  ok: { box: "border-primary/40 bg-primary/5", icon: "bg-primary text-primary-foreground", path: "m5 12 5 5 9-10" },
  neutral: { box: "border-border bg-muted/50", icon: "bg-secondary text-secondary-foreground", path: "M12 7v6m0 4h.01" },
  warning: { box: "border-earth/40 bg-accent/60", icon: "bg-earth text-earth-foreground", path: "M12 7v6m0 4h.01" },
  error: { box: "border-destructive/40 bg-destructive/5", icon: "bg-destructive text-white", path: "M7 7l10 10M17 7 7 17" },
} as const;

/** Resultado de la comprobación EN VIVO, con texto aprobado según el estado. */
export function VerificationStatus({
  status,
  eventType,
  checkedAt,
}: {
  status: Status;
  eventType: Enums<"hedera_event_type">;
  checkedAt: string;
}) {
  const text = statusText(status, eventType);
  const tone = TONE[text.tone];
  return (
    <section aria-labelledby="estado-verificacion" aria-live="polite" className={`flex gap-4 rounded-xl border-2 p-5 ${tone.box}`}>
      <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${tone.icon}`}>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d={tone.path} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <h2 id="estado-verificacion" className="font-sans text-xl font-semibold">
          {text.title}
        </h2>
        <p>{text.body}</p>
        <p className="text-xs text-muted-foreground">Comprobado en este momento ({formatDateTime(checkedAt)}).</p>
      </div>
    </section>
  );
}
