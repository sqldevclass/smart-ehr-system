import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { PeriodFilter, rangeBounds } from "@/components/shared/PeriodFilter";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { format } from "date-fns";
import { useWarehouseUnits } from "./useWarehouseUnits";
import { UnitPicker } from "./UnitPicker";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

interface ItemRow {
  batchId: string;
  quantityUnits: string;
  equipmentIds: string[];
}

export default function ExpensesView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse } = useMyWarehouse(warehouseTypeCode);

  const { byBatch, isPending: unitsLoading, error: unitsError } = useWarehouseUnits(warehouse?.id);
  const [details, setDetails] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = usePeriodFilter(true);
  const bounds = rangeBounds(period);
  const [typeId, setTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { batchId: "", quantityUnits: "", equipmentIds: [] },
  ]);

  const { data: types = [] } = useQuery({
    queryKey: ["write-off-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("write_off_types")
        .select("id, code, name_ru, name_en")
        .order("code");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const selectedType = types.find((t: any) => t.id === typeId) as any;

  const { data: employees = [] } = useQuery({
    queryKey: ["profiles", user?.hospitalId, "writeoff-employees"],
    enabled: !!user?.hospitalId && selectedType?.code === "employee",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("full_name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId, "active", warehouseTypeCode === "central_pharmacy" ? "pharmacy" : "warehouse"],
    enabled: !!user?.hospitalId && selectedType?.code === "return_supplier",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("scope", warehouseTypeCode === "central_pharmacy" ? "pharmacy" : "warehouse")
        .eq("is_active", true)
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["writeoff-batches", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_batches")
        .select("id, quantity_units, series_number, expiry_date, product_id, drug_formulary_id, products(name), drug_formulary(trade_name)")
        .eq("warehouse_id", warehouse?.id ?? "").gt("quantity_units", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["writeoffs", warehouse?.id, bounds.from ?? null, bounds.to ?? null],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      let q = supabase
        .from("write_off_records")
        .select(
          "id, written_off_at, notes, write_off_types(name_ru, code), profiles!write_off_records_written_off_by_fkey(full_name), write_off_record_items(id, quantity_units, products(name), drug_formulary(trade_name))"
        )
        .eq("warehouse_id", warehouse?.id ?? "");
      if (bounds.from) q = q.gte("written_off_at", bounds.from);
      if (bounds.to) q = q.lte("written_off_at", bounds.to);
      const { data, error } = await q
        .order("written_off_at", { ascending: false })
        .limit(500);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: detailUnits = [], isLoading: detailUnitsLoading, error: detailUnitsError } = useQuery({
    queryKey: ["writeoff-units", details?.id],
    enabled: !!details,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_writeoff_units" as any, { p_write_off_record_id: details.id } as any);
      if (error) throw error;
      return (data ?? []) as unknown as { equipment_id: string; product_name: string; model: string | null; serial_number: string | null }[];
    },
  });

  const reset = () => {
    setTypeId("");
    setEmployeeId("");
    setSupplierId("");
    setNotes("");
    setItems([{ batchId: "", quantityUnits: "", equipmentIds: [] }]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouse || !user) throw new Error("Склад не настроен");
      if (!selectedType) throw new Error("Выберите тип списания");
      if (selectedType.code === "employee" && !employeeId) throw new Error("Выберите сотрудника");
      if (selectedType.code === "return_supplier" && !supplierId) throw new Error("Выберите поставщика");
      if (!items.length) throw new Error("Добавьте хотя бы одну позицию");
      if (unitsLoading) throw new Error("Дождитесь загрузки единиц инвентаря");
      if (unitsError) throw unitsError;
      const selectedUnits = new Set<string>();
      const totals = new Map<string, number>();
      const cleanItems = items.map((item) => {
        const batch = batches.find((b: any) => b.id === item.batchId);
        const batchUnits = byBatch.get(item.batchId);
        if (batch && batchUnits?.length) {
          if (!item.equipmentIds.length) throw new Error("Выберите единицы инвентаря");
          for (const id of item.equipmentIds) {
            if (!batchUnits.some((unit) => unit.equipment_id === id) || selectedUnits.has(id)) throw new Error("Выбранная единица инвентаря недоступна");
            selectedUnits.add(id);
          }
          return { batch_id: item.batchId, equipment_ids: item.equipmentIds };
        }
        const qty = Number(item.quantityUnits);
        if (!batch || !item.quantityUnits.trim() || !Number.isFinite(qty) || qty <= 0) throw new Error("Выберите партию и укажите количество больше нуля");
        const total = (totals.get(item.batchId) || 0) + qty;
        if (total > Number(batch.quantity_units)) throw new Error("Количество превышает доступный остаток партии");
        totals.set(item.batchId, total);
        return { batch_id: item.batchId, quantity_units: qty };
      });
      const { error } = await supabase.rpc("perform_writeoff" as any, {
        p_warehouse_id: warehouse.id,
        p_write_off_type_id: typeId,
        p_employee_id: selectedType.code === "employee" ? employeeId : null,
        p_supplier_id: selectedType.code === "return_supplier" ? supplierId : null,
        p_notes: notes.trim() || null,
        p_items: cleanItems,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Списание сохранено");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["writeoffs", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stale-items", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["writeoff-batches", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["my-batches", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["warehouse-units", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["nurse-inv-units", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["equipment"] });
      qc.invalidateQueries({ queryKey: ["nurse-inv-stock", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button disabled={!warehouse}>Новое списание</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новое списание</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Тип</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name_ru || t.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType?.code === "employee" && (
                <div className="space-y-1.5">
                  <Label>Сотрудник</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedType?.code === "return_supplier" && (
                <div className="space-y-1.5">
                  <Label>Поставщик</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите поставщика" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Примечание</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Позиции</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setItems([...items, { batchId: "", quantityUnits: "", equipmentIds: [] }])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" /> Добавить строку
                  </Button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[minmax(0,1fr)_100px_40px] gap-2 items-end">
                    <Select
                      value={item.batchId}
                      onValueChange={(v) => {
                        const next = [...items];
                        next[idx] = { ...next[idx], batchId: v, equipmentIds: [] };
                        setItems(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Партия" />
                      </SelectTrigger>
                      <SelectContent>
                        {batches.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.drug_formulary?.trade_name || p.products?.name || "—"} — серия {p.series_number || "—"}, годен до {p.expiry_date || "—"}, доступно {p.quantity_units} ед.
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!byBatch.has(item.batchId) && <Input
                      type="number"
                      step="any"
                      placeholder="Кол-во"
                      value={item.quantityUnits}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantityUnits = e.target.value;
                        setItems(next);
                      }}
                    />}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {byBatch.has(item.batchId) && <div className="col-span-full"><UnitPicker mode="writeoff" units={(byBatch.get(item.batchId) ?? []).filter((unit) => !items.some((row, i) => i !== idx && row.equipmentIds.includes(unit.equipment_id)))} selectedIds={item.equipmentIds} onChange={(equipmentIds) => setItems(items.map((row, i) => i === idx ? { ...row, equipmentIds } : row))} /></div>}
                  </div>
                ))}
                {unitsError && <p role="alert" className="text-destructive">{unitsError.message}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || unitsLoading || !!unitsError}>
                {mutation.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!details} onOpenChange={(value) => { if (!value) setDetails(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Позиции списания</DialogTitle></DialogHeader>
          <table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Наименование</th><th className="p-2 text-left">Количество</th></tr></thead><tbody>{details?.write_off_record_items?.map((item: any) => <tr key={item.id} className="border-t"><td className="p-2">{item.drug_formulary?.trade_name || item.products?.name || "—"}</td><td className="p-2">{item.quantity_units}</td></tr>)}</tbody></table>
          {detailUnitsLoading && <p className="text-muted-foreground">Загрузка единиц…</p>}
          {detailUnitsError && <p role="alert" className="text-destructive">{detailUnitsError.message}</p>}
          {detailUnits.length > 0 && <section className="space-y-2"><h3 className="font-semibold">Единицы</h3>{detailUnits.map((unit) => <p key={unit.equipment_id} className="text-sm break-words">{unit.product_name} · {unit.model || "—"} · С/Н {unit.serial_number || "—"}</p>)}</section>}
        </DialogContent>
      </Dialog>
      <FilterToolbar left={<PeriodFilter clearable value={period} onChange={setPeriod} />} />

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Дата</th>
              <th className="p-3">Тип</th>
              <th className="p-3">Списал</th>
              <th className="p-3">Примечание</th>
              <th className="p-3">Позиции</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  {r.written_off_at ? format(new Date(r.written_off_at), "yyyy-MM-dd HH:mm") : "—"}
                </td>
                <td className="p-3">{r.write_off_types?.name_ru || r.write_off_types?.code}</td>
                <td className="p-3">{r.profiles?.full_name || "—"}</td>
                <td className="p-3">{r.notes || "—"}</td>
                <td className="p-3"><Button variant="link" className="h-auto p-0" onClick={() => setDetails(r)}>{r.write_off_record_items?.length ?? 0}</Button></td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Нет списаний
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
