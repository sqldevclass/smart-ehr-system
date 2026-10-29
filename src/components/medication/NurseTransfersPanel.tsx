import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import HighlightMatch from "@/components/shared/HighlightMatch";
import { matchesSearch } from "@/lib/search";
import { TransferTable } from "@/components/inventory-shared/TransferTable";
import { matchesRange, type PeriodState } from "@/components/shared/PeriodFilter";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { useTransferActions } from "@/components/inventory-shared/useTransferActions";
import NurseStockOrdersPanel from "@/components/medication/NurseStockOrdersPanel";

interface Props {
  hospitalId: string;
  deptWarehouse: { id: string; name: string } | null | undefined;
  stock: any[];
  allWarehouses: any[];
  filters: Record<string, string>;
  period: PeriodState;
  toolbarLeft: ReactNode;
}

function useNurseTransfers(hospitalId: string, warehouseId: string | undefined, direction: "incoming" | "outgoing") {
  return useQuery({
    queryKey: ["nurse-inv-transfers", warehouseId, direction],
    enabled: !!warehouseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_records").select(`
        id, status, sent_at, accepted_at, rejected_at, returned_at, reject_reason, notes, from_warehouse_id, to_warehouse_id,
        from_warehouse:warehouses!transfer_records_from_warehouse_id_fkey(name),
        to_warehouse:warehouses!transfer_records_to_warehouse_id_fkey(name),
        sent_by_profile:profiles!transfer_records_sent_by_fkey(full_name),
        accepted_by_profile:profiles!transfer_records_accepted_by_fkey(full_name),
        transfer_record_items(id, quantity_units, products(name), drug_formulary(trade_name, inn), inventory_batches(series_number, expiry_date))
      `).eq("hospital_id", hospitalId)
        .eq(direction === "incoming" ? "to_warehouse_id" : "from_warehouse_id", warehouseId ?? "")
        .order("sent_at", { ascending: false }).limit(100);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
}

export function useNurseIncomingTransfers(hospitalId: string, warehouseId?: string) {
  return useNurseTransfers(hospitalId, warehouseId, "incoming");
}

const ALWAYS_SHOWN = new Set(["pending_acceptance", "rejected"]);

/** Drug search always applies; when a period is given, the range applies to sent_at except for actionable rows. */
export function filterNurseTransfers(rows: any[], filters: Record<string, string>, period?: PeriodState) {
  return rows.filter((transfer) => {
    const names = (transfer.transfer_record_items || []).flatMap((item: any) => [
      item.drug_formulary?.trade_name, item.drug_formulary?.inn, item.products?.name,
    ]);
    return matchesSearch(names, filters.drug ?? "") &&
      (!period || ALWAYS_SHOWN.has(transfer.status) || matchesRange(transfer.sent_at, period));
  });
}

export default function NurseTransfersPanel({ hospitalId, deptWarehouse, stock, allWarehouses, filters, period, toolbarLeft }: Props) {
  const { user, hasPermission } = useAuth();
  const canOrder = hasPermission("warehouse.department_order");
  const qc = useQueryClient();
  const [busyAll, setBusyAll] = useState(false);
  const [txBatchId, setTxBatchId] = useState("");
  const [txWarehouseId, setTxWarehouseId] = useState("");
  const [txQty, setTxQty] = useState("");
  const [txSending, setTxSending] = useState(false);
  const { data: incoming = [], isLoading: transLoading, error: incomingError } = useNurseIncomingTransfers(hospitalId, deptWarehouse?.id);
  const { data: outgoing = [], isLoading: outgoingLoading, error: outgoingError } = useNurseTransfers(hospitalId, deptWarehouse?.id, "outgoing");
  const pending = filterNurseTransfers(incoming, filters).filter((transfer: any) => transfer.status === "pending_acceptance");
  const history = filterNurseTransfers(incoming, filters, period).filter((transfer: any) => transfer.status !== "pending_acceptance");
  const refresh = (ids: string[]) => {
    for (const id of new Set([deptWarehouse?.id, ...ids])) {
      if (!id) continue;
      for (const key of ["nurse-inv-transfers", "nurse-inv-stock", "stock", "transfers", "my-batches", "writeoff-batches"]) {
        qc.invalidateQueries({ queryKey: [key, id] });
      }
    }
  };
  const actions = useTransferActions(refresh);
  const acceptAllTransfers = async () => {
    if (!user || !pending.length || !deptWarehouse) return;
    setBusyAll(true);
    let ok = 0, err = 0;
    for (const transfer of pending) {
      try {
        const { error } = await supabase.rpc("accept_transfer", { p_transfer_record_id: transfer.id });
        if (error) throw error;
        ok++;
      } catch (error: any) { err++; toast.error(error.message); }
    }
    setBusyAll(false);
    if (ok) toast.success(`Принято: ${ok}`);
    if (err) toast.error(`Ошибок: ${err}`);
    refresh(pending.flatMap((transfer: any) => [transfer.from_warehouse_id, transfer.to_warehouse_id]));
    if (ok) for (const key of ["nurse-stock-orders", "stock-orders", "stock-orders-pending-count"]) qc.invalidateQueries({ queryKey: [key] });
  };
  const sendTransfer = async () => {
    if (!user || !deptWarehouse || !txBatchId || !txWarehouseId || !txQty) return;
    setTxSending(true);
    try {
      const batch = stock.find((row) => row.id === txBatchId);
      const qty = Number(txQty);
      if (!batch || !Number.isFinite(qty) || qty <= 0) throw new Error("Укажите количество больше нуля");
      if (qty > Number(batch.quantity_units)) throw new Error("Количество превышает доступный остаток партии");
      const { error } = await supabase.rpc("send_transfer", {
        p_from_warehouse_id: deptWarehouse.id, p_to_warehouse_id: txWarehouseId,
        p_notes: null, p_items: [{ batch_id: txBatchId, quantity_units: qty }],
      });
      if (error) throw error;
      toast.success("Перемещение отправлено");
      refresh([deptWarehouse.id, txWarehouseId]);
      setTxBatchId(""); setTxWarehouseId(""); setTxQty("");
    } catch (error: any) { toast.error(error.message); }
    finally { setTxSending(false); }
  };
  const th = "p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide";
  const td = "p-3 text-sm";
  return <>
    <Tabs defaultValue="incoming" className="space-y-3">
      <FilterToolbar
        left={toolbarLeft}
        right={<TabsList><TabsTrigger value="incoming">Принятые</TabsTrigger><TabsTrigger value="outgoing">Отправленные</TabsTrigger>{canOrder && <TabsTrigger value="orders">Заказы</TabsTrigger>}</TabsList>}
      />
      <TabsContent value="incoming" className="space-y-3">
        {incomingError && <p role="alert" className="text-destructive">{incomingError.message}</p>}
              <div>
                <h3 className="font-semibold mb-2">Ожидают приёма</h3>
                {transLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !deptWarehouse ? (
                  <div className="text-center text-muted-foreground py-6">
                    Склад отделения не настроен
                  </div>
                ) : pending.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    Нет ожидающих перемещений
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end mb-2">
                      <Button onClick={acceptAllTransfers} disabled={busyAll} className="gap-2">
                        {busyAll && <Loader2 className="h-4 w-4 animate-spin" />}
                        Принять все ({pending.length})
                      </Button>
                    </div>
                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className={th}>Откуда</th>
                            <th className={th}>Дата</th>
                            <th className={th}>Препараты / Товары</th>
                            <th className={th}>Кол-во</th>
                            <th className={th}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {pending.map((t: any) => (
                            <tr key={t.id} className="border-t align-top">
                              <td className={td}>{t.from_warehouse?.name || "—"}</td>
                              <td className={td}>{t.sent_at ? format(new Date(t.sent_at), "dd.MM.yyyy") : "—"}</td>
                              <td className={td}>
                                {(t.transfer_record_items || []).map((i: any) => (
                                  <div key={i.id}><HighlightMatch text={i.drug_formulary?.trade_name || i.products?.name} term={filters.drug ?? ""} fallback="—" /></div>
                                ))}
                              </td>
                              <td className={td}>
                                {(t.transfer_record_items || []).map((i: any) => (
                                  <div key={i.id}>{i.quantity_units}</div>
                                ))}
                              </td>
                              <td className={td}>
                                <Button size="sm" onClick={() => actions.openAction("accept", t)} disabled={busyAll}>
                                  Принять
                                </Button>
                                <Button size="sm" variant="outline" className="ml-2" disabled={busyAll} onClick={() => actions.openAction("reject", t)}>Отклонить</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

        <section><h3 className="font-semibold mb-2">История</h3><TransferTable rows={history} currentWarehouseId={deptWarehouse?.id} actions={actions} compact /></section>
      </TabsContent>
      <TabsContent value="outgoing" className="space-y-3">
              <div>
                <h3 className="font-semibold mb-2">Отправить в другой склад</h3>
                <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Препарат / Товар</Label>
                    <Select value={txBatchId} onValueChange={setTxBatchId}>
                      <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                      <SelectContent>
                        {stock.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.drug_formulary?.trade_name || b.products?.name || "—"} — серия {b.series_number || "—"}, годен до {b.expiry_date || "—"}, доступно {b.quantity_units} ед.
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Склад получатель</Label>
                    <Select value={txWarehouseId} onValueChange={setTxWarehouseId}>
                      <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                      <SelectContent>
                        {(allWarehouses as any[]).map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} {w.departments?.name ? `(${w.departments.name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Количество</Label>
                    <Input type="number" value={txQty} onChange={(e) => setTxQty(e.target.value)} />
                  </div>
                  <Button onClick={sendTransfer} disabled={txSending || !txBatchId || !txWarehouseId || !txQty}>
                    {txSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить"}
                  </Button>
                </div>
              </div>
        <section><h3 className="font-semibold mb-2">Отправленные перемещения</h3>
          {outgoingError && <p role="alert" className="text-destructive">{outgoingError.message}</p>}
          {outgoingLoading ? <div className="flex items-center justify-center h-32"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <TransferTable rows={filterNurseTransfers(outgoing, filters, period)} currentWarehouseId={deptWarehouse?.id} actions={actions} compact />}
        </section>
      </TabsContent>
      {canOrder && <TabsContent value="orders" className="space-y-3"><NurseStockOrdersPanel deptWarehouse={deptWarehouse} hospitalId={hospitalId} /></TabsContent>}
    </Tabs>
    {actions.dialogs}
  </>;
}
