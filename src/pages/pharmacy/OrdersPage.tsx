import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import StatusBadge from "@/components/medication/StatusBadge";

const ROUTES: Record<string, string> = {
  per_os: "Перорально",
  iv_bolus: "В/в болюсно",
  iv_drip: "В/в капельно",
  im: "В/м",
  sc: "Подкожно",
  nasal: "Назально",
  rectal: "Ректально",
  nasogastric: "Назогастрально",
  sublingual: "Подъязык",
  ear: "В ухо",
  eye: "В глаз",
  vaginal: "Вагинально",
  epidural: "Эпидурально",
  transdermal: "Трансдермально",
  intrathecal: "Интратекально",
  intraosseous: "Внутрикостно",
  endotracheal: "Эндотрахеально",
  other: "Другое",
};

type StatusFilter = "all" | "preliminary" | "in_progress" | "return";

export default function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const { data: orders = [] } = useQuery({
    queryKey: ["pharmacist-orders", user?.hospitalId, statusFilter],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const codes =
        statusFilter === "all"
          ? ["preliminary", "in_progress", "return"]
          : [statusFilter];
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route,
          schedule_times, duration_days,
          food_rule, prescription_type,
          prn_condition, notes,
          status_code, prescribed_at,
          mix_dose,
          drug_formulary!drug_formulary_id(
            id, trade_name, inn, dose),
          mix_drug:drug_formulary!mix_with_drug_id(
            trade_name, inn),
          hospitalizations!hospitalization_id(
            id,
            departments!department_id(name),
            patients!patient_id(
              id, first_name, last_name,
              date_of_birth, gender,
              patient_number,
              patient_allergies(
                id, allergy_type, severity,
                description, reaction)
            )
          ),
          profiles!prescribed_by(full_name),
          drug_administration_slots(id)
        `)
        .eq("hospital_id", user!.hospitalId)
        .in("status_code", codes)
        .order("prescribed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["drug-interactions", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_interactions")
        .select(`
          drug_a_id, drug_b_id,
          clinical_effect, clinical_significance
        `)
        .eq("hospital_id", user!.hospitalId);
      if (error) throw error;
      return data || [];
    },
  });

  const hasAllergyWarning = (p: any) => {
    const allergies = p.hospitalizations?.patients?.patient_allergies ?? [];
    const drugName = p.drug_formulary?.trade_name?.toLowerCase() ?? "";
    const inn = p.drug_formulary?.inn?.toLowerCase() ?? "";
    return allergies.some(
      (a: any) =>
        (a.allergy_type &&
          drugName.includes(a.allergy_type.toLowerCase())) ||
        (a.allergy_type && inn.includes(a.allergy_type.toLowerCase())),
    );
  };

  const hasInteractionWarning = (p: any, allOrders: any[]) => {
    const samePatientOrders = allOrders.filter(
      (o: any) =>
        o.hospitalizations?.patients?.id ===
          p.hospitalizations?.patients?.id &&
        o.id !== p.id &&
        o.status_code !== "cancelled",
    );
    return samePatientOrders.some((o: any) =>
      interactions.some(
        (i: any) =>
          (i.drug_a_id === p.drug_formulary?.id &&
            i.drug_b_id === o.drug_formulary?.id) ||
          (i.drug_b_id === p.drug_formulary?.id &&
            i.drug_a_id === o.drug_formulary?.id),
      ),
    );
  };

  const hasDuplicateWarning = (p: any, allOrders: any[]) => {
    return allOrders.some(
      (o: any) =>
        o.id !== p.id &&
        o.drug_formulary?.id === p.drug_formulary?.id &&
        o.hospitalizations?.patients?.id ===
          p.hospitalizations?.patients?.id &&
        !["cancelled", "completed", "returned_accepted"].includes(
          o.status_code,
        ),
    );
  };

  const handleStatusChange = async (
    prescriptionId: string,
    newStatus: string,
  ) => {
    if (newStatus === "in_progress") {
      const { error } = await supabase.rpc("dispense_prescription", {
        p_prescription_id: prescriptionId,
        p_hospital_id: user!.hospitalId,
        p_accepted_by: user!.id,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("update_prescription_status", {
        p_prescription_id: prescriptionId,
        p_new_status: newStatus,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Статус обновлён");
    queryClient.invalidateQueries({
      queryKey: ["pharmacist-orders", user?.hospitalId],
    });
  };

  const grouped = useMemo(() => {
    const filtered = orders.filter(
      (p: any) =>
        (deptFilter === "all" ||
          p.hospitalizations?.departments?.name === deptFilter) &&
        !(p.prescription_type === "prn" && p.status_code === "preliminary")
    );
    const map: Record<string, any[]> = {};
    filtered.forEach((p: any) => {
      const dept =
        p.hospitalizations?.departments?.name ?? "Без отделения";
      if (!map[dept]) map[dept] = [];
      map[dept].push(p);
    });
    return map;
  }, [orders, deptFilter]);

  const departments = useMemo(
    () => [
      ...new Set(
        orders
          .map((p: any) => p.hospitalizations?.departments?.name)
          .filter(Boolean),
      ),
    ],
    [orders],
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-lg">Заказы лекарств</h2>
        <div className="flex rounded-md border overflow-hidden">
          {[
            { code: "all", label: "Все" },
            { code: "preliminary", label: "Предварительное" },
            { code: "in_progress", label: "В процессе" },
            { code: "return", label: "Возврат" },
          ].map((f) => (
            <button
              key={f.code}
              onClick={() => setStatusFilter(f.code as StatusFilter)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0",
                statusFilter === f.code
                  ? "bg-primary text-white"
                  : "bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {departments.length > 1 && (
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="h-8 text-xs border rounded px-2 bg-white"
          >
            <option value="all">Все отделения</option>
            {departments.map((d: any) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {Object.entries(grouped).map(([dept, deptOrders]) => (
        <div key={dept} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {dept}
          </h3>
          {(deptOrders as any[]).map((p: any) => {
            const patient = p.hospitalizations?.patients;
            const allergies = patient?.patient_allergies ?? [];
            const allergyWarning = hasAllergyWarning(p);
            const interactionWarning = hasInteractionWarning(p, orders);
            const duplicateWarning = hasDuplicateWarning(p, orders);
            return (
              <div
                key={p.id}
                className={cn(
                  "border-2 rounded-lg p-3 space-y-2",
                  allergyWarning
                    ? "border-red-300 bg-red-50/30"
                    : "border-gray-200 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {patient?.last_name} {patient?.first_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {patient?.date_of_birth
                          ? format(
                              new Date(patient.date_of_birth),
                              "dd.MM.yyyy",
                            )
                          : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {patient?.patient_number}
                      </span>
                    </div>
                    {allergies.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            allergyWarning
                              ? "text-red-700"
                              : "text-orange-600",
                          )}
                        >
                          {allergyWarning ? "🔴 АЛЛЕРГИЯ" : "⚠ Аллергия"}:
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {allergies.map((a: any) =>
                            a.reaction
                              ? `${a.allergy_type} (${a.reaction})`
                              : a.allergy_type
                          ).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <StatusBadge status={p.status_code} />
                </div>

                <div className="text-sm">
                  <span className="font-medium">
                    {p.drug_formulary?.trade_name}
                  </span>
                  {p.prescription_type === "prn" && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                      PRN
                    </span>
                  )}
                  {p.prescription_type === "antibiotic_prophylaxis" && (
                    <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                      Антибиотикопрофилактика
                    </span>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {p.dose}
                  {p.dose_unit}
                  {" · "}
                  {ROUTES[p.route] ?? p.route}
                  {p.schedule_times?.length > 0 &&
                    ` · ${p.schedule_times.join(", ")}`}
                  {p.duration_days && ` · ${p.duration_days} дней`}
                </div>

                {p.mix_drug && (
                  <div className="text-xs text-blue-600 mt-0.5">
                    + {p.mix_drug.trade_name} {p.mix_dose}
                  </div>
                )}

                {p.prn_condition && (
                  <div className="text-xs text-purple-700">
                    При: {p.prn_condition}
                  </div>
                )}

                {interactionWarning && (
                  <div className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
                    <span>⚠</span>
                    <span>Взаимодействие с другим препаратом пациента</span>
                  </div>
                )}

                {duplicateWarning && (
                  <div className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1">
                    <span>📋</span>
                    <span>Дублирующий препарат</span>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  Назначил: {p.profiles?.full_name} ·{" "}
                  {format(new Date(p.prescribed_at), "dd.MM.yyyy HH:mm")}
                </div>

                <div className="flex gap-2 pt-1">
                  {p.status_code === "preliminary" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        handleStatusChange(p.id, "in_progress")
                      }
                    >
                      В процессе ▶
                    </Button>
                  )}
                  {p.status_code === "return" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleStatusChange(p.id, "returned_accepted")
                      }
                    >
                      Принять возврат ▶
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {orders.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">
          Нет активных заказов
        </p>
      )}
    </div>
  );
}
