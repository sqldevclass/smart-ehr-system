import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Slot {
  id: string;
  prescription_id: string;
  scheduled_at: string;
  administered_at?: string;
  dose_given?: string;
  override_dose?: string;
  status: string;
  profiles?: { full_name: string };
}

interface Props {
  prescriptions: any[];
  slots: Slot[];
  viewerRole: "physician" | "nurse";
  isReadOnly?: boolean;
  hospitalId: string;
  hospitalizationId: string;
  onAdministerSlot: (slotId: string, doseGiven: string, notes: string) => void;
  onSkipSlot: (slotId: string) => void;
}

export default function PrnPrescriptionList({
  prescriptions,
  slots,
  viewerRole,
  isReadOnly = false,
  hospitalId,
  hospitalizationId,
  onAdministerSlot,
  onSkipSlot,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [orderingId, setOrderingId] = useState<string | null>(null);
  const [orderTime, setOrderTime] = useState<Record<string, string>>({});
  const [showOrderForm, setShowOrderForm] = useState<string | null>(null);
  const [adminSlot, setAdminSlot] = useState<{
    slotId: string;
    doseGiven: string;
    notes: string;
  } | null>(null);

  const prnPrescriptions = prescriptions.filter(
    (p) => p.prescription_type === "prn",
  );

  if (prnPrescriptions.length === 0) return null;

  const getSlotsForPrescription = (prescriptionId: string) =>
    slots
      .filter((s) => s.prescription_id === prescriptionId)
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );

  const handleOrder = async (prescriptionId: string) => {
    if (!user) return;
    const time = orderTime[prescriptionId] || "08:00";
    setOrderingId(prescriptionId);
    try {
      const [hh, mm] = time.split(":");
      const scheduledAt = new Date();
      scheduledAt.setHours(parseInt(hh), parseInt(mm), 0, 0);
      const { error } = await supabase.rpc("order_prn_drug", {
        p_prescription_id: prescriptionId,
        p_hospital_id: hospitalId,
        p_scheduled_at: scheduledAt.toISOString(),
        p_ordered_by: user.id,
      });
      if (error) throw error;
      toast.success("Препарат заказан");
      setShowOrderForm(null);
      qc.invalidateQueries({ queryKey: ["nurse-prescriptions", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["nurse-admin-slots", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["drug-prescriptions", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["all-slots", hospitalizationId] });
    } catch (e: any) {
      toast.error(e.message || "Ошибка заказа");
    } finally {
      setOrderingId(null);
    }
  };

  const slotStatusIcon = (slot: Slot) => {
    if (slot.status === "done") return "✅";
    if (slot.status === "skipped") return "⏭";
    return "🕐";
  };

  const drugName = (p: any) =>
    p.is_patient_own_drug
      ? p.custom_drug_name
      : p.drug_formulary?.trade_name ?? "—";

  const drugInn = (p: any) =>
    p.is_patient_own_drug ? p.custom_inn : p.drug_formulary?.inn;

  return (
    <div className="space-y-3 mt-4">
      <h4 className="text-sm font-semibold text-purple-700">
        По требованию (PRN)
      </h4>

      {prnPrescriptions.map((p) => {
        const prescriptionSlots = getSlotsForPrescription(p.id);
        const isOrdering = orderingId === p.id;
        const showForm = showOrderForm === p.id;

        return (
          <div
            key={p.id}
            className="border rounded p-3 bg-purple-50/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{drugName(p)}</span>
                  <span className="text-sm text-muted-foreground">
                    {p.dose}
                    {p.dose_unit ?? ""}
                  </span>
                  {p.is_patient_own_drug && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 rounded">
                      Своё
                    </span>
                  )}
                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded">
                    PRN
                  </span>
                </div>
                {drugInn(p) && (
                  <div className="text-xs text-muted-foreground">
                    {drugInn(p)}
                  </div>
                )}
                {p.prn_condition && (
                  <div className="text-xs text-purple-700 mt-1">
                    При: {p.prn_condition}
                  </div>
                )}
                {p.notes && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.notes}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {p.profiles?.full_name
                    ?.split(" ")
                    .map((w: string) => w[0])
                    .join("")}
                  {" · "}
                  {format(new Date(p.prescribed_at), "dd.MM.yyyy")}
                </div>
              </div>

              {viewerRole === "nurse" && !isReadOnly && (
                showForm ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={orderTime[p.id] || "08:00"}
                      onChange={(e) =>
                        setOrderTime((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      className="w-28 h-7 text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={isOrdering}
                      onClick={() => handleOrder(p.id)}
                    >
                      {isOrdering ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "✓"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setShowOrderForm(null)}
                    >
                      ✕
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setShowOrderForm(p.id)}
                  >
                    + Заказать
                  </Button>
                )
              )}
            </div>

            {prescriptionSlots.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-2">
                {prescriptionSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span>{slotStatusIcon(slot)}</span>
                      {slot.status === "done" ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-green-700 cursor-default">
                                {format(new Date(slot.scheduled_at), "dd.MM HH:mm")}
                                {" · "}
                                {slot.dose_given}
                                {p.dose_unit ?? ""}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">
                                Выполнено в{" "}
                                {slot.administered_at
                                  ? format(new Date(slot.administered_at), "HH:mm dd.MM")
                                  : "—"}
                              </p>
                              {slot.profiles?.full_name && (
                                <p className="text-xs text-muted-foreground">
                                  {slot.profiles.full_name}
                                </p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : slot.status === "skipped" ? (
                        <span className="text-gray-400 line-through">
                          {format(new Date(slot.scheduled_at), "dd.MM HH:mm")}
                        </span>
                      ) : (
                        <span className="text-orange-600">
                          {format(new Date(slot.scheduled_at), "dd.MM HH:mm")}
                          {" · "}
                          {slot.override_dose
                            ? `${slot.override_dose}${p.dose_unit ?? ""}`
                            : `${p.dose}${p.dose_unit ?? ""}`}
                          {slot.status === "pending" && !p.dept_batch_id && (
                            <span className="ml-1 text-muted-foreground">
                              · ожидает аптеку
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {viewerRole === "nurse" &&
                      !isReadOnly &&
                      slot.status === "pending" &&
                      p.status_code === "ready_for_execution" &&
                      (adminSlot?.slotId === slot.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={adminSlot.doseGiven}
                            onChange={(e) =>
                              setAdminSlot((prev) =>
                                prev ? { ...prev, doseGiven: e.target.value } : null,
                              )
                            }
                            placeholder={`${p.dose}${p.dose_unit ?? ""}`}
                            className="w-20 h-6 text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-6 px-2"
                            onClick={() => {
                              onAdministerSlot(
                                slot.id,
                                adminSlot.doseGiven,
                                adminSlot.notes,
                              );
                              setAdminSlot(null);
                            }}
                          >
                            ✓
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={() => setAdminSlot(null)}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            className="text-primary underline"
                            onClick={() =>
                              setAdminSlot({
                                slotId: slot.id,
                                doseGiven: `${p.dose}`,
                                notes: "",
                              })
                            }
                          >
                            Выполнить
                          </button>
                          <button
                            className="text-gray-500 underline"
                            onClick={() => onSkipSlot(slot.id)}
                          >
                            Пропустить
                          </button>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
