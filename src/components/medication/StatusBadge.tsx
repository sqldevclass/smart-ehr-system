import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  preliminary: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  ready_for_execution: "bg-green-100 text-green-700",
  completed: "bg-green-700 text-white",
  cancelled: "bg-gray-100 text-gray-500",
  return: "bg-orange-100 text-orange-700",
  returned_accepted: "bg-gray-200 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  preliminary: "Предварительное",
  in_progress: "В процессе",
  ready_for_execution: "Готов к исполнению",
  completed: "Выполнен",
  cancelled: "Отменён",
  return: "Возврат",
  returned_accepted: "Обратно принято",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
