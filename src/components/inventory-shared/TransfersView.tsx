import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { format } from "date-fns";

interface Props { warehouseTypeCode: "central_pharmacy" | "general"; title: string }
interface LineItem { batchId: string; quantityUnits: string }
const statusLabels: Record<string, string> = {
  pending_acceptance: "Ожидает приёма", accepted: "Принято", cancelled: "Отменено", rejected: "Отклонено",
};
function TransferStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "accepted" ? "default" : status === "rejected" ? "destructive" : "secondary"}>{statusLabels[status] || "—"}</Badge>;
}

export default function TransfersView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse, error: warehouseError } = useMyWarehouse(warehouseTypeCode);
  const [open, setOpen] = useState(false);
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ batchId: "", quantityUnits: "" }]);
  const [details, setDetails] = useState<any>(null);
  const [action, setAction] = useState<{ kind: "accept" | "cancel" | "reject"; transfer: any } | null>(null);
  const [reason, setReason] = useState("");
  const { data: destinations = [] } = useQuery({
    queryKey: ["transfer-destinations", user?.hospitalId, warehouse?.id], enabled: !!user?.hospitalId && !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("id, name, warehouse_types(code)")
        .eq("hospital_id", user?.hospitalId ?? "").eq("is_active", true).neq("id", warehouse?.id ?? "").order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: myBatches = [] } = useQuery({
    queryKey: ["my-batches", warehouse?.id], enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_batches")
        .select("id, series_number, expiry_date, quantity_units, products(name), drug_formulary(trade_name)")
        .eq("warehouse_id", warehouse?.id ?? "").gt("quantity_units", 0).order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });
  const { data: transfers = [], error: transfersError } = useQuery({
    queryKey: ["transfers", warehouse?.id], enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("transfer_records").select(`
        id, status, sent_at, accepted_at, rejected_at, reject_reason, notes, from_warehouse_id, to_warehouse_id,
        from_warehouse:warehouses!transfer_records_from_warehouse_id_fkey(name),
        to_warehouse:warehouses!transfer_records_to_warehouse_id_fkey(name),
        sent_by_profile:profiles!transfer_records_sent_by_fkey(full_name),
        accepted_by_profile:profiles!transfer_records_accepted_by_fkey(full_name),
        transfer_record_items(id, quantity_units, products(name), drug_formulary(trade_name), inventory_batches(series_number, expiry_date))
      `).or(`from_warehouse_id.eq.${warehouse?.id},to_warehouse_id.eq.${warehouse?.id}`).order("sent_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });
  const refresh = (ids: string[]) => {
    for (const id of new Set(ids)) {
      qc.invalidateQueries({ queryKey: ["stock", id] });
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
  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!action) throw new Error("Выберите перемещение");
      if (action.kind === "reject" && !reason.trim()) throw new Error("Укажите причину отклонения");
      const args = { p_transfer_record_id: action.transfer.id };
      const { error } = action.kind === "reject"
        ? await supabase.rpc("reject_transfer", { ...args, p_reason: reason.trim() })
        : action.kind === "cancel" ? await supabase.rpc("cancel_transfer", args) : await supabase.rpc("accept_transfer", args);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(action?.kind === "accept" ? "Перемещение принято" : action?.kind === "cancel" ? "Перемещение отменено" : "Перемещение отклонено");
      if (action) refresh([action.transfer.from_warehouse_id, action.transfer.to_warehouse_id]);
      setAction(null); setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const renderTable = (rows: any[]) => (
    <div className="border rounded-lg overflow-x-auto bg-card">
      <table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left">
        {["Дата", "Откуда", "Куда", "Статус", "Позиции", "Отправил", "Принял", "Действия"].map((label) => <th key={label} className="p-3">{label}</th>)}
      </tr></thead><tbody>{rows.map((t) => <tr key={t.id} className="border-t">
        <td className="p-3 whitespace-nowrap">{t.sent_at ? format(new Date(t.sent_at), "dd.MM.yyyy HH:mm") : "—"}</td>
        <td className="p-3">{t.from_warehouse?.name || "—"}</td><td className="p-3">{t.to_warehouse?.name || "—"}</td>
        <td className="p-3"><TransferStatusBadge status={t.status} />{t.reject_reason && <p className="mt-1 text-muted-foreground">{t.reject_reason}</p>}{t.rejected_at && <p className="text-muted-foreground">{format(new Date(t.rejected_at), "dd.MM.yyyy HH:mm")}</p>}</td>
        <td className="p-3"><Button variant="link" onClick={() => setDetails(t)}>Позиции ({t.transfer_record_items?.length ?? 0})</Button></td>
        <td className="p-3">{t.sent_by_profile?.full_name || "—"}</td><td className="p-3">{t.accepted_by_profile?.full_name || "—"}</td>
        <td className="p-3"><div className="flex gap-2">{t.status === "pending_acceptance" && <>
          {t.to_warehouse_id === warehouse?.id && <><Button size="sm" onClick={() => setAction({ kind: "accept", transfer: t })}>Принять</Button><Button size="sm" variant="outline" onClick={() => { setReason(""); setAction({ kind: "reject", transfer: t }); }}>Отклонить</Button></>}
          {t.from_warehouse_id === warehouse?.id && <Button size="sm" variant="outline" onClick={() => setAction({ kind: "cancel", transfer: t })}>Отменить</Button>}
        </>}</div></td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Нет перемещений</td></tr>}</tbody></table>
    </div>
  );
  return <div className="space-y-4">
    <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
    {warehouseError && <p role="alert" className="text-destructive">{warehouseError.message}</p>}
    {transfersError && <p role="alert" className="text-destructive">{transfersError.message}</p>}
    {!warehouse && !warehouseError && <p className="text-muted-foreground">Склад не настроен</p>}
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
      <DialogTrigger asChild><Button disabled={!warehouse}>Новое перемещение</Button></DialogTrigger>
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
    <Tabs defaultValue="outgoing"><TabsList><TabsTrigger value="outgoing">Исходящие</TabsTrigger><TabsTrigger value="incoming">Входящие</TabsTrigger><TabsTrigger value="all">Все перемещения</TabsTrigger></TabsList>
      <TabsContent value="outgoing">{renderTable(transfers.filter((t: any) => t.from_warehouse_id === warehouse?.id))}</TabsContent>
      <TabsContent value="incoming">{renderTable(transfers.filter((t: any) => t.to_warehouse_id === warehouse?.id))}</TabsContent>
      <TabsContent value="all">{renderTable(transfers)}</TabsContent>
    </Tabs>
    <Dialog open={!!details} onOpenChange={(value) => { if (!value) setDetails(null); }}><DialogContent className="max-w-2xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Позиции перемещения</DialogTitle></DialogHeader>
      {details && <><TransferStatusBadge status={details.status} />{details.notes && <p>{details.notes}</p>}<table className="w-full text-sm"><thead><tr>{["Наименование", "Серия", "Годен до", "Количество"].map((label) => <th key={label} className="p-2 text-left">{label}</th>)}</tr></thead><tbody>{details.transfer_record_items?.map((i: any) => <tr key={i.id} className="border-t"><td className="p-2">{i.drug_formulary?.trade_name || i.products?.name || "—"}</td><td className="p-2">{i.inventory_batches?.series_number || "—"}</td><td className="p-2">{i.inventory_batches?.expiry_date || "—"}</td><td className="p-2">{i.quantity_units}</td></tr>)}</tbody></table></>}
    </DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={(value) => { if (!value && !actionMutation.isPending) { setAction(null); setReason(""); } }}><DialogContent><DialogHeader><DialogTitle>{action?.kind === "accept" ? "Принять перемещение?" : action?.kind === "cancel" ? "Отменить перемещение?" : "Отклонить перемещение?"}</DialogTitle></DialogHeader>
      {action?.kind === "reject" && <div className="space-y-2"><Label>Причина отклонения *</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
      <DialogFooter><Button variant="outline" disabled={actionMutation.isPending} onClick={() => setAction(null)}>Назад</Button><Button disabled={actionMutation.isPending || (action?.kind === "reject" && !reason.trim())} onClick={() => actionMutation.mutate()}>Подтвердить</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
