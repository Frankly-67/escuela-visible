import Link from "next/link";

import type { PublicNeed } from "@/lib/data/public";
import { CATEGORY_LABEL, formatQuantity, NEED_KIND_LABEL, PRIORITY_LABEL } from "@/lib/domain/labels";

import { NeedProgressBars } from "./need-progress";
import { NeedStatusBadge } from "./need-status-badge";

export function NeedCard({ need }: { need: PublicNeed }) {
  return (
    <article className="group relative flex flex-col gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
      <div className="flex flex-wrap items-center gap-2">
        <NeedStatusBadge status={need.status} />
        <span className="text-xs text-muted-foreground">
          {CATEGORY_LABEL[need.category]} · {PRIORITY_LABEL[need.priority]}
          {need.kind === "campaign" ? ` · ${NEED_KIND_LABEL.campaign}` : ""}
        </span>
      </div>
      <div>
        <h3 className="text-xl leading-snug font-semibold">
          <Link
            href={`/necesidades/${need.id}`}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none group-has-[:focus-visible]:underline"
          >
            {need.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta: <span className="font-medium text-foreground">{formatQuantity(need.goal_quantity, need.goal_unit)}</span>
        </p>
      </div>
      <NeedProgressBars progress={need.progress} unit={need.goal_unit} compact />
    </article>
  );
}
