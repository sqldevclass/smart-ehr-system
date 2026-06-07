import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  departmentId: string;
  hospitalId: string;
  onClose: () => void;
}

export default function NurseDrugAcceptModal({
  departmentId,
  hospitalId,
  onClose,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [accepting, setAccepting] = useState<Set<string>>(new Set());
  const [acceptingAll, setAcceptingAll] = useState(false);

  const {
    data: prescriptions = [],
    isLoading: presLoading,
    refetch: refetchPres,
  } = useQuery({
    queryKey: ["nurse-dept-prescriptions", departmentId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(
          `
          id, dose, dose_unit, route, status_code,
          drug_formulary!drug_formulary_id(trade_name, inn, unit_id,
            units_of_measurement(abbreviation)),
          hospitalizations!hospitalization_id(
            department_id,
            patients!inner(first_name, last_name, patient_number)
          )
        `
        )
        .eq("hospital_id", hospitalId)
        .eq("status_code", "in_progress")
        .eq("hospitalizations.department_id", departmentId);
      if (error) throw error;
      return data || [];
    },
  });

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
    data: transfers = [],
    isLoading: transLoading,
    refetch: refetchTrans,
  } = useQuery({
    queryKey: ["nurse-dept-transfers", deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_records")
        .select(
          `
          id, sent_at, notes,
          from_warehouse:warehouses!from_warehouse_id(name),
          transfer_record_items(
            id, quantity_units,
            drug_formulary(trade_name),
            products(name)
          )
        `
        )
        .eq("hospital_id", hospitalId)
        .eq("to_warehouse_id", deptWarehouse!.id)
        .eq("status", "pending_acceptance")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const acceptPrescription = async (prescriptionId: string) => {
    if (!user) return;
    setAccepting((prev) => new Set(prev).add(prescriptionId));
    try {
      const { error } = await supabase.rpc("dispense_prescription", {
        p_prescription_id: prescriptionId,
        p_hospital_id: hospitalId,
        p_accepted_by: user.id,
      });
      if (error) throw error;
      toast.success("Препарат принят");
      refetchPres();
      qc.invalidateQueries({ queryKey: ["nurse-prescriptions"] });
    } catch (e: any) {
      toast.error(e.message || "Ошибка при принятии");
    } finally {
      setAccepting((prev) => {
        const next = new Set(prev);
        next.delete(prescriptionId);
        return next;
      });
    }
  };

  const acceptAllPrescriptions = async () => {
    if (!user || prescriptions.length === 0) return;
    setAcceptingAll(true);
    let successCount = 0;
    let errorCount = 0;
    for (const p of prescriptions as any[]) {
      try {
        const { error } = await supabase.rpc("dispense_prescription", {
          p_prescription_id: p.id,
          p_hospital_id: hospitalId,
          p_accepted_by: user.id,
        });
        if (error) throw error;
        successCount++;
      } catch {
        errorCount++;
      }
    }
    setAcceptingAll(false);
    if (successCount > 0) toast.success(`Принято: ${successCount}`);
    if (errorCount > 0) toast.error(`Ошибок: ${errorCount}`);
    refetchPres();
    qc.invalidateQueries({ queryKey: ["nurse-prescriptions"] });
  };

  const acceptTransfer = async (transferId: string) => {
    if (!user) return;
    setAccepting((prev) => new Set(prev).add(transferId));
    try {
      const { error } = await supabase.rpc("accept_transfer", {
        p_transfer_record_id: transferId,
        p_hospital_id: hospitalId,
        p_accepted_by: user.id,
      });
      if (error) throw error;
      toast.success("Перемещение принято");
      refetchTrans();
    } catch (e: any) {
      toast.error(e.message || "Ошибка при принятии");
    } finally {
      setAccepting((prev) => {
        const next = new Set(prev);
        next.delete(transferId);
        return next;
      });
    }
  };

  const acceptAllTransfers = async () => {
    if (!user || transfers.length === 0) return;
    setAcceptingAll(true);
    let successCount = 0;
    let errorCount = 0;
    for (const t of transfers as any[]) {
      try {
        const { error } = await supabase.rpc("accept_transfer", {
          p_transfer_record_id: t.id,
          p_hospital_id: hospitalId,
          p_accepted_by: user.id,
        });
        if (error) throw error;
        successCount++;
      } catch {
        errorCount++;
      }
    }
    setAcceptingAll(false);
    if (successCount > 0) toast.success(`Принято: ${successCount}`);
    if (errorCount > 0) toast.error(`Ошибок: ${errorCount}`);
    refetchTrans();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg flex flex-col"
        style={{
          width: "calc(100vw - 32px)",
          height: "calc(100vh - 32px)",
        }}
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
                Назначения
                {prescriptions.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs">
                    {prescriptions.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-2">
                Перемещения
                {transfers.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs">
                    {transfers.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="prescriptions"
              className="flex-1 overflow-auto mt-4"
            >
              {presLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : prescriptions.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  Нет препаратов в ожидании
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      onClick={acceptAllPrescriptions}
                      disabled={acceptingAll}
                      className="gap-2"
                    >
                      {acceptingAll && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Принять все ({prescriptions.length})
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(prescriptions as any[]).map((p: any) => {
                      const patient = p.hospitalizations?.patients;
                      const drug = p.drug_formulary;
                      const isAccepting = accepting.has(p.id);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 p-3 border rounded-lg"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">
                              {drug?.trade_name}
                              {drug?.inn ? (
                                <span className="text-muted-foreground font-normal">
                                  {" "}
                                  ({drug.inn})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {p.dose} {p.dose_unit} · {p.route}
                            </div>
                            <div className="text-sm">
                              Пациент: {patient?.last_name} {patient?.first_name}
                              {" · "}П# {patient?.patient_number}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => acceptPrescription(p.id)}
                            disabled={isAccepting || acceptingAll}
                          >
                            {isAccepting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Принять"
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="transfers"
              className="flex-1 overflow-auto mt-4"
            >
              {transLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !deptWarehouse ? (
                <div className="text-center text-muted-foreground py-12">
                  Склад отделения не настроен
                </div>
              ) : transfers.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  Нет ожидающих перемещений
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      onClick={acceptAllTransfers}
                      disabled={acceptingAll}
                      className="gap-2"
                    >
                      {acceptingAll && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Принять все ({transfers.length})
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {(transfers as any[]).map((t: any) => (
                      <div key={t.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">
                              Из: {t.from_warehouse?.name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {t.sent_at
                                ? new Date(t.sent_at).toLocaleDateString("ru-RU")
                                : "—"}
                            </div>
                            {t.notes && (
                              <div className="text-sm mt-1">{t.notes}</div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => acceptTransfer(t.id)}
                            disabled={accepting.has(t.id) || acceptingAll}
                          >
                            {accepting.has(t.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Принять"
                            )}
                          </Button>
                        </div>
                        <div className="border-t pt-2 space-y-1">
                          {(t.transfer_record_items || []).map((item: any) => (
                            <div
                              key={item.id}
                              className="flex justify-between text-sm"
                            >
                              <span>
                                {item.drug_formulary?.trade_name ||
                                  item.products?.name ||
                                  "—"}
                              </span>
                              <span className="text-muted-foreground">
                                {item.quantity_units} ед.
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
