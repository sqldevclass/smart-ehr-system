import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { TransferTable } from "./TransferTable";
import { useTransferActions } from "./useTransferActions";
import { PeriodFilter, rangeBounds } from "@/components/shared/PeriodFilter";
import { ScreenHeader } from "./ScreenHeader";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";

interface Props { warehouseTypeCode: "central_pharmacy" | "general"; title: string }
interface LineItem { batchId: string; quantityUnits: string }
export default function TransfersView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse, error: warehouseError } = useMyWarehouse(warehouseTypeCode);
  const [open, setOpen] = useState(false);
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ batchId: "", quantityUnits: "" }]);
  const [period, setPeriod] = usePeriodFilter(true);
  const bounds = rangeBounds(period);
  const { data: destinations = [] } = useQuery({
    queryKey: ["transfer-destinations", user?.hospitalId, warehouse?.id], enabled: !!user?.hospitalId && !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name, warehouse_types(code)")
        .eq("hospital_id", user?.hospitalId ?? "").eq("is_active", true).neq("id", warehouse?.id ?? "").order("name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
  const { data: myBatches = [] } = useQuery({
    queryKey: ["my-batches", warehouse?.id], enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_batches")
        .select("id, series_number, expiry_date, quantity_units, products(name), drug_formulary(trade_name)")
        .eq("warehouse_id", warehouse?.id ?? "").gt("quantity_units", 0).order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
  const { data: transfers = [], error: transfersError } = useQuery({
    queryKey: ["transfers", warehouse?.id, bounds.from ?? null, bounds.to ?? null], enabled: !!warehouse?.id,
    queryFn: async () => {
      let q = supabase.from("transfer_records").select(`
        id, status, sent_at, accepted_at, rejected_at, returned_at, reject_reason, notes, from_warehouse_id, to_warehouse_id,
        from_warehouse:warehouses!transfer_records_from_warehouse_id_fkey(name),
        to_warehouse:warehouses!transfer_records_to_warehouse_id_fkey(name),
        sent_by_profile:profiles!transfer_records_sent_by_fkey(full_name),
        accepted_by_profile:profiles!transfer_records_accepted_by_fkey(full_name),
        transfer_record_items(id, quantity_units, products(name), drug_formulary(trade_name, inn), inventory_batches(series_number, expiry_date))
      `).or(`from_warehouse_id.eq.${warehouse?.id},to_warehouse_id.eq.${warehouse?.id}`);
      const range = [bounds.from && `sent_at.gte."${bounds.from}"`, bounds.to && `sent_at.lte."${bounds.to}"`].filter(Boolean);
      if (range.length) q = q.or(`status.in.(pending_acceptance,rejected),and(${range.join(",")})`);
      const { data, error } = await q.order("sent_at", { ascending: false }).limit(500);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
  const refresh = (ids: string[]) => {
    for (const id of new Set(ids)) {
      qc.invalidateQueries({ queryKey: ["stock", id] });
      qc.invalidateQueries({ queryKey: ["stale-items", id] });
      qc.invalidateQueries({ queryKey: ["transfers", id] });
      qc.invalidateQueries({ queryKey: ["my-batches", id] });
      qc.invalidateQueries({ queryKey: ["writeoff-batches", id] });
      qc.invalidateQueries({ queryKey: ["nurse-inv-stock", id] });
      qc.invalidateQueries({ queryKey: ["nurse-inv-transfers", id] });
    }
  };
  const reset = () => { setDestId(""); setNotes(""); setItems([{ batchId: "", quantityUnits: "" }]); };
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!warehouse) throw new Error("Склад не настроен");
      if (!destId) throw new Error("Выберите склад получателя");
      if (!items.length) throw new Error("Добавьте хотя бы одну позицию");
      const totals = new Map<string, number>();
      const cleanItems = items.map((item) => {
        const batch = myBatches.find((b: any) => b.id === item.batchId);
        const qty = Number(item.quantityUnits);
        if (!batch || !item.quantityUnits.trim() || !Number.isFinite(qty) || qty <= 0) throw new Error("Выберите партию и укажите количество больше нуля");
        const total = (totals.get(item.batchId) || 0) + qty;
        if (total > Number(batch.quantity_units)) throw new Error("Количество превышает доступный остаток партии");
        totals.set(item.batchId, total);
        return { batch_id: item.batchId, quantity_units: qty };
      });
      const { error } = await supabase.rpc("send_transfer", {
        p_from_warehouse_id: warehouse.id, p_to_warehouse_id: destId, p_notes: notes.trim() || null, p_items: cleanItems,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Перемещение отправлено"); refresh([warehouse?.id ?? "", destId]); setOpen(false); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const actions = useTransferActions(refresh);
  return <div className="space-y-4">
    <Tabs defaultValue="incoming" className="space-y-4">
    <ScreenHeader title={title} right={<>
      <TabsList><TabsTrigger value="incoming">Принятые</TabsTrigger><TabsTrigger value="outgoing">Отправленные</TabsTrigger><TabsTrigger value="all">Все перемещения</TabsTrigger></TabsList>
      <PeriodFilter clearable value={period} onChange={setPeriod} />
      <Button disabled={!warehouse} onClick={() => setOpen(true)}>Новое перемещение</Button>
    </>} />
    {warehouseError && <p role="alert" className="text-destructive">{warehouseError.message}</p>}
    {transfersError && <p role="alert" className="text-destructive">{transfersError.message}</p>}
    {!warehouse && !warehouseError && <p className="text-muted-foreground">Склад не настроен</p>}
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Новое перемещение</DialogTitle></DialogHeader>
        <div className="space-y-4"><div className="space-y-1.5"><Label>Склад получателя</Label>
          <Select value={destId} onValueChange={setDestId}><SelectTrigger><SelectValue placeholder="Выберите склад" /></SelectTrigger><SelectContent>{destinations.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
        </div><Label>Примечание</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-between items-center"><Label>Позиции</Label><Button variant="outline" size="sm" onClick={() => setItems([...items, { batchId: "", quantityUnits: "" }])}><Plus className="h-4 w-4 mr-1" />Добавить строку</Button></div>
        {items.map((item, idx) => <div key={idx} className="grid grid-cols-[minmax(0,1fr)_100px_40px] gap-2">
          <Select value={item.batchId} onValueChange={(batchId) => setItems(items.map((row, i) => i === idx ? { ...row, batchId } : row))}><SelectTrigger><SelectValue placeholder="Партия" /></SelectTrigger><SelectContent>{myBatches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.drug_formulary?.trade_name || b.products?.name || "—"} — серия {b.series_number || "—"}, годен до {b.expiry_date || "—"}, доступно {b.quantity_units} ед.</SelectItem>)}</SelectContent></Select>
          <Input type="number" step="any" aria-label={`Количество в строке ${idx + 1}`} placeholder="Кол-во" value={item.quantityUnits} onChange={(e) => setItems(items.map((row, i) => i === idx ? { ...row, quantityUnits: e.target.value } : row))} />
          <Button size="icon" variant="ghost" aria-label="Удалить строку" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
        </div>)}</div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button><Button disabled={sendMutation.isPending} onClick={() => sendMutation.mutate()}>{sendMutation.isPending ? "Отправка…" : "Отправить"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
      <TabsContent value="outgoing"><TransferTable rows={transfers.filter((t: any) => t.from_warehouse_id === warehouse?.id)} currentWarehouseId={warehouse?.id} actions={actions} showTotals /></TabsContent>
      <TabsContent value="incoming"><TransferTable rows={transfers.filter((t: any) => t.to_warehouse_id === warehouse?.id)} currentWarehouseId={warehouse?.id} actions={actions} showTotals /></TabsContent>
      <TabsContent value="all"><TransferTable rows={transfers} currentWarehouseId={warehouse?.id} actions={actions} showTotals /></TabsContent>
    </Tabs>
    {actions.dialogs}
  </div>;
}
