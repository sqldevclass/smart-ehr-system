import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LabResultRow,
  LabResultDialog,
} from "@/components/shared/LabResultRow";

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
  const [selectedSample, setSelectedSample] = useState<any>(null);

  return (
    <div className="space-y-2">
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : (
        <>
          <div className="divide-y border rounded">
            {current.map((s: any) => (
              <LabResultRow
                key={s.id}
                sample={s}
                onClick={() => setSelectedSample(s)}
              />
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
                <div className="mt-2 divide-y border rounded">
                  {history.map((s: any) => (
                    <LabResultRow
                      key={s.id}
                      sample={s}
                      isHistory
                      onClick={() => setSelectedSample(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <LabResultDialog
        sample={selectedSample}
        open={!!selectedSample}
        onOpenChange={(open) => !open && setSelectedSample(null)}
      />
    </div>
  );
}
