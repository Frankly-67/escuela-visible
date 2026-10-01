/** Distintivo de un caso real documentado fuera de la plataforma. Nunca se usa en escuelas DEMO. */
export function RealCaseBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-earth px-2.5 py-0.5 text-xs font-semibold tracking-wide text-earth-foreground ${className}`}
    >
      CASO REAL · DOCUMENTADO
    </span>
  );
}
