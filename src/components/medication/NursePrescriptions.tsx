import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import StatusBadge from "@/components/medication/StatusBadge";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

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

const FOOD_RULES: Record<string, string> = {
  before_meal: "Перед едой",
  during_meal: "Во время еды",
  after_meal: "После еды",
  before_sleep: "Перед сном",
  fasting: "Натощак",
};

export default function NursePrescriptions({
  hospitalizationId,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [adminSlot, setAdminSlot] = useState<{
    slotId: string;
    doseGiven: string;
    notes: string;
  } | null>(null);

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["nurse-prescriptions", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route,
          schedule_times, duration_days,
          food_rule, prescription_type,
          prn_condition, notes, status_code,
          prescribed_at,
          drug_formulary!drug_formulary_id(trade_name, inn),
          profiles!prescribed_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .in("status_code", ["in_progress", "ready_for_execution"])
        .order("prescribed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: todaySlots = [] } = useQuery({
    queryKey: ["nurse-admin-slots", hospitalizationId],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, prescription_id, scheduled_at,
          administered_at, dose_given,
          status, notes,
          profiles!administered_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .gte("scheduled_at", todayStart.toISOString())
        .lte("scheduled_at", todayEnd.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const handlePrescriptionStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    const { error } = await supabase.rpc("update_prescription_status", {
      p_prescription_id: id,
      p_new_status: newStatus,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Статус обновлён");
      queryClient.invalidateQueries({
        queryKey: ["nurse-prescriptions", hospitalizationId],
      });
    }
    setUpdatingId(null);
  };

  const handleAdministerSlot = async () => {
    if (!adminSlot) return;
    const { error } = await supabase
      .from("drug_administration_slots")
      .update({
        status: "done",
        administered_at: new Date().toISOString(),
        administered_by: user!.id,
        dose_given: adminSlot.doseGiven || null,
        notes: adminSlot.notes || null,
      })
      .eq("id", adminSlot.slotId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Выполнено");
      setAdminSlot(null);
      queryClient.invalidateQueries({
        queryKey: ["nurse-admin-slots", hospitalizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["nurse-prescriptions", hospitalizationId],
      });
    }
  };

  const handleSkipSlot = async (slotId: string) => {
    await supabase
      .from("drug_administration_slots")
      .update({ status: "skipped" })
      .eq("id", slotId);
    queryClient.invalidateQueries({
      queryKey: ["nurse-admin-slots", hospitalizationId],
    });
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Назначения</h3>

      {prescriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Нет активных назначений</p>
      ) : (
        prescriptions.map((p: any) => {
          const pSlots = todaySlots.filter(
            (s: any) => s.prescription_id === p.id,
          );

          return (
            <div key={p.id} className="border rounded p-3 space-y-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">
                      {p.drug_formulary?.trade_name}
                    </span>
                    {p.prescription_type === "prn" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                        PRN
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.dose}{p.dose_unit}{" · "}
                    {ROUTES[p.route] ?? p.route}
                    {p.schedule_times?.length > 0 &&
                      ` · ${p.schedule_times.join(", ")}`}
                    {p.food_rule && p.food_rule !== "any" &&
                      ` · ${FOOD_RULES[p.food_rule] ?? p.food_rule}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.profiles?.full_name} ·{" "}
                    {format(new Date(p.prescribed_at), "dd.MM HH:mm")}
                  </p>
                </div>
                <StatusBadge status={p.status_code} />
              </div>

              {/* PRN condition */}
              {p.prn_condition && (
                <p className="text-xs italic text-muted-foreground">
                  При: {p.prn_condition}
                </p>
              )}

              {/* Today's slots */}
              {p.status_code === "ready_for_execution" && pSlots.length > 0 && (
                <div className="border-t pt-2 space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Сегодня:
                  </p>
                  {pSlots.map((slot: any) => (
                    <div key={slot.id} className="text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium">
                          {format(new Date(slot.scheduled_at), "HH:mm")}
                        </span>
                        {slot.status === "done" ? (
                          <span className="text-green-700">
                            ✅ Выполнен{" "}
                            {slot.administered_at &&
                              format(new Date(slot.administered_at), "HH:mm")}
                          </span>
                        ) : slot.status === "skipped" ? (
                          <span className="text-gray-500">⏸ Пропущен</span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-yellow-700">⏳ Ожидает</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                setAdminSlot({
                                  slotId: slot.id,
                                  doseGiven: `${p.dose}${p.dose_unit}`,
                                  notes: "",
                                })
                              }
                            >
                              Выполнить
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleSkipSlot(slot.id)}
                            >
                              Пропустить
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Admin slot form */}
              {adminSlot &&
                pSlots.some((s: any) => s.id === adminSlot.slotId) && (
                  <div className="border-t pt-2 space-y-1.5">
                    <div className="flex gap-1.5">
                      <Input
                        value={adminSlot.doseGiven}
                        onChange={(e) =>
                          setAdminSlot((prev) =>
                            prev ? { ...prev, doseGiven: e.target.value } : null,
                          )
                        }
                        placeholder="Доза введена"
                        className="h-7 text-xs flex-1"
                      />
                      <Input
                        value={adminSlot.notes}
                        onChange={(e) =>
                          setAdminSlot((prev) =>
                            prev ? { ...prev, notes: e.target.value } : null,
                          )
                        }
                        placeholder="Примечание"
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={handleAdministerSlot}
                      >
                        Сохранить
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setAdminSlot(null)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}

              {/* Actions */}
              <div className="flex gap-1.5 pt-1">
                {p.status_code === "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs"
                    disabled={updatingId === p.id}
                    onClick={() =>
                      handlePrescriptionStatus(p.id, "ready_for_execution")
                    }
                  >
                    Принял в пост ✓
                  </Button>
                )}
                {p.status_code === "ready_for_execution" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={updatingId === p.id}
                    onClick={() => handlePrescriptionStatus(p.id, "return")}
                  >
                    Вернуть ↩
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
