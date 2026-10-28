import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import SearchInput from "@/components/shared/SearchInput";
import HighlightMatch from "@/components/shared/HighlightMatch";
import { matchesSearch } from "@/lib/search";
import { matchesPatientSearch, PATIENT_SEARCH_PLACEHOLDER } from "@/lib/patientSearch";
import { PeriodFilter, matchesRange, rangeBounds, type PeriodState } from "@/components/shared/PeriodFilter";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import NurseTransfersPanel, { filterNurseTransfers, useNurseIncomingTransfers } from "./NurseTransfersPanel";

interface Props {
  departmentId: string;
  hospitalId: string;
  onClose: () => void;
}

type Filters = Record<string, string>;

function FilterBar({
  filters, onChange, fields, period, onPeriodChange,
}: {
  filters: Filters;
  onChange: (k: string, v: string) => void;
  fields: string[];
  period?: PeriodState;
  onPeriodChange?: (s: PeriodState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fields.includes("drug") && (
        <SearchInput
          placeholder="Препарат или МНН"
          value={filters.drug ?? ""}
          onChange={(v) => onChange("drug", v)}
          className="w-56"
          inputClassName="h-8 text-sm"
        />
      )}
      {fields.includes("patient") && (
        <SearchInput
          placeholder={PATIENT_SEARCH_PLACEHOLDER.ru}
          value={filters.patient ?? ""}
          onChange={(v) => onChange("patient", v)}
          className="w-80"
          inputClassName="h-8 text-sm"
        />
      )}
      {fields.includes("period") && period && onPeriodChange && (
        <PeriodFilter clearable value={period} onChange={onPeriodChange} />
      )}
    </div>
  );
}

