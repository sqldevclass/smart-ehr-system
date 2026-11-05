import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDays, parseISO, format } from "date-fns";

interface EquipmentForm {
  id: string;
  name: string;
  warehouse: string;
  purchase_date: string | null;
  purchase_price: number | null;
  model: string;
  serial_number: string;
  manufacturer_id: string;
  warranty_expiry_date: string;
  next_service_date: string;
  service_interval_days: string;
  notes: string;
}

interface ServiceForm {
  serviced_at: string;
  serviced_by: string;
  notes: string;
  cost: string;
  next_service_date: string;
}

type Filter = "pending" | "ready" | "all";

function locationLabel(e: any) {
  const w = e.warehouses?.name;
  const d = e.warehouses?.departments?.name;
  if (!w) return "—";
  return d ? `${w} · ${d}` : w;
}

export default function EquipmentPage() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("inventory.manage");
  const qc = useQueryClient();

  const [form, setForm] = useState<EquipmentForm | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [svcOpen, setSvcOpen] = useState<string | null>(null);
  const [svcForm, setSvcForm] = useState<ServiceForm>({
    serviced_at: "",
    serviced_by: "",
    notes: "",
    cost: "",
    next_service_date: "",
  });

  const { data: equipment = [], isFetched } = useQuery({
    queryKey: ["equipment", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select(
          "id, name, model, serial_number, purchase_date, purchase_price, warranty_expiry_date, next_service_date, service_interval_days, notes, is_active, info_status, manufacturer_id, warehouse_id, manufacturers(name), warehouses(name, departments(name))"
        )
        .eq("hospital_id", user!.hospitalId)
        .order("next_service_date", { ascending: true, nullsFirst: false });
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers", user?.hospitalId, "warehouse"],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("manufacturers")
        .select("id, name")
        .eq("scope", "warehouse")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const pendingCount = (equipment as any[]).filter((e) => e.info_status === "pending").length;

  useEffect(() => {
    if (filter === null && isFetched) setFilter(pendingCount > 0 ? "pending" : "all");
  }, [filter, isFetched, pendingCount]);

  const activeFilter: Filter = filter ?? "all";
  const rows = (equipment as any[]).filter((e) =>
    activeFilter === "all" ? true : activeFilter === "pending" ? e.info_status === "pending" : e.info_status === "ready"
  );

  const interval = Number(form?.service_interval_days);
  const formValid =
    !!form &&
    !!form.serial_number.trim() &&
    !!form.warranty_expiry_date &&
    !!form.next_service_date &&
    Number.isInteger(interval) && interval >= 1 && interval <= 3650;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const { error } = await supabase.rpc("complete_equipment_info" as any, {
        p_equipment_id: form.id,
        p_model: form.model.trim() || null,
        p_serial_number: form.serial_number.trim(),
        p_manufacturer_id: form.manufacturer_id || null,
        p_warranty_expiry_date: form.warranty_expiry_date,
        p_next_service_date: form.next_service_date,
        p_service_interval_days: interval,
        p_notes: form.notes.trim() || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["equipment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date();

  const openForm = (e: any) => {
    setForm({
      id: e.id,
      name: e.name,
      warehouse: locationLabel(e),
      purchase_date: e.purchase_date,
      purchase_price: e.purchase_price,
      model: e.model || "",
      serial_number: e.serial_number || "",
      manufacturer_id: e.manufacturer_id || "",
      warranty_expiry_date: e.warranty_expiry_date || "",
      next_service_date: e.next_service_date || "",
      service_interval_days: e.service_interval_days?.toString() || "",
      notes: e.notes || "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-heading text-xl font-bold text-foreground">Инвентаризация</h2>
        <Tabs value={activeFilter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="pending">Ожидают информации ({pendingCount})</TabsTrigger>
            <TabsTrigger value="ready">Готово к работе</TabsTrigger>
            <TabsTrigger value="all">Все</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить информацию</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-md bg-muted/50 p-3 text-sm grid grid-cols-3 gap-2">
                <div><div className="text-xs text-muted-foreground">Название</div>{form.name}</div>
                <div><div className="text-xs text-muted-foreground">Склад</div>{form.warehouse}</div>
                <div><div className="text-xs text-muted-foreground">Дата и цена закупки</div>{form.purchase_date || "—"} · {form.purchase_price ?? "—"}</div>
              </div>
              <div className="space-y-1.5">
                <Label>Модель</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Серийный номер *</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Производитель</Label>
                <Select value={form.manufacturer_id} onValueChange={(v) => setForm({ ...form, manufacturer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Окончание гарантии *</Label>
                <Input type="date" value={form.warranty_expiry_date} onChange={(e) => setForm({ ...form, warranty_expiry_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Дата следующего обслуживания *</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Интервал обслуживания (дней) *</Label>
                <Input type="number" min={1} max={3650} step={1} value={form.service_interval_days} onChange={(e) => setForm({ ...form, service_interval_days: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Заметки</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !formValid}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 w-8"></th>
              <th className="p-3">Название</th>
              <th className="p-3">Модель</th>
              <th className="p-3">Серийный номер</th>
              <th className="p-3">Местонахождение</th>
              <th className="p-3">Производитель</th>
              <th className="p-3">Дата закупки</th>
              <th className="p-3">След. обслуживание</th>
              <th className="p-3">Статус</th>
              <th className="p-3 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: any) => {
              const due = e.next_service_date && parseISO(e.next_service_date) <= addDays(today, 30);
              const ready = e.info_status === "ready";
              const isOpen = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={cn("border-t", due && "bg-orange-500/15", !e.is_active && "opacity-50")}>
                    <td className="p-3">
                      {ready && canManage && (
                        <Button size="icon" variant="ghost" onClick={() => setExpanded(isOpen ? null : e.id)}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      )}
                    </td>
                    <td className="p-3">{e.name}</td>
                    <td className="p-3">{e.model || "—"}</td>
                    <td className="p-3">{e.serial_number || "—"}</td>
                    <td className="p-3">{locationLabel(e)}</td>
                    <td className="p-3">{e.manufacturers?.name || "—"}</td>
                    <td className="p-3">{e.purchase_date || "—"}</td>
                    <td className="p-3">{e.next_service_date || "—"}</td>
                    <td className="p-3">
                      {ready ? <Badge variant="outline">Готово</Badge> : <Badge variant="secondary">Ожидает информации</Badge>}
                    </td>
                    <td className="p-3">
                      {canManage && (
                        ready ? (
                          <Button size="sm" variant="ghost" onClick={() => openForm(e)}>
                            <Pencil className="mr-1 h-3 w-3" /> Изменить
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => openForm(e)}>
                            <Plus className="mr-1 h-3 w-3" /> Добавить информацию
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                  {isOpen && ready && canManage && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={10} className="p-4">
                        <ServiceHistory
                          equipmentId={e.id}
                          onAddOpen={() => {
                            setSvcForm({
                              serviced_at: format(new Date(), "yyyy-MM-dd"),
                              serviced_by: "",
                              notes: "",
                              cost: "",
                              next_service_date: "",
                            });
                            setSvcOpen(e.id);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Нет оборудования.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!svcOpen} onOpenChange={(o) => !o && setSvcOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить запись обслуживания</DialogTitle>
          </DialogHeader>
          <ServiceForm value={svcForm} onChange={setSvcForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcOpen(null)}>Отмена</Button>
            <Button
              onClick={async () => {
                if (!user || !svcOpen) return;
                const { error } = await supabase.from("equipment_service_records").insert({
                  hospital_id: user.hospitalId,
                  equipment_id: svcOpen,
                  serviced_at: svcForm.serviced_at,
                  serviced_by: svcForm.serviced_by || null,
                  notes: svcForm.notes || null,
                  cost: svcForm.cost ? parseFloat(svcForm.cost) : null,
                  next_service_date: svcForm.next_service_date || null,
                  created_by: user.id,
                });
                if (error) { toast.error(error.message); return; }
                toast.success("Запись добавлена");
                setSvcOpen(null);
                qc.invalidateQueries({ queryKey: ["equipment"] });
                qc.invalidateQueries({ queryKey: ["equipment-service", svcOpen] });
              }}
              disabled={!svcForm.serviced_at}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceHistory({ equipmentId, onAddOpen }: { equipmentId: string; onAddOpen: () => void }) {
  const { user } = useAuth();
  const { data: records = [] } = useQuery({
    queryKey: ["equipment-service", equipmentId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment_service_records")
        .select("id, serviced_at, serviced_by, notes, cost, next_service_date")
        .eq("equipment_id", equipmentId)
        .order("serviced_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">История обслуживания</h4>
        <Button size="sm" variant="outline" onClick={onAddOpen}>
          <Plus className="mr-1 h-3 w-3" /> Добавить запись
        </Button>
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">Нет записей.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Дата</th>
              <th className="py-1">Кем</th>
              <th className="py-1">Заметки</th>
              <th className="py-1">Стоимость</th>
              <th className="py-1">След. обслуживание</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.serviced_at}</td>
                <td className="py-1">{r.serviced_by || "—"}</td>
                <td className="py-1">{r.notes || "—"}</td>
                <td className="py-1">{r.cost ?? "—"}</td>
                <td className="py-1">{r.next_service_date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ServiceForm({ value, onChange }: { value: ServiceForm; onChange: (v: ServiceForm) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Дата обслуживания</Label>
        <Input type="date" value={value.serviced_at} onChange={(e) => onChange({ ...value, serviced_at: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Кем выполнено</Label>
        <Input value={value.serviced_by} onChange={(e) => onChange({ ...value, serviced_by: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Заметки</Label>
        <Textarea value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Стоимость</Label>
        <Input type="number" step="0.01" value={value.cost} onChange={(e) => onChange({ ...value, cost: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Дата следующего обслуживания</Label>
        <Input type="date" value={value.next_service_date} onChange={(e) => onChange({ ...value, next_service_date: e.target.value })} />
      </div>
    </div>
  );
}
