import { NEED_STATUS_LABEL } from "@/lib/domain/labels";
import type { Enums } from "@/types/database";

const STYLE: Record<Enums<"need_status">, string> = {
  pending_validation: "bg-secondary text-secondary-foreground",
  published: "bg-primary/10 text-primary",
  completed: "bg-primary text-primary-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function NeedStatusBadge({ status }: { status: Enums<"need_status"> }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      {NEED_STATUS_LABEL[status]}
    </span>
  );
}
