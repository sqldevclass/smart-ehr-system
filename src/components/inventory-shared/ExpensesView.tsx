import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
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

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

interface ItemRow {
  batchId: string;
  quantityUnits: string;
}

export default function ExpensesView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse } = useMyWarehouse(warehouseTypeCode);

  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { batchId: "", quantityUnits: "" },
  ]);

  const { data: types = [] } = useQuery({
    queryKey: ["write-off-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("write_off_types")
        .select("id, code, name_ru, name_en")
        .order("code");
      if (error) throw error;
      return data || [];
    },
  });

  const selectedType = types.find((t: any) => t.id === typeId) as any;

  const { data: employees = [] } = useQuery({
    queryKey: ["profiles", user?.hospitalId],
    enabled: !!user?.hospitalId && selectedType?.code === "employee",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId && selectedType?.code === "return_supplier",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
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
      if (error) throw error;
      return data || [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["writeoffs", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("write_off_records")
        .select(
          "id, written_off_at, notes, write_off_types(name_ru, code), profiles!write_off_records_written_off_by_fkey(full_name), write_off_record_items(id)"
        )
        .eq("warehouse_id", warehouse?.id ?? "")
        .order("written_off_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const reset = () => {
    setTypeId("");
    setEmployeeId("");
    setSupplierId("");
    setNotes("");
    setItems([{ batchId: "", quantityUnits: "" }]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouse || !user) throw new Error("Склад не настроен");
      if (!selectedType) throw new Error("Выберите тип списания");
      if (selectedType.code === "employee" && !employeeId) throw new Error("Выберите сотрудника");
      if (selectedType.code === "return_supplier" && !supplierId) throw new Error("Выберите поставщика");
      if (!items.length) throw new Error("Добавьте хотя бы одну позицию");
      const totals = new Map<string, number>();
      const cleanItems = items.map((item) => {
        const batch = batches.find((b: any) => b.id === item.batchId);
        const qty = Number(item.quantityUnits);
        if (!batch || !item.quantityUnits.trim() || !Number.isFinite(qty) || qty <= 0) throw new Error("Выберите партию и укажите количество больше нуля");
        const total = (totals.get(item.batchId) || 0) + qty;
        if (total > Number(batch.quantity_units)) throw new Error("Количество превышает доступный остаток партии");
        totals.set(item.batchId, total);
        return { batch_id: item.batchId, quantity_units: qty };
      });
      const { error } = await supabase.rpc("perform_writeoff", {
        p_warehouse_id: warehouse.id,
        p_write_off_type_id: typeId,
        p_employee_id: selectedType.code === "employee" ? employeeId : null,
        p_supplier_id: selectedType.code === "return_supplier" ? supplierId : null,
        p_notes: notes.trim() || null,
        p_items: cleanItems,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Списание сохранено");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["writeoffs", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["writeoff-batches", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["my-batches", warehouse?.id] });
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
          <DialogContent className="max-w-2xl">
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
                      setItems([...items, { batchId: "", quantityUnits: "" }])
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
                        next[idx].batchId = v;
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
                    <Input
                      type="number"
                      placeholder="Кол-во"
                      value={item.quantityUnits}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantityUnits = e.target.value;
                        setItems(next);
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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
                <td className="p-3">{r.write_off_record_items?.length ?? 0}</td>
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
