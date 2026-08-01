import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  patientId: string;
  hospitalId: string;
}

export default function PatientMedicationHistory({ patientId, hospitalId }: Props) {
  const [expandedHospId, setExpandedHospId] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["patient-medication-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route, prescribed_at, hospitalization_id,
          drug_formulary!drug_formulary_id(trade_name, inn),
          hospitalizations!inner(hospitalization_number, admitted_at, discharged_at)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .neq("status_code", "cancelled")
        .order("prescribed_at", { ascending: false });
      if (error) throw error;

      const byHosp = new Map<string, any>();
      for (const rx of data || []) {
        const hospId = rx.hospitalization_id;
        if (!byHosp.has(hospId)) {
          byHosp.set(hospId, {
            hospitalization: rx.hospitalizations,
            hospitalizationId: hospId,
            prescriptions: [],
          });
        }
        byHosp.get(hospId).prescriptions.push(rx);
      }
      return Array.from(byHosp.values()).sort(
        (a, b) =>
          new Date(b.hospitalization?.admitted_at || 0).getTime() -
          new Date(a.hospitalization?.admitted_at || 0).getTime(),
      );
    },
    enabled: !!patientId && !!hospitalId,
  });

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Нет предыдущих назначений.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g: any) => {
        const isOpen = expandedHospId === g.hospitalizationId;
        return (
          <div key={g.hospitalizationId} className="border rounded-md overflow-hidden">
            <button
              onClick={() => setExpandedHospId(isOpen ? null : g.hospitalizationId)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-medium">
                  Госпитализация № {g.hospitalization?.hospitalization_number}
                </span>
                {g.hospitalization?.admitted_at && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(g.hospitalization.admitted_at), "dd.MM.yyyy")}
                    {g.hospitalization?.discharged_at &&
                      ` – ${format(new Date(g.hospitalization.discharged_at), "dd.MM.yyyy")}`}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {isOpen ? "▲" : "▼"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
                {g.prescriptions.map((rx: any) => (
                  <div
                    key={rx.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                      <span className="font-medium text-foreground">
                        {rx.drug_formulary?.trade_name ?? "—"}
                      </span>
                      {rx.drug_formulary?.inn && (
                        <span className="text-xs text-muted-foreground">
                          {rx.drug_formulary.inn}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {rx.dose} {rx.dose_unit} · {rx.route}
                      </span>
                      <span>·</span>
                      <span>
                        {rx.prescribed_at ? format(new Date(rx.prescribed_at), "dd.MM.yyyy") : "—"}
                      </span>
                    </div>
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
