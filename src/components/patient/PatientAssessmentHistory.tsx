import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  patientId: string;
  hospitalId: string;
}

export default function PatientAssessmentHistory({ patientId, hospitalId }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["patient-assessment-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_assessments")
        .select(
          `
            id, total_score, risk_level, assessed_at, hospitalization_id,
            assessment_scales!scale_id(name_ru),
            hospitalizations!inner(hospitalization_number)
          `
        )
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .order("assessed_at", { ascending: false });
      if (error) throw error;

      const byHosp = new Map<string, any>();
      for (const a of data || []) {
        const hospId = a.hospitalization_id;
        if (!byHosp.has(hospId)) {
          byHosp.set(hospId, {
            key: hospId,
            label: `Госпитализация № ${(a as any).hospitalizations?.hospitalization_number}`,
            assessments: [],
          });
        }
        byHosp.get(hospId).assessments.push(a);
      }
      return Array.from(byHosp.values());
    },
    enabled: !!patientId && !!hospitalId,
  });

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Нет записей по шкалам.
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
                {g.assessments.map((a: any) => (
                  <div
                    key={a.id}
                    className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 text-sm"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        {a.assessment_scales?.name_ru}
                      </div>
                      <div className="text-muted-foreground">
                        {a.total_score} баллов
                        {a.risk_level ? ` (${a.risk_level})` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {a.assessed_at
                        ? format(new Date(a.assessed_at), "dd.MM.yyyy HH:mm")
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
