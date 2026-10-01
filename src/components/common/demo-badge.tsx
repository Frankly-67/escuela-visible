export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold tracking-wide text-accent-foreground ${className}`}
    >
      DEMO · ficticia
    </span>
  );
}