export default function NurseInventoryModal({
  departmentId, hospitalId, onClose,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [busyAll, setBusyAll] = useState(false);
  const [filters, setFilters] = useState<Filters>({});
  const [period, setPeriod] = usePeriodFilter(false);
  const [activeTab, setActiveTab] = useState("prescriptions");
  const setFilter = (k: string, v: string) =>
    setFilters((prev) => ({ ...prev, [k]: v }));

  // Write-off form state
  const [woBatchId, setWoBatchId] = useState("");
  const [woQty, setWoQty] = useState("");
  const [woPatientHospId, setWoPatientHospId] = useState("");
  const [woSending, setWoSending] = useState(false);

  const { data: deptWarehouse } = useQuery({
    queryKey: ["dept-warehouse", departmentId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) { toast.error(error.message); throw error; }
      return data;
    },
  });

  const {
    data: pendingSlots = [],
    isLoading: presLoading,
    refetch: refetchPres,
  } = useQuery({
    queryKey: ["nurse-inv-slots", departmentId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, scheduled_at, dispense_status,
          drug_prescriptions!prescription_id(
            id, dose, dose_unit, route, created_at,
            drug_formulary!drug_formulary_id(trade_name, inn)
          ),
          hospitalizations!inner(
            id, department_id,
            patients!inner(id, first_name, last_name, middle_name, patient_number, date_of_birth, phone)
          )
        `)
        .eq("hospital_id", hospitalId)
        .eq("dispense_status", "in_progress")
        .eq("hospitalizations.department_id", departmentId);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: transfers = [] } = useNurseIncomingTransfers(hospitalId, deptWarehouse?.id);
  const { data: department } = useQuery({
    queryKey: ["nurse-inv-department", departmentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("name").eq("id", departmentId).maybeSingle();
      if (error) { toast.error(error.message); throw error; }
      return data;
    },
  });

  const { data: allWarehouses = [] } = useQuery({
    queryKey: ["all-dept-warehouses", hospitalId, deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select(`
          id, name,
          warehouse_types!warehouse_type_id(code),
          departments(name)
        `)
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .neq("id", deptWarehouse?.id ?? "");
      if (error) { toast.error(error.message); throw error; }
      return (data || []).filter((w: any) =>
        w.warehouse_types?.code === "department"
      );
    },
  });

  const {
    data: deptStock = [],
    isLoading: stockLoading,
    refetch: refetchStock,
  } = useQuery({
    queryKey: ["nurse-inv-stock", deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(`
          id, quantity_units, series_number, expiry_date, selling_price,
          drug_formulary_id, product_id,
          drug_formulary(trade_name, inn),
          products(name)
        `)
        .eq("warehouse_id", deptWarehouse?.id ?? "")
        .eq("hospital_id", hospitalId)
        .gt("quantity_units", 0);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: activeHosps = [] } = useQuery({
    queryKey: ["nurse-active-hosps-dept", departmentId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, patients!inner(first_name, last_name, patient_number)")
        .eq("hospital_id", hospitalId)
        .eq("department_id", departmentId)
        .is("discharged_at", null);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  // Write-off history (Списание tab)
  const woBounds = rangeBounds(period);
  const { data: woRecords = [], isLoading: woRecLoading, error: woRecError } = useQuery({
    queryKey: ["writeoffs", deptWarehouse?.id, "nurse-records", woBounds.from ?? null, woBounds.to ?? null],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      let q = supabase
        .from("write_off_records")
        .select("id, written_off_at, notes, write_off_types(name_ru), profiles!write_off_records_written_off_by_fkey(full_name), write_off_record_items(id, quantity_units, products(name), drug_formulary(trade_name))")
        .eq("warehouse_id", deptWarehouse?.id ?? "");
      if (woBounds.from) q = q.gte("written_off_at", woBounds.from);
      if (woBounds.to) q = q.lte("written_off_at", woBounds.to);
      const { data, error } = await q.order("written_off_at", { ascending: false }).limit(500);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });
  const { data: woPatient = [], isLoading: woPatLoading, error: woPatError } = useQuery({
    queryKey: ["writeoffs", deptWarehouse?.id, "nurse-patient", woBounds.from ?? null, woBounds.to ?? null],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      let q = supabase
        .from("inventory_transactions")
        .select("id, performed_at, quantity_units, reference_id, products(name), drug_formulary(trade_name), profiles(full_name)")
        .eq("warehouse_id", deptWarehouse?.id ?? "")
        .eq("source_type", "consumable");
      if (woBounds.from) q = q.gte("performed_at", woBounds.from);
      if (woBounds.to) q = q.lte("performed_at", woBounds.to);
      const { data, error } = await q.order("performed_at", { ascending: false }).limit(500);
      if (error) { toast.error(error.message); throw error; }
      const rows = data || [];
      const ids = [...new Set(rows.map((r: any) => r.reference_id).filter(Boolean))];
      const patients = new Map<string, string>();
      if (ids.length) {
        const { data: hosps, error: hErr } = await supabase
          .from("hospitalizations")
          .select("id, patients(first_name, last_name, patient_number)")
          .in("id", ids);
        if (hErr) { toast.error(hErr.message); throw hErr; }
        for (const h of (hosps || []) as any[]) {
          const p = h.patients;
          if (p) patients.set(h.id, `${p.last_name ?? ""} ${p.first_name ?? ""} · ${p.patient_number ?? ""}`.trim());
        }
      }
      return rows.map((r: any) => ({ ...r, patient_label: patients.get(r.reference_id) ?? null }));
    },
  });
  const writeoffsLoading = woRecLoading || woPatLoading;
  const writeoffsError = woRecError || woPatError;
  const writeoffRows = useMemo(() => {
    const rows: { key: string; at: string | null; type: string; by: string | null; notes: string | null; items: { name: string; qty: number }[] }[] = [];
    for (const w of woRecords as any[]) {
      rows.push({
        key: `r-${w.id}`, at: w.written_off_at, type: w.write_off_types?.name_ru || "—",
        by: w.profiles?.full_name ?? null, notes: w.notes,
        items: (w.write_off_record_items || []).map((i: any) => ({ name: i.drug_formulary?.trade_name || i.products?.name || "—", qty: Number(i.quantity_units) })),
      });
    }
    for (const t of woPatient as any[]) {
      rows.push({
        key: `t-${t.id}`, at: t.performed_at, type: "Пациенту",
        by: t.profiles?.full_name ?? null, notes: t.patient_label,
        items: [{ name: t.drug_formulary?.trade_name || t.products?.name || "—", qty: Math.abs(Number(t.quantity_units)) }],
      });
    }
    return rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [woRecords, woPatient]);

  // Filtered data
  const filteredPres = useMemo(() => (pendingSlots as any[]).filter((s) => {
    const drug = s.drug_prescriptions?.drug_formulary;
    if (!matchesSearch([drug?.trade_name, drug?.inn], filters.drug ?? "")) return false;
    if (!matchesPatientSearch(s.hospitalizations?.patients, filters.patient ?? "")) return false;
    if (!matchesRange(s.drug_prescriptions?.created_at, period)) return false;
    return true;
  }), [pendingSlots, filters, period]);

  const filteredTrans = useMemo(() => filterNurseTransfers(transfers, filters)
    .filter((transfer: any) => transfer.status === "pending_acceptance"), [transfers, filters]);

  const filteredStock = useMemo(() => (deptStock as any[]).filter((b) =>
    matchesSearch([b.drug_formulary?.trade_name, b.drug_formulary?.inn, b.products?.name], filters.drug ?? "")
  ), [deptStock, filters]);

  const refreshInventory = () => {
    refetchPres(); refetchStock();
    qc.invalidateQueries({ queryKey: ["nurse-inv-transfers", deptWarehouse?.id] });
    if (!deptWarehouse) return;
    for (const key of ["stock", "transfers", "my-batches", "writeoff-batches"]) qc.invalidateQueries({ queryKey: [key, deptWarehouse.id] });
    for (const key of ["nurse-prescriptions", "nurse-admin-slots", "all-slots"]) qc.invalidateQueries({ queryKey: [key] });
  };

  // Actions
  const acceptSlot = async (slotId: string) => {
    if (!user) return;
    setBusy((prev) => new Set(prev).add(slotId));
    try {
      const { error } = await supabase.rpc("dispense_slot", {
        p_slot_id: slotId,
      });
      if (error) throw error;
      toast.success("Принято");
      refreshInventory();
      qc.invalidateQueries({ queryKey: ["nurse-prescriptions"] });
      qc.invalidateQueries({ queryKey: ["nurse-admin-slots"] });
      qc.invalidateQueries({ queryKey: ["all-slots"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((prev) => { const n = new Set(prev); n.delete(slotId); return n; });
    }
  };

  const acceptAllPrescriptions = async () => {
    if (!user || filteredPres.length === 0) return;
    setBusyAll(true);
    let ok = 0, err = 0;
    for (const s of filteredPres) {
      try {
        const { error } = await supabase.rpc("dispense_slot", {
          p_slot_id: s.id,
        });
        if (error) throw error;
        ok++;
      } catch (e: any) { err++; toast.error(e.message); }
    }
    setBusyAll(false);
    if (ok) toast.success(`Принято: ${ok}`);
    if (err) toast.error(`Ошибок: ${err}`);
    refreshInventory();
  };

  const writeOff = async () => {
    if (!user || !deptWarehouse || !woBatchId || !woQty) return;
    setWoSending(true);
    try {
      const batch = (deptStock as any[]).find((b) => b.id === woBatchId);
      const qty = Number(woQty);
      if (!batch || !Number.isFinite(qty) || qty <= 0) throw new Error("Укажите количество больше нуля");
      if (qty > Number(batch.quantity_units)) throw new Error("Количество превышает доступный остаток партии");
      if (woPatientHospId) {
        const { error } = await supabase.rpc("writeoff_to_patient", {
          p_batch_id: woBatchId, p_quantity_units: qty, p_hospitalization_id: woPatientHospId, p_notes: null,
        });
        if (error) throw error;
      } else {
        const { data: woType, error: typeError } = await supabase.from("write_off_types").select("id").eq("code", "act").maybeSingle();
        if (typeError) throw typeError;
        if (!woType) throw new Error("Тип списания «По акту» (act) не найден");
        const { error } = await supabase.rpc("perform_writeoff", {
          p_warehouse_id: deptWarehouse.id, p_write_off_type_id: woType.id,
          p_employee_id: null, p_supplier_id: null, p_notes: null,
          p_items: [{ batch_id: woBatchId, quantity_units: qty }],
        });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["writeoffs", deptWarehouse.id] });
      toast.success("Списано");
      setWoBatchId(""); setWoQty(""); setWoPatientHospId("");
      refreshInventory();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setWoSending(false);
    }
  };

  const th = "p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide";
  const td = "p-3 text-sm";

  const badge = (n: number) => (
    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs">
      {n}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg flex flex-col"
        style={{ width: "calc(100vw - 32px)", height: "calc(100vh - 32px)" }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full min-h-0 flex flex-col">
          <div className="flex flex-wrap shrink-0 items-center gap-4 px-4 py-2.5 border-b">
            <div className="shrink-0">
              <div className="text-lg font-semibold">Приход / Списание</div>
              <div className="text-sm text-muted-foreground">Склад: {deptWarehouse?.name || "—"} · Отделение: {department?.name || "—"}</div>
            </div>
            <TabsList className="mx-auto">
              <TabsTrigger value="prescriptions" className="gap-2">
                Назначения {filteredPres.length > 0 && badge(filteredPres.length)}
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-2">
                Перемещения {filteredTrans.length > 0 && badge(filteredTrans.length)}
              </TabsTrigger>
              <TabsTrigger value="writeoff">Списание</TabsTrigger>
              <TabsTrigger value="stock">Склад отделения</TabsTrigger>
            </TabsList>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-3">


            {/* TAB 1 */}
            <TabsContent value="prescriptions" className="flex-1 min-h-0 overflow-y-auto mt-2">
              <FilterBar
                filters={filters}
                onChange={setFilter}
                fields={["drug", "patient", "period"]}
                period={period}
                onPeriodChange={setPeriod}
              />
              {presLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPres.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  Нет назначений в ожидании
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-2">
                    <Button onClick={acceptAllPrescriptions} disabled={busyAll} className="gap-2">
                      {busyAll && <Loader2 className="h-4 w-4 animate-spin" />}
                      Принять все ({filteredPres.length})
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className={th}>Препарат</th>
                          <th className={th}>МНН</th>
                          <th className={th}>Пациент</th>
                          <th className={th}>ID пациента</th>
                          <th className={th}>Дата назначения</th>
                          <th className={th}>Время</th>
                          <th className={th}>Доза</th>
                          <th className={th}>Путь</th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPres.map((s: any) => {
                          const patient = s.hospitalizations?.patients;
                          const pres = s.drug_prescriptions;
                          const drug = pres?.drug_formulary;
                          return (
                            <tr key={s.id} className="border-t">
                              <td className={td}><HighlightMatch text={drug?.trade_name} term={filters.drug ?? ""} fallback="—" /></td>
                              <td className={td}><HighlightMatch text={drug?.inn} term={filters.drug ?? ""} fallback="—" /></td>
                              <td className={td}><HighlightMatch text={patient ? `${patient.last_name} ${patient.first_name}` : ""} term={filters.patient ?? ""} fallback="—" /></td>
                              <td className={td}><HighlightMatch text={patient?.patient_number} term={filters.patient ?? ""} fallback="—" /></td>
                              <td className={td}>{pres?.created_at ? format(new Date(pres.created_at), "dd.MM.yyyy") : "—"}</td>
                              <td className={td}>{s.scheduled_at ? format(new Date(s.scheduled_at), "dd.MM HH:mm") : "—"}</td>
                              <td className={td}>{pres?.dose} {pres?.dose_unit}</td>
                              <td className={td}>{pres?.route || "—"}</td>
                              <td className={td}>
                                <Button size="sm" onClick={() => acceptSlot(s.id)} disabled={busy.has(s.id) || busyAll}>
                                  {busy.has(s.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Принять"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </TabsContent>

            {/* TAB 2 */}
            <TabsContent value="transfers" className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-3">
              <NurseTransfersPanel
                hospitalId={hospitalId}
                deptWarehouse={deptWarehouse}
                stock={deptStock}
                allWarehouses={allWarehouses}
                filters={filters}
                period={period}
                toolbarLeft={<FilterBar filters={filters} onChange={setFilter} fields={["drug", "period"]} period={period} onPeriodChange={setPeriod} />}
              />
            </TabsContent>

            {/* TAB 3 */}
            <TabsContent value="writeoff" className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-3">
              <FilterBar filters={{}} onChange={setFilter} fields={["period"]} period={period} onPeriodChange={setPeriod} />
              <div className="grid grid-cols-[140px_1fr_90px_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Поиск</Label>
                  <Input
                    placeholder="Препарат"
                    value={filters.drug ?? ""}
                    onChange={(e) => setFilter("drug", e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Препарат / Товар</Label>
                  <Select value={woBatchId} onValueChange={setWoBatchId}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Выберите" /></SelectTrigger>
                    <SelectContent>
                      {filteredStock.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.drug_formulary?.trade_name || b.products?.name || "—"} — серия {b.series_number || "—"}, годен до {b.expiry_date || "—"}, доступно {b.quantity_units} ед.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Кол-во</Label>
                  <Input
                    type="number"
                    value={woQty}
                    onChange={(e) => setWoQty(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Пациент (необязательно)</Label>
                  <Select value={woPatientHospId || "none"} onValueChange={(v) => setWoPatientHospId(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Без пациента" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Без пациента</SelectItem>
                      {(activeHosps as any[]).map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.patients?.last_name} {h.patients?.first_name} · {h.patients?.patient_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-8" onClick={writeOff} disabled={woSending || !woBatchId || !woQty}>
                  {woSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Списать"}
                </Button>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Доступный запас</h3>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className={th}>Препарат / Товар</th>
                        <th className={th}>Серия</th>
                        <th className={th}>Годен до</th>
                        <th className={th}>Кол-во</th>
                        <th className={th}>Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.length === 0 ? (
                        <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Нет запасов</td></tr>
                      ) : filteredStock.map((b: any) => (
                        <tr key={b.id} className="border-t">
                          <td className={td}><HighlightMatch text={b.drug_formulary?.trade_name || b.products?.name} term={filters.drug ?? ""} fallback="—" /></td>
                          <td className={td}>{b.series_number || "—"}</td>
                          <td className={td}>{b.expiry_date || "—"}</td>
                          <td className={td}>{b.quantity_units}</td>
                          <td className={td}>{b.selling_price ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Списано</h3>
                {writeoffsError && <p role="alert" className="text-destructive text-sm mb-2">{(writeoffsError as Error).message}</p>}
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className={th}>Дата</th>
                        <th className={th}>Тип</th>
                        <th className={th}>Списал</th>
                        <th className={th}>Примечание</th>
                        <th className={th}>Позиции</th>
                      </tr>
                    </thead>
                    <tbody>
                      {writeoffsLoading ? (
                        <tr><td colSpan={5} className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></td></tr>
                      ) : writeoffRows.length === 0 ? (
                        <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Нет списаний</td></tr>
                      ) : writeoffRows.map((w) => (
                        <tr key={w.key} className="border-t align-top">
                          <td className={td}>{w.at ? format(new Date(w.at), "dd.MM.yyyy HH:mm") : "—"}</td>
                          <td className={td}>{w.type}</td>
                          <td className={td}>{w.by || "—"}</td>
                          <td className={td}>{w.notes || "—"}</td>
                          <td className={td}>
                            {w.items.length === 0 ? "—" : w.items.map((it, idx) => (
                              <div key={idx}>{it.name} — {it.qty} ед.</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* TAB 4 */}
            <TabsContent value="stock" className="flex-1 min-h-0 overflow-y-auto mt-2 space-y-2">
              <FilterBar filters={filters} onChange={setFilter} fields={["drug"]} />
              {stockLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !deptWarehouse ? (
                <div className="text-center text-muted-foreground py-12">
                  Склад отделения не настроен
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className={th}>Препарат / Товар</th>
                        <th className={th}>МНН</th>
                        <th className={th}>Серия</th>
                        <th className={th}>Годен до</th>
                        <th className={th}>Кол-во</th>
                        <th className={th}>Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.length === 0 ? (
                        <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Склад пуст</td></tr>
                      ) : filteredStock.map((b: any) => (
                        <tr key={b.id} className="border-t">
                          <td className={td}><HighlightMatch text={b.drug_formulary?.trade_name || b.products?.name} term={filters.drug ?? ""} fallback="—" /></td>
                          <td className={td}><HighlightMatch text={b.drug_formulary?.inn} term={filters.drug ?? ""} fallback="—" /></td>
                          <td className={td}>{b.series_number || "—"}</td>
                          <td className={td}>{b.expiry_date || "—"}</td>
                          <td className={td}>{b.quantity_units}</td>
                          <td className={td}>{b.selling_price ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
