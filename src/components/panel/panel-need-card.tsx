import Link from "next/link";

import { NeedProgressBars } from "@/components/needs/need-progress";
import { NeedStatusBadge } from "@/components/needs/need-status-badge";
import { CATEGORY_LABEL, formatDate, formatQuantity, NEED_KIND_LABEL, PRIORITY_LABEL } from "@/lib/domain/labels";
import type { NeedDTO } from "@/lib/domain/panel";
import { computeProgress } from "@/lib/domain/progress";

type Props = {
  need: NeedDTO;
  /** Progreso de la necesidad (panel Escuela). */
  progress?: { goal: number; committed: number; confirmed: number };
  /** Escuela (panel Admin). */
  school?: { name: string; slug: string } | null;
  /** Enlace principal de la tarjeta (historial o revisión). */
  action: { href: string; label: string };
};

/** Tarjeta de una necesidad en los paneles (DTO de B1, no PublicNeed). */
export function PanelNeedCard({ need, progress, school, action }: Props) {
  const dates = [
    { label: "Registrada", value: need.created_at },
    { label: "Validada", value: need.validated_at },
    { label: "Completada", value: need.completed_at },
  ];
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <NeedStatusBadge status={need.status} />
        <span className="text-xs text-muted-foreground">
          {CATEGORY_LABEL[need.category]} · {PRIORITY_LABEL[need.priority]}
          {need.kind === "campaign" ? ` · ${NEED_KIND_LABEL.campaign}` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {school && <p className="text-sm text-muted-foreground">{school.name}</p>}
        <h3 className="text-lg leading-snug font-semibold">{need.title}</h3>
        <p className="text-sm text-muted-foreground">
          Meta: <span className="font-medium text-foreground">{formatQuantity(need.goal_quantity, need.goal_unit)}</span>
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        {dates.map((d) => (
          <div key={d.label} className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">{d.label}</dt>
            <dd className="font-medium">{d.value ? formatDate(d.value) : "—"}</dd>
          </div>
        ))}
      </dl>
      {progress && (
        <NeedProgressBars
          progress={computeProgress(progress.goal, progress.committed, progress.confirmed)}
          unit={need.goal_unit}
          compact
        />
      )}
      <Link href={action.href} className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
        {action.label}
      </Link>
    </article>
  );
}
