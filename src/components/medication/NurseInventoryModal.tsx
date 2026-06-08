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

interface Props {
  departmentId: string;
  hospitalId: string;
  onClose: () => void;
}

type Filters = Record<string, string>;

function FilterBar({
  filters, onChange, fields,
}: {
  filters: Filters;
  onChange: (k: string, v: string) => void;
  fields: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {fields.includes("drug") && (
        <Input
          placeholder="Препарат"
          value={filters.drug ?? ""}
          onChange={(e) => onChange("drug", e.target.value)}
          className="w-40 h-8 text-sm"
        />
      )}
      {fields.includes("patient") && (
        <Input
          placeholder="Пациент"
          value={filters.patient ?? ""}
          onChange={(e) => onChange("patient", e.target.value)}
          className="w-40 h-8 text-sm"
        />
      )}
      {fields.includes("patientId") && (
        <Input
          placeholder="ID пациента"
          value={filters.patientId ?? ""}
          onChange={(e) => onChange("patientId", e.target.value)}
          className="w-36 h-8 text-sm"
        />
      )}
      {fields.includes("presDate") && (
        <Input
          type="date"
          value={filters.presDate ?? ""}
          onChange={(e) => onChange("presDate", e.target.value)}
          className="w-40 h-8 text-sm"
        />
      )}
      {fields.includes("transferDate") && (
        <Input
          type="date"
          value={filters.transferDate ?? ""}
          onChange={(e) => onChange("transferDate", e.target.value)}
          className="w-40 h-8 text-sm"
        />
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
  const setFilter = (k: string, v: string) =>
    setFilters((prev) => ({ ...prev, [k]: v }));

  // Transfer-out form state
  const [txBatchId, setTxBatchId] = useState("");
  const [txWarehouseId, setTxWarehouseId] = useState("");
  const [txQty, setTxQty] = useState("");
  const [txSending, setTxSending] = useState(false);

  // Write-off form state
  const [woBatchId, setWoBatchId] = useState("");
  const [woQty, setWoQty] = useState("");
  const [woPatientHospId, setWoPatientHospId] = useState("");
  const [woSending, setWoSending] = useState(false);

  const { data: deptWarehouse } = useQuery({
    queryKey: ["dept-warehouse", departmentId, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("hospital_id", hospitalId)
        .eq("department_id", departmentId)
        .maybeSingle();
      return data;
    },
  });

  const {
    data: prescriptions = [],
    isLoading: presLoading,
    refetch: refetchPres,
  } = useQuery({
    queryKey: ["nurse-inv-prescriptions", departmentId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route, status_code, created_at,
          drug_formulary!drug_formulary_id(trade_name, inn),
          hospitalizations!inner(
            id, department_id,
            patients!inner(id, first_name, last_name, patient_number)
          )
        `)
        .eq("hospital_id", hospitalId)
        .eq("status_code", "in_progress")
        .eq("hospitalizations.department_id", departmentId);
      if (error) throw error;
      return data || [];
    },
  });

  const {
    data: transfers = [],
    isLoading: transLoading,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ["nurse-inv-transfers", deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_records")
        .select(`
          id, sent_at, notes, status,
          from_warehouse:warehouses!from_warehouse_id(id, name),
          transfer_record_items(
            id, quantity_units, drug_formulary_id, product_id,
            drug_formulary(trade_name),
            products(name)
          )
        `)
        .eq("hospital_id", hospitalId)
        .eq("to_warehouse_id", deptWarehouse!.id)
        .eq("status", "pending_acceptance")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allWarehouses = [] } = useQuery({
    queryKey: ["all-dept-warehouses", hospitalId, deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select(`
          id, name,
          warehouse_types!warehouse_type_id(code),
          departments(name)
        `)
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .neq("id", deptWarehouse?.id ?? "");
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
        .eq("warehouse_id", deptWarehouse!.id)
        .eq("hospital_id", hospitalId)
        .gt("quantity_units", 0);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeHosps = [] } = useQuery({
    queryKey: ["nurse-active-hosps-dept", departmentId, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hospitalizations")
        .select("id, patients!inner(first_name, last_name, patient_number)")
        .eq("hospital_id", hospitalId)
        .eq("department_id", departmentId)
        .is("discharged_at", null);
      return data || [];
    },
  });

  // Filtered data
  const filteredPres = useMemo(() => (prescriptions as any[]).filter((p) => {
    const drug = p.drug_formulary?.trade_name?.toLowerCase() ?? "";
    const patient = `${p.hospitalizations?.patients?.last_name ?? ""} ${p.hospitalizations?.patients?.first_name ?? ""}`.toLowerCase();
    const patientNum = p.hospitalizations?.patients?.patient_number?.toLowerCase() ?? "";
    const date = p.created_at?.slice(0, 10) ?? "";
    if (filters.drug && !drug.includes(filters.drug.toLowerCase())) return false;
    if (filters.patient && !patient.includes(filters.patient.toLowerCase())) return false;
    if (filters.patientId && !patientNum.includes(filters.patientId.toLowerCase())) return false;
    if (filters.presDate && date !== filters.presDate) return false;
    return true;
  }), [prescriptions, filters]);

  const filteredTrans = useMemo(() => (transfers as any[]).filter((t) => {
    const drug = (t.transfer_record_items || [])
      .map((i: any) => i.drug_formulary?.trade_name ?? i.products?.name ?? "")
      .join(" ").toLowerCase();
    const date = t.sent_at?.slice(0, 10) ?? "";
    if (filters.drug && !drug.includes(filters.drug.toLowerCase())) return false;
    if (filters.transferDate && date !== filters.transferDate) return false;
    return true;
  }), [transfers, filters]);

  const filteredStock = useMemo(() => (deptStock as any[]).filter((b) => {
    const name = (b.drug_formulary?.trade_name ?? b.products?.name ?? "").toLowerCase();
    if (filters.drug && !name.includes(filters.drug.toLowerCase())) return false;
    return true;
  }), [deptStock, filters]);

  // Actions
  const acceptPrescription = async (id: string) => {
    if (!user) return;
    setBusy((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase.rpc("dispense_prescription", {
        p_prescription_id: id,
        p_hospital_id: hospitalId,
        p_accepted_by: user.id,
      });
      if (error) throw error;
      toast.success("Принято");
      refetchPres(); refetchStock();
      qc.invalidateQueries({ queryKey: ["nurse-prescriptions"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const acceptAllPrescriptions = async () => {
    if (!user || filteredPres.length === 0) return;
    setBusyAll(true);
    let ok = 0, err = 0;
    for (const p of filteredPres) {
      try {
        const { error } = await supabase.rpc("dispense_prescription", {
          p_prescription_id: p.id,
          p_hospital_id: hospitalId,
          p_accepted_by: user.id,
        });
        if (error) throw error;
        ok++;
      } catch { err++; }
    }
    setBusyAll(false);
    if (ok) toast.success(`Принято: ${ok}`);
    if (err) toast.error(`Ошибок: ${err}`);
    refetchPres(); refetchStock();
  };

  const acceptTransfer = async (id: string) => {
    if (!user) return;
    setBusy((prev) => new Set(prev).add(id));
    try {
      const { error } = await supabase.rpc("accept_transfer", {
        p_transfer_record_id: id,
        p_hospital_id: hospitalId,
        p_accepted_by: user.id,
      });
      if (error) throw error;
      toast.success("Перемещение принято");
      refetchTrans(); refetchStock();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const acceptAllTransfers = async () => {
    if (!user || filteredTrans.length === 0) return;
    setBusyAll(true);
    let ok = 0, err = 0;
    for (const t of filteredTrans) {
      try {
        const { error } = await supabase.rpc("accept_transfer", {
          p_transfer_record_id: t.id,
          p_hospital_id: hospitalId,
          p_accepted_by: user.id,
        });
        if (error) throw error;
        ok++;
      } catch { err++; }
    }
    setBusyAll(false);
    if (ok) toast.success(`Принято: ${ok}`);
    if (err) toast.error(`Ошибок: ${err}`);
    refetchTrans(); refetchStock();
  };

  const sendTransfer = async () => {
    if (!user || !deptWarehouse || !txBatchId || !txWarehouseId || !txQty) return;
    setTxSending(true);
    try {
      const batch = (deptStock as any[]).find((b) => b.id === txBatchId);
      const { data: record, error: recErr } = await supabase
        .from("transfer_records")
        .insert({
          hospital_id: hospitalId,
          from_warehouse_id: deptWarehouse.id,
          to_warehouse_id: txWarehouseId,
          status: "pending_acceptance",
          sent_by: user.id,
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (recErr) throw recErr;
      const { error: itemErr } = await supabase
        .from("transfer_record_items")
        .insert({
          transfer_record_id: record.id,
          hospital_id: hospitalId,
          inventory_batch_id: txBatchId,
          product_id: batch?.product_id ?? null,
          drug_formulary_id: batch?.drug_formulary_id ?? null,
          quantity_packages: 0,
          quantity_units: parseFloat(txQty),
        });
      if (itemErr) throw itemErr;
      toast.success("Перемещение отправлено");
      setTxBatchId(""); setTxWarehouseId(""); setTxQty("");
      refetchStock();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTxSending(false);
    }
  };

  const writeOff = async () => {
    if (!user || !woBatchId || !woQty) return;
    setWoSending(true);
    try {
      if (woPatientHospId) {
        const { error } = await supabase.rpc("writeoff_to_patient", {
          p_batch_id: woBatchId,
          p_quantity_units: parseFloat(woQty),
          p_hospitalization_id: woPatientHospId,
          p_hospital_id: hospitalId,
          p_written_off_by: user.id,
        });
        if (error) throw error;
      } else {
        const batch = (deptStock as any[]).find((b) => b.id === woBatchId);
        const { data: woType } = await supabase
          .from("write_off_types")
          .select("id")
          .eq("code", "expired")
          .maybeSingle();
        const { error } = await supabase.rpc("perform_writeoff", {
          p_hospital_id: hospitalId,
          p_warehouse_id: deptWarehouse?.id,
          p_write_off_type_id: woType?.id,
          p_employee_id: null,
          p_supplier_id: null,
          p_notes: null,
          p_written_off_by: user.id,
          p_items: JSON.stringify([{
            batch_id: woBatchId,
            product_id: batch?.product_id ?? null,
            drug_formulary_id: batch?.drug_formulary_id ?? null,
            quantity_packages: 0,
            quantity_units: parseFloat(woQty),
          }]),
        });
        if (error) throw error;
      }
      toast.success("Списано");
      setWoBatchId(""); setWoQty(""); setWoPatientHospId("");
      refetchStock();
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
        <div className="flex items-center gap-4 p-4 border-b">
          <div className="text-lg font-semibold flex-1">Приход / Списание</div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <Tabs defaultValue="prescriptions" className="h-full flex flex-col">
            <TabsList>
              <TabsTrigger value="prescriptions" className="gap-2">
                Назначения {filteredPres.length > 0 && badge(filteredPres.length)}
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-2">
                Перемещения {filteredTrans.length > 0 && badge(filteredTrans.length)}
              </TabsTrigger>
              <TabsTrigger value="writeoff">Списание</TabsTrigger>
              <TabsTrigger value="stock">Склад отделения</TabsTrigger>
            </TabsList>

            {/* TAB 1 */}
            <TabsContent value="prescriptions" className="flex-1 overflow-auto mt-4">
              <FilterBar
                filters={filters}
                onChange={setFilter}
                fields={["drug", "patient", "patientId", "presDate"]}
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
                          <th className={th}>Доза</th>
                          <th className={th}>Путь</th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPres.map((p: any) => {
                          const patient = p.hospitalizations?.patients;
                          const drug = p.drug_formulary;
                          return (
                            <tr key={p.id} className="border-t">
                              <td className={td}>{drug?.trade_name || "—"}</td>
                              <td className={td}>{drug?.inn || "—"}</td>
                              <td className={td}>{patient ? `${patient.last_name} ${patient.first_name}` : "—"}</td>
                              <td className={td}>{patient?.patient_number || "—"}</td>
                              <td className={td}>{p.created_at ? format(new Date(p.created_at), "dd.MM.yyyy") : "—"}</td>
                              <td className={td}>{p.dose} {p.dose_unit}</td>
                              <td className={td}>{p.route || "—"}</td>
                              <td className={td}>
                                <Button size="sm" onClick={() => acceptPrescription(p.id)} disabled={busy.has(p.id) || busyAll}>
                                  {busy.has(p.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Принять"}
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
            <TabsContent value="transfers" className="flex-1 overflow-auto mt-4 space-y-6">
              <FilterBar
                filters={filters}
                onChange={setFilter}
                fields={["drug", "transferDate"]}
              />

              <div>
                <h3 className="font-semibold mb-2">Входящие перемещения</h3>
                {transLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !deptWarehouse ? (
                  <div className="text-center text-muted-foreground py-6">
                    Склад отделения не настроен
                  </div>
                ) : filteredTrans.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    Нет ожидающих перемещений
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end mb-2">
                      <Button onClick={acceptAllTransfers} disabled={busyAll} className="gap-2">
                        {busyAll && <Loader2 className="h-4 w-4 animate-spin" />}
                        Принять все ({filteredTrans.length})
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
                          {filteredTrans.map((t: any) => (
                            <tr key={t.id} className="border-t align-top">
                              <td className={td}>{t.from_warehouse?.name || "—"}</td>
                              <td className={td}>{t.sent_at ? format(new Date(t.sent_at), "dd.MM.yyyy") : "—"}</td>
                              <td className={td}>
                                {(t.transfer_record_items || []).map((i: any) => (
                                  <div key={i.id}>{i.drug_formulary?.trade_name || i.products?.name || "—"}</div>
                                ))}
                              </td>
                              <td className={td}>
                                {(t.transfer_record_items || []).map((i: any) => (
                                  <div key={i.id}>{i.quantity_units}</div>
                                ))}
                              </td>
                              <td className={td}>
                                <Button size="sm" onClick={() => acceptTransfer(t.id)} disabled={busy.has(t.id) || busyAll}>
                                  {busy.has(t.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Принять"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="font-semibold mb-2">Отправить в другой склад</h3>
                <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
                  <div>
                    <Label className="text-xs">Препарат / Товар</Label>
                    <Select value={txBatchId} onValueChange={setTxBatchId}>
                      <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                      <SelectContent>
                        {(deptStock as any[]).map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.drug_formulary?.trade_name || b.products?.name || "—"} ({b.quantity_units} ед.)
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
            </TabsContent>

            {/* TAB 3 */}
            <TabsContent value="writeoff" className="flex-1 overflow-auto mt-4 space-y-6">
              <FilterBar filters={filters} onChange={setFilter} fields={["drug"]} />

              <div className="grid grid-cols-[1fr_120px_1fr_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Препарат / Товар</Label>
                  <Select value={woBatchId} onValueChange={setWoBatchId}>
                    <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                    <SelectContent>
                      {filteredStock.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.drug_formulary?.trade_name || b.products?.name || "—"} ({b.quantity_units} ед.)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Количество</Label>
                  <Input type="number" value={woQty} onChange={(e) => setWoQty(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Пациент (необязательно)</Label>
                  <Select value={woPatientHospId || "none"} onValueChange={(v) => setWoPatientHospId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Без пациента" /></SelectTrigger>
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
                <Button onClick={writeOff} disabled={woSending || !woBatchId || !woQty}>
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
                          <td className={td}>{b.drug_formulary?.trade_name || b.products?.name || "—"}</td>
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
            </TabsContent>

            {/* TAB 4 */}
            <TabsContent value="stock" className="flex-1 overflow-auto mt-4">
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
                          <td className={td}>{b.drug_formulary?.trade_name || b.products?.name || "—"}</td>
                          <td className={td}>{b.drug_formulary?.inn || "—"}</td>
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
          </Tabs>
        </div>
      </div>
    </div>
  );
}
