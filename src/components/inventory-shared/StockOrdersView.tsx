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
import { STOCK_ORDER_SELECT, StockOrderItemsCell, StockOrderStatusBadge, fmtOrderDate } from "./stockOrderStatus";

const sb = supabase as any;

interface Props { warehouseTypeCode: "central_pharmacy" | "general"; title: string; embedded?: boolean }

export default function StockOrdersView({ warehouseTypeCode, title, embedded }: Props) {
  const qc = useQueryClient();
  const { data: warehouse, isLoading: whLoading } = useMyWarehouse(warehouseTypeCode);
  const [tab, setTab] = useState<"new" | "history">("new");
  const [period, setPeriod] = usePeriodFilter(true);
  const bounds = rangeBounds(period);
  const [busy, setBusy] = useState(false);
  const [rejectOrder, setRejectOrder] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["stock-orders", warehouse?.id, tab, tab === "history" ? bounds.from : null, tab === "history" ? bounds.to : null],
    enabled: !!warehouse?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      let q = sb.from("stock_orders").select(STOCK_ORDER_SELECT).eq("from_warehouse_id", warehouse!.id);
      if (tab === "new") q = q.eq("status", "pending");
      else {
        q = q.neq("status", "pending");
        if (bounds.from) q = q.gte("ordered_at", bounds.from);
        if (bounds.to) q = q.lte("ordered_at", bounds.to);
      }
      const { data, error } = await q.order("ordered_at", { ascending: false }).limit(500);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const refresh = () => {
    const id = warehouse?.id;
    qc.invalidateQueries({ queryKey: ["stock-orders"] });
    for (const key of ["stock", "transfers", "my-batches"]) qc.invalidateQueries({ queryKey: [key, id] });
    qc.invalidateQueries({ queryKey: ["nurse-inv-transfers"] });
  };

  const release = async (order: any) => {
    setBusy(true);
    const { error } = await sb.rpc("release_stock_order", { p_order_id: order.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Выдано — перемещение отправлено");
    refresh();
  };

  const reject = async () => {
    if (!rejectOrder || !reason.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("reject_stock_order", { p_order_id: rejectOrder.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Заказ отклонён");
    setRejectOrder(null); setReason("");
    refresh();
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { id: "date", header: "Дата", accessorFn: (r) => fmtOrderDate(r.ordered_at), enableColumnFilter: false },
    { id: "dept", header: "Отделение", accessorFn: (r) => r.to_warehouse?.departments?.name || r.to_warehouse?.name || "—" },
    { id: "by", header: "Заказал", accessorFn: (r) => r.ordered_by_profile?.full_name || "—" },
    { id: "items", header: "Позиции", enableColumnFilter: false, accessorFn: (r) => (r.stock_order_items || []).length, cell: ({ row }) => <StockOrderItemsCell order={row.original} /> },
    { id: "status", header: "Статус", accessorFn: (r) => r.status, cell: ({ row }) => <StockOrderStatusBadge status={row.original.status} /> },
    { id: "reason", header: "Причина отклонения", enableColumnFilter: false, accessorFn: (r) => r.reject_reason || "—" },
    {
      id: "actions", header: "", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => {
        const o = row.original;
        if (o.status === "pending") return <div className="flex gap-2 justify-end">
          <Button size="sm" disabled={busy} onClick={() => release(o)}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Выдать</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => { setRejectOrder(o); setReason(""); }}>Отклонить</Button>
        </div>;
        if (o.status === "released") return <span className="text-muted-foreground text-sm whitespace-nowrap">Перемещение отправлено</span>;
        return null;
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [busy, warehouse?.id]);

  const controls = <>
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
      <TabsList><TabsTrigger value="new">Новые</TabsTrigger><TabsTrigger value="history">История</TabsTrigger></TabsList>
    </Tabs>
    {tab === "history" && <PeriodFilter clearable value={period} onChange={setPeriod} />}
  </>;

  return <div className="space-y-4">
    {embedded ? <FilterToolbar left={controls} /> : <ScreenHeader title={title} right={controls} />}
    {whLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      : !warehouse ? <p className="text-center text-muted-foreground py-6">Склад не настроен</p>
      : <DataTable
          columns={columns}
          data={orders}
          isLoading={isLoading}
          getRowId={(r: any) => r.id}
          emptyMessage={tab === "new" ? "Нет новых заказов" : "Нет заказов за период"}
          renderFooter={(table) => <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="font-semibold">Итого заказов: {table.getFilteredRowModel().rows.length}</TableCell></TableRow>}
        />}
    <Dialog open={!!rejectOrder} onOpenChange={(o) => { if (!o) setRejectOrder(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Отклонить заказ</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Причина *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectOrder(null)}>Отмена</Button>
          <Button variant="destructive" disabled={busy || !reason.trim()} onClick={reject}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Отклонить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
