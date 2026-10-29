import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export const stockOrderStatusLabels: Record<string, string> = {
  pending: "Новый",
  released: "Выдан",
  rejected: "Отклонён",
  cancelled: "Отменён",
};

export function StockOrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "released" ? "default" : status === "rejected" ? "destructive" : status === "cancelled" ? "outline" : "secondary"}>{stockOrderStatusLabels[status] || "—"}</Badge>;
}

export const STOCK_ORDER_SELECT = `id, status, from_warehouse_id, to_warehouse_id, ordered_at, released_at, rejected_at, reject_reason, cancelled_at, notes, transfer_id,
  from_warehouse:warehouses!stock_orders_from_warehouse_id_fkey(name),
  to_warehouse:warehouses!stock_orders_to_warehouse_id_fkey(name, departments(name)),
  ordered_by_profile:profiles!stock_orders_ordered_by_fkey(full_name),
  stock_order_items(id, quantity_units, products(name), drug_formulary(trade_name))`;

export function StockOrderItemsCell({ order }: { order: any }) {
  return <div className="space-y-0.5">{(order.stock_order_items || []).map((i: any) => (
    <div key={i.id} className="whitespace-nowrap">{i.drug_formulary?.trade_name || i.products?.name || "—"} × {Number(i.quantity_units)}</div>
  ))}</div>;
}

export const fmtOrderDate = (v?: string | null) => (v ? format(new Date(v), "dd.MM.yyyy HH:mm") : "—");
