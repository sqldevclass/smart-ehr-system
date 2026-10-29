import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TableCell, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { PeriodFilter, rangeBounds } from "@/components/shared/PeriodFilter";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { ScreenHeader } from "./ScreenHeader";
import { useMyWarehouse } from "./useMyWarehouse";
import { STOCK_ORDER_LINE_SELECT, effectiveStatus, lineItemName, StockOrderStatusBadge, fmtOrderDate, type StockOrderLine } from "./stockOrderStatus";
import { PulseDot } from "@/components/shared/PulseDot";
import { usePendingStockOrderCount } from "./usePendingStockOrderCount";

const sb = supabase as any;

interface Props { warehouseTypeCode: "central_pharmacy" | "general"; title: string; embedded?: boolean }

export default function StockOrdersView({ warehouseTypeCode, title, embedded }: Props) {
  const qc = useQueryClient();
  const { data: warehouse, isLoading: whLoading } = useMyWarehouse(warehouseTypeCode);
  const [tab, setTab] = useState<"new" | "history">("new");
  const [newPeriod, setNewPeriod] = usePeriodFilter(true);
  const [historyPeriod, setHistoryPeriod] = usePeriodFilter(true);
  const period = tab === "new" ? newPeriod : historyPeriod;
  const setPeriod = tab === "new" ? setNewPeriod : setHistoryPeriod;
  const pendingCount = usePendingStockOrderCount(warehouseTypeCode);
  const bounds = rangeBounds(period);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectOrder, setRejectOrder] = useState<StockOrderLine | null>(null);
  const [reason, setReason] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["stock-orders", warehouse?.id, tab, bounds.from, bounds.to],
    enabled: !!warehouse?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!warehouse) return [];
      let q = sb.from("stock_order_items").select(STOCK_ORDER_LINE_SELECT).eq("stock_orders.from_warehouse_id", warehouse.id);
      q = tab === "new" ? q.eq("status", "pending") : q.neq("status", "pending");
      if (bounds.from) q = q.gte("stock_orders.ordered_at", bounds.from);
      if (bounds.to) q = q.lte("stock_orders.ordered_at", bounds.to);
      const { data, error } = await q.limit(500);
      if (error) { toast.error(error.message); throw error; }
      return ((data || []) as StockOrderLine[]).sort((a, b) => b.stock_orders.ordered_at.localeCompare(a.stock_orders.ordered_at));
    },
  });

  const refresh = () => {
    const id = warehouse?.id;
    qc.invalidateQueries({ queryKey: ["stock-orders"] });
    qc.invalidateQueries({ queryKey: ["stock-orders-pending-count"] });
    qc.invalidateQueries({ queryKey: ["nurse-stock-orders"] });
    for (const key of ["stock", "transfers", "my-batches"]) qc.invalidateQueries({ queryKey: [key, id] });
    qc.invalidateQueries({ queryKey: ["nurse-inv-transfers"] });
  };

  const release = async (line: StockOrderLine) => {
    setBusyId(line.id);
    try {
      const { error } = await sb.rpc("release_stock_order_item", { p_item_id: line.id });
      if (error) throw error;
      toast.success("Выдано — перемещение отправлено");
      refresh();
    } catch (error: any) { toast.error(error.message || "Не удалось выдать позицию"); }
    finally { setBusyId((id) => id === line.id ? null : id); }
  };

  const reject = async () => {
    if (!rejectOrder || !reason.trim()) return;
    const line = rejectOrder;
    setBusyId(line.id);
    try {
      const { error } = await sb.rpc("reject_stock_order_item", { p_item_id: line.id, p_reason: reason.trim() });
      if (error) throw error;
      toast.success("Позиция отклонена");
      setRejectOrder(null); setReason("");
      refresh();
    } catch (error: any) { toast.error(error.message || "Не удалось отклонить позицию"); }
    finally { setBusyId((id) => id === line.id ? null : id); }
  };

  const columns = useMemo<ColumnDef<StockOrderLine>[]>(() => [
    { id: "date", header: "Дата", accessorFn: (r) => fmtOrderDate(r.stock_orders.ordered_at), enableColumnFilter: false },
    { id: "dept", header: "Отделение", accessorFn: (r) => r.stock_orders.to_warehouse?.departments?.name || r.stock_orders.to_warehouse?.name || "—" },
    { id: "by", header: "Заказал", accessorFn: (r) => r.stock_orders.ordered_by_profile?.full_name || "—" },
    { id: "item", header: "Препарат / Товар", accessorFn: lineItemName },
    { id: "quantity", header: "Количество", accessorFn: (r) => Number(r.quantity_units), enableColumnFilter: false },
    { id: "status", header: "Статус", accessorFn: effectiveStatus, cell: ({ row }) => <div className="flex items-center gap-2"><StockOrderStatusBadge status={effectiveStatus(row.original)} />{row.original.status === "pending" && <PulseDot />}</div> },
    { id: "reason", header: "Причина", enableColumnFilter: false, accessorFn: (r) => r.status === "rejected" ? r.reject_reason || "—" : "—" },
    {
      id: "actions", header: "", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => {
        const o = row.original;
        if (o.status === "pending") return <div className="flex gap-2 justify-end">
          <Button size="sm" disabled={busyId === o.id} onClick={() => release(o)}>{busyId === o.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Выдать</Button>
          <Button size="sm" variant="outline" disabled={busyId === o.id} onClick={() => { setRejectOrder(o); setReason(""); }}>Отклонить</Button>
        </div>;
        return null;
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busyId, warehouse?.id]);

  const controls = <>
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList><TabsTrigger value="new" className="gap-2">Новые ({pendingCount}){pendingCount > 0 && <PulseDot />}</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList>
    </Tabs>
    <PeriodFilter clearable value={period} onChange={setPeriod} />
  </>;

  return <div className="space-y-4">
    {embedded ? <FilterToolbar left={controls} /> : <ScreenHeader title={title} right={controls} />}
    {tab === "new" && (bounds.from || bounds.to) && pendingCount - orders.length > 0 && <div className="text-sm text-muted-foreground">
      Ещё {pendingCount - orders.length} новых заказов вне выбранного периода{" "}
      <Button variant="link" className="h-auto p-0" onClick={() => setNewPeriod({ period: "custom" })}>Показать все</Button>
    </div>}
    {whLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      : !warehouse ? <p className="text-center text-muted-foreground py-6">Склад не настроен</p>
      : <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          getRowId={(r: any) => r.id}
          emptyMessage={tab === "new" ? "Нет новых заказов" : "Нет заказов за период"}
          renderFooter={(table) => <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="font-semibold">Итого позиций: {table.getFilteredRowModel().rows.length}</TableCell></TableRow>}
        />}
    <Dialog open={!!rejectOrder} onOpenChange={(o) => { if (!o) setRejectOrder(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Отклонить позицию</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Причина *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectOrder(null)}>Отмена</Button>
          <Button variant="destructive" disabled={busyId === rejectOrder?.id || !reason.trim()} onClick={reject}>{busyId === rejectOrder?.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Отклонить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
