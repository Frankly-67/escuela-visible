import type { VerificationCheck } from "@/lib/verify/verify-event";

const MARK = {
  pass: { symbol: "✓", label: "correcta", className: "text-primary" },
  fail: { symbol: "✗", label: "falló", className: "text-destructive" },
  skipped: { symbol: "·", label: "no aplicable", className: "text-muted-foreground" },
} as const;

/** Las 13 comprobaciones de verifyEvent, con sus textos públicos. */
export function VerificationChecks({ checks }: { checks: VerificationCheck[] }) {
  const passed = checks.filter((c) => c.outcome === "pass").length;
  const failed = checks.some((c) => c.outcome === "fail");
  return (
    <details className="group rounded-xl border bg-card" open={failed}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 font-semibold">
        <span>
          Comprobaciones realizadas{" "}
          <span className="font-normal text-muted-foreground">
            ({passed} de {checks.length} correctas)
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ol className="flex flex-col gap-2 border-t px-5 py-4 text-sm">
        {checks.map((check) => {
          const mark = MARK[check.outcome];
          return (
            <li key={check.step} className="flex gap-3">
              <span aria-hidden className={`w-4 shrink-0 text-center font-semibold ${mark.className}`}>
                {mark.symbol}
              </span>
              <span>
                <span className="sr-only">{mark.label}: </span>
                {check.label}
                {check.detail && <span className="block text-xs text-muted-foreground">{check.detail}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
