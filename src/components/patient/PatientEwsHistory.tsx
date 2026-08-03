import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  patientId: string;
  hospitalId: string;
}

export default function PatientEwsHistory({ patientId, hospitalId }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["patient-ews-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_readings")
        .select(
          `
            id, total_score, escalation_level, recorded_at, notes, hospitalization_id,
            ews_scales!scale_id(name),
            hospitalizations!inner(hospitalization_number)
          `
        )
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .eq("is_voided", false)
        .order("recorded_at", { ascending: false });
      if (error) throw error;

      const byHosp = new Map<string, any>();
      for (const r of data || []) {
        const hospId = r.hospitalization_id;
        if (!byHosp.has(hospId)) {
          byHosp.set(hospId, {
            key: hospId,
            label: `Госпитализация № ${(r as any).hospitalizations?.hospitalization_number}`,
            readings: [],
          });
        }
        byHosp.get(hospId).readings.push(r);
      }
      return Array.from(byHosp.values());
    },
    enabled: !!patientId && !!hospitalId,
  });

  const escalationColor = (level: number) =>
    level >= 3
      ? "text-red-700"
      : level >= 1
        ? "text-amber-700"
        : "text-muted-foreground";

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Нет записей ШРПУ.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g: any) => {
        const isOpen = expandedGroup === g.key;
        return (
          <div key={g.key} className="border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedGroup(isOpen ? null : g.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="font-medium">{g.label}</span>
              <span className="text-xs text-muted-foreground">
                {isOpen ? "▲" : "▼"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
                {g.readings.map((r: any) => (
                  <div
                    key={r.id}
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {r.ews_scales?.name}
                      </div>
                      <div className={escalationColor(r.escalation_level)}>
                        {r.total_score} баллов
                      </div>
                      {r.notes && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.notes}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.recorded_at
                        ? format(new Date(r.recorded_at), "dd.MM.yyyy HH:mm")
                        : "—"}
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
