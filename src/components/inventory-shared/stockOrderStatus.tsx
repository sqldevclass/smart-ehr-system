import { Badge, type BadgeProps } from "@/components/ui/badge";
import { format } from "date-fns";

export const stockOrderStatuses = {
  pending: { label: "Новый", variant: "secondary" },
  in_transit: { label: "Выдан · в пути", variant: "default" },
  received: { label: "Принят", variant: "outline", className: "border-status-normal text-status-normal" },
  refused: { label: "Отклонён отделением", variant: "destructive" },
  returned: { label: "Возвращён на склад", variant: "secondary" },
  rejected: { label: "Отклонён", variant: "destructive" },
  cancelled: { label: "Отменён", variant: "outline" },
  transfer_cancelled: { label: "Перемещение отменено", variant: "outline" },
} satisfies Record<string, { label: string; variant: BadgeProps["variant"]; className?: string }>;

export type EffectiveStockOrderStatus = keyof typeof stockOrderStatuses;
export interface StockOrderLine {
  id: string;
  status: "pending" | "released" | "rejected" | "cancelled";
  quantity_units: number | string;
  reject_reason?: string | null;
  released_at?: string | null;
  rejected_at?: string | null;
  transfer_id?: string | null;
  transfer?: { status: string } | null;
  products?: { name: string } | null;
  drug_formulary?: { trade_name: string } | null;
  stock_orders: {
    id: string; ordered_at: string; from_warehouse_id: string; to_warehouse_id: string;
    from_warehouse?: { name: string } | null;
    to_warehouse?: { name: string; departments?: { name: string } | null } | null;
    ordered_by_profile?: { full_name: string } | null;
  };
}

export function effectiveStatus(line: StockOrderLine): EffectiveStockOrderStatus {
  if (line.status !== "released") return line.status;
  switch (line.transfer?.status) {
    case "accepted": return "received";
    case "rejected": return "refused";
    case "returned": return "returned";
    case "cancelled": return "transfer_cancelled";
    default: return "in_transit";
  }
}

export function StockOrderStatusBadge({ status }: { status: EffectiveStockOrderStatus }) {
  const config: { label: string; variant: BadgeProps["variant"]; className?: string } = stockOrderStatuses[status];
  return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
}

export const STOCK_ORDER_LINE_SELECT = `id, status, quantity_units, reject_reason, released_at, rejected_at, transfer_id,
  transfer:transfer_records(status), products(name), drug_formulary(trade_name),
  stock_orders!inner(id, ordered_at, from_warehouse_id, to_warehouse_id,
    from_warehouse:warehouses!stock_orders_from_warehouse_id_fkey(name),
    to_warehouse:warehouses!stock_orders_to_warehouse_id_fkey(name, departments(name)),
    ordered_by_profile:profiles!stock_orders_ordered_by_fkey(full_name))`;

export function lineItemName(line: StockOrderLine) {
  return line.drug_formulary?.trade_name || line.products?.name || "—";
}

export const fmtOrderDate = (v?: string | null) => (v ? format(new Date(v), "dd.MM.yyyy HH:mm") : "—");
