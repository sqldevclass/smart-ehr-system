import { Badge } from "@/components/ui/badge";
import { successBadgeClass } from "./successBadgeClass";

export const statusLabels: Record<string, string> = {
  pending_acceptance: "Ожидает приёма",
  accepted: "Принят",
  cancelled: "Отменено",
  rejected: "Отклонено — ожидает возврата",
  returned: "Возвращено",
};

export function TransferStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "accepted" ? "outline" : status === "rejected" ? "destructive" : status === "returned" ? "outline" : "secondary"} className={status === "accepted" ? successBadgeClass : undefined}>{statusLabels[status] || "—"}</Badge>;
}