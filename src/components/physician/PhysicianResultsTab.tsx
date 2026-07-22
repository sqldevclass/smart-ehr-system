import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { LabResultCard } from "@/components/shared/LabResultRow";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

export default function PhysicianResultsTab({
  hospitalizationId,
  patientId,
  hospitalId,
}: Props) {
  const { data: samples = [] } = useQuery({
    queryKey: ["physician-lab-results", patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_samples")
        .select(`
          id, completed_at,
          lab_sample_services(
            visit_service_id,
            visit_services!inner(id, hospitalization_id, services!inner(id, name))
          ),
          lab_results(id, parameter_name, value, unit, flag, parameter_template_id, lab_parameter_templates(service_id))
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const current = samples.filter((s: any) =>
    (s.lab_sample_services || []).some(
      (l: any) => l.visit_services?.hospitalization_id === hospitalizationId,
    ),
  );
  const history = samples.filter(
    (s: any) =>
      !(s.lab_sample_services || []).some(
        (l: any) => l.visit_services?.hospitalization_id === hospitalizationId,
      ),
  );

  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-2">
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : (
        <>
          <div className="space-y-2">
            {current.map((s: any) => (
              <LabResultCard key={s.id} sample={s} layout="horizontal" />
            ))}
          </div>
          {history.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showHistory
                  ? "Скрыть историю"
                  : `Показать историю (${history.length})`}
              </button>
              {showHistory && (
                <div className="mt-2 space-y-2">
                  {history.map((s: any) => (
                    <LabResultCard
                      key={s.id}
                      sample={s}
                      isHistory
                      layout="horizontal"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
