import { cn } from "@/lib/utils";
import { formatDateRu, noticeState } from "@/lib/equipmentDates";

interface Props { date: string | null | undefined; noticeDays: number | null | undefined; overdueLabel?: string }

export function NoticeDateCell({ date, noticeDays, overdueLabel = "просрочено" }: Props) {
  const state = noticeState(date, noticeDays);
  return (
    <span className={cn(state === "soon" && "text-orange-600 font-medium", state === "overdue" && "text-destructive font-medium")}>
      {formatDateRu(date)}
      {state === "overdue" && <span className="ml-1 text-xs">({overdueLabel})</span>}
    </span>
  );
}
