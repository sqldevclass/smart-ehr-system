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
import { ChevronDown, ChevronRight, Pencil, Plus, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { noticeState } from "@/lib/equipmentDates";
import { NoticeChips } from "@/components/inventory-shared/NoticeChips";
import { NoticeDateCell } from "@/components/inventory-shared/NoticeDateCell";
import { TableTotalsFooter } from "@/components/inventory-shared/TableTotalsFooter";
import { floorLabel, useClinicStructure } from "@/components/admin/clinic-structure/useClinicStructure";
import { buildEquipmentLabelHtml } from "@/components/inventory-shared/equipmentLabel";
import { LABEL_SIZES, printLabel } from "@/lib/printLabel";

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
  end_of_life_date: string;
  service_notice_days: number;
  warranty_notice_days: number;
  end_of_life_notice_days: number;
}

interface ServiceForm {
  serviced_at: string;
  serviced_by: string;
  notes: string;
  cost: string;
  next_service_date: string;
}

type Filter = "pending" | "ready" | "service" | "warranty" | "eol" | "all" | "writtenoff";

const isActiveUnit = (e: any) => e.is_active && !e.written_off_at;
const soonService = (e: any) => isActiveUnit(e) && noticeState(e.next_service_date, e.service_notice_days ?? 30) !== null;
const soonWarranty = (e: any) => isActiveUnit(e) && noticeState(e.warranty_expiry_date, e.warranty_notice_days ?? 90) !== null;
const soonEol = (e: any) => isActiveUnit(e) && noticeState(e.end_of_life_date, e.end_of_life_notice_days ?? 90) !== null;
const priceFmt = (v: number | null | undefined) => v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function locationLabel(e: any) {
  if (e.written_off_at) return `Списано ${format(new Date(e.written_off_at), "dd.MM.yyyy")}`;
  if (e.transit_transfer_id) return "В пути";
  const w = e.warehouses?.name;
  const d = e.warehouses?.departments?.name;
  if (!w) return "—";
  return d ? `${w} · ${d}` : w;
}

