import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  hospitalizationId: string;
}

// "Лекарства принятые сегодня" -- lists every medication actually
// administered (status = "done") to the patient on the discharge date.
// Uses hospitalizations.discharged_at once the patient has been
// discharged; while the discharge summary is still being drafted
// (discharged_at not yet set), falls back to today's date so the
// physician sees what's been given so far today.
export default function DischargeMedicationsSection({ hospitalizationId }: Props) {
  const { data: dischargedAt, isLoading: loadingHosp } = useQuery({
    queryKey: ["hosp-discharged-at", hospitalizationId],
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("discharged_at")
        .eq("id", hospitalizationId)
        .single();
      if (error) throw error;
      return data.discharged_at as string | null;
    },
  });

  const dayStart = new Date(dischargedAt || new Date());
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: slots, isLoading: loadingSlots } = useQuery({
    queryKey: ["discharge-day-meds", hospitalizationId, dayStart.toISOString()],
    enabled: !!hospitalizationId && !loadingHosp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, administered_at, dose_given, status,
          drug_prescriptions (
            dose_unit, is_patient_own_drug, custom_drug_name, custom_inn,
            drug_formulary ( trade_name, inn )
          )
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("status", "done")
        .gte("administered_at", dayStart.toISOString())
        .lt("administered_at", dayEnd.toISOString())
        .order("administered_at");
      if (error) throw error;
      return data || [];
    },
  });

  const drugName = (slot: any) => {
    const rx = slot.drug_prescriptions;
    if (!rx) return "—";
    if (rx.is_patient_own_drug) return rx.custom_drug_name || rx.custom_inn || "—";
    return rx.drug_formulary?.trade_name || rx.drug_formulary?.inn || "—";
  };

  const isLoading = loadingHosp || loadingSlots;

  return (
    <div className="mt-6 space-y-2">
      <h3 className="font-heading text-base font-semibold">Лекарства принятые сегодня</h3>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Загрузка...</div>
      ) : !slots || slots.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">
          Лекарства не вводились сегодня
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {slots.map((slot: any) => (
            <div key={slot.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span className="font-medium">{drugName(slot)}</span>
              <span className="text-muted-foreground">
                {slot.dose_given || ""} {slot.drug_prescriptions?.dose_unit || ""}
              </span>
              <span className="text-muted-foreground">
                {slot.administered_at
                  ? new Date(slot.administered_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
                  : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
