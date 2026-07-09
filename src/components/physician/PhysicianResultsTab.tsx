import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { FlagBadge } from "@/pages/lab/LabResultsPage";

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
          visit_services!inner(id, hospitalization_id, services!inner(name)),
          lab_results(id, parameter_name, value, unit, flag, ref_min, ref_max)
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

  const current = samples.filter(
    (s: any) => s.visit_services?.hospitalization_id === hospitalizationId
  );
  const history = samples.filter(
    (s: any) => s.visit_services?.hospitalization_id !== hospitalizationId
  );

  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="p-4 space-y-3">
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : (
        <>
          {current.map((s: any) => (
            <ResultCard key={s.id} sample={s} />
          ))}
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
                <div className="mt-3 space-y-3">
                  {history.map((s: any) => (
                    <ResultCard key={s.id} sample={s} isHistory />
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

function ResultCard({
  sample,
  isHistory,
}: {
  sample: any;
  isHistory?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-card p-3 ${
        isHistory ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">
            {sample.visit_services?.services?.name}
          </span>
          {sample.visit_services?.hospitalization_id === null && (
            <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
              Амб.
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {sample.completed_at
            ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")
            : ""}
        </span>
      </div>
      <div className="divide-y">
        {(sample.lab_results || []).map((r: any) => (
          <div
            key={r.id}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span className="text-muted-foreground">{r.parameter_name}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono">
                {r.value} {r.unit || ""}
              </span>
              <FlagBadge flag={r.flag} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