export default function EquipmentPage() {
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission("inventory.manage");
  const qc = useQueryClient();
  const { getFloor } = useClinicStructure();

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
          "id, name, inventory_number, model, serial_number, purchase_date, purchase_price, warranty_expiry_date, next_service_date, service_interval_days, notes, end_of_life_date, service_notice_days, warranty_notice_days, end_of_life_notice_days, is_active, info_status, manufacturer_id, warehouse_id, transit_transfer_id, written_off_at, manufacturers(name), warehouses(name, floor_id, departments(name, floor_id))"
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

  const pendingCount = (equipment as any[]).filter((e) => e.is_active && e.info_status === "pending").length;

  useEffect(() => {
    if (filter === null && isFetched) setFilter(pendingCount > 0 ? "pending" : "all");
  }, [filter, isFetched, pendingCount]);

  const activeFilter: Filter = filter ?? "all";
  const all = equipment as any[];
  const serviceCount = all.filter(soonService).length;
  const warrantyCount = all.filter(soonWarranty).length;
  const eolCount = all.filter(soonEol).length;
  const rows = all.filter((e) =>
    activeFilter === "all" ? true
      : activeFilter === "writtenoff" ? !!e.written_off_at
      : activeFilter === "service" ? soonService(e)
      : activeFilter === "warranty" ? soonWarranty(e)
      : activeFilter === "eol" ? soonEol(e)
      : e.is_active && e.info_status === activeFilter
  );
  const priceTotal = rows.reduce((s, e) => s + (Number(e.purchase_price) || 0), 0);

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
        p_end_of_life_date: form.end_of_life_date || null,
        p_service_notice_days: form.service_notice_days,
        p_warranty_notice_days: form.warranty_notice_days,
        p_end_of_life_notice_days: form.end_of_life_notice_days,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["equipment"] });
      qc.invalidateQueries({ queryKey: ["warehouse-units"] });
      qc.invalidateQueries({ queryKey: ["nurse-inv-units"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      end_of_life_date: e.end_of_life_date || "",
      service_notice_days: e.service_notice_days ?? 30,
      warranty_notice_days: e.warranty_notice_days ?? 90,
      end_of_life_notice_days: e.end_of_life_notice_days ?? 90,
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
            <TabsTrigger value="service">Скоро ТО ({serviceCount})</TabsTrigger>
            <TabsTrigger value="warranty">Скоро окончание гарантии ({warrantyCount})</TabsTrigger>
            <TabsTrigger value="eol">Скоро окончание срока службы ({eolCount})</TabsTrigger>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="writtenoff">Списано</TabsTrigger>
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
                <NoticeChips value={form.warranty_notice_days} onChange={(d) => setForm({ ...form, warranty_notice_days: d })} />
              </div>
              <div className="space-y-1.5">
                <Label>Дата следующего обслуживания *</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
                <NoticeChips value={form.service_notice_days} onChange={(d) => setForm({ ...form, service_notice_days: d })} />
              </div>
              <div className="space-y-1.5">
                <Label>Интервал обслуживания (дней) *</Label>
                <Input type="number" min={1} max={3650} step={1} value={form.service_interval_days} onChange={(e) => setForm({ ...form, service_interval_days: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Срок службы до (ликвидация)</Label>
                <Input type="date" value={form.end_of_life_date} onChange={(e) => setForm({ ...form, end_of_life_date: e.target.value })} />
                <NoticeChips value={form.end_of_life_notice_days} onChange={(d) => setForm({ ...form, end_of_life_notice_days: d })} />
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
              <th className="p-3">Инв. №</th>
              <th className="p-3">Модель</th>
              <th className="p-3">Серийный номер</th>
              <th className="p-3">Местонахождение</th>
              <th className="p-3">Производитель</th>
              <th className="p-3">Дата закупки</th>
              <th className="p-3 text-right">Цена</th>
              <th className="p-3">След. обслуживание</th>
              <th className="p-3">Гарантия до</th>
              <th className="p-3">Срок службы до</th>
              <th className="p-3">Статус</th>
              <th className="p-3 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e: any) => {
              const due = noticeState(e.next_service_date, e.service_notice_days ?? 30);
              const writtenOff = !!e.written_off_at;
              const ready = e.info_status === "ready" && !writtenOff;
              const isOpen = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={cn("border-t", due === "soon" && "bg-orange-500/15", due === "overdue" && "bg-destructive/10", !e.is_active && "opacity-50")}>
                    <td className="p-3">
                      {ready && canManage && (
                        <Button size="icon" variant="ghost" onClick={() => setExpanded(isOpen ? null : e.id)}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      )}
                    </td>
                    <td className="p-3">{e.name}</td>
                    <td className="p-3 font-mono">{e.inventory_number || "—"}</td>
                    <td className="p-3">{e.model || "—"}</td>
                    <td className="p-3">{e.serial_number || "—"}</td>
                    <td className="p-3">{locationLabel(e)}</td>
                    <td className="p-3">{e.manufacturers?.name || "—"}</td>
                    <td className="p-3">{e.purchase_date || "—"}</td>
                    <td className="p-3 text-right">{priceFmt(e.purchase_price)}</td>
                    <td className="p-3"><NoticeDateCell date={e.next_service_date} noticeDays={e.service_notice_days ?? 30} /></td>
                    <td className="p-3"><NoticeDateCell date={e.warranty_expiry_date} noticeDays={e.warranty_notice_days ?? 90} overdueLabel="истёк" /></td>
                    <td className="p-3"><NoticeDateCell date={e.end_of_life_date} noticeDays={e.end_of_life_notice_days ?? 90} overdueLabel="истёк" /></td>
                    <td className="p-3">
                      {writtenOff ? <Badge variant="secondary">Списано</Badge> : ready ? <Badge variant="outline">Готово</Badge> : <Badge variant="secondary">Ожидает информации</Badge>}
                    </td>
                    <td className="p-3">
                      {isActiveUnit(e) && (
                        <Button variant="ghost" size="icon" aria-label="Печать этикетки"
                          title={e.transit_transfer_id ? "Оборудование в пути" : "Печать этикетки"}
                          disabled={!!e.transit_transfer_id}
                          onClick={() => {
                            const warehouse = e.warehouses;
                            const floor = getFloor(warehouse?.floor_id ?? warehouse?.departments?.floor_id);
                            printLabel(buildEquipmentLabelHtml({
                              name: e.name || "",
                              floorText: floor ? floorLabel(floor) : "",
                              locationName: warehouse?.departments?.name || warehouse?.name || "",
                              inventoryNumber: e.inventory_number || "",
                            }), LABEL_SIZES.equipment);
                          }}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && !writtenOff && (
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
                      <td colSpan={14} className="p-4">
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
              <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">Нет оборудования.</td></tr>
            )}
          </tbody>
          <TableTotalsFooter
            label={`Итого: ${rows.length} ед.`}
            cells={[
              { colSpan: 8 },
              { content: priceFmt(priceTotal), align: "right" },
              { colSpan: 5 },
            ]}
          />
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
