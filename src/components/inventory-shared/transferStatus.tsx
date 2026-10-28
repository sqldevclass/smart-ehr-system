import { Badge } from "@/components/ui/badge";

export const statusLabels: Record<string, string> = {
  pending_acceptance: "Ожидает приёма",
  accepted: "Принято",
  cancelled: "Отменено",
  rejected: "Отклонено — ожидает возврата",
  returned: "Возвращено",
};

export function TransferStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "accepted" ? "default" : status === "rejected" ? "destructive" : status === "returned" ? "outline" : "secondary"}>{statusLabels[status] || "—"}</Badge>;
}