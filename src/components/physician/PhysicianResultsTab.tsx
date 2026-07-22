import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { uniqueServices } from "@/components/shared/LabResultRow";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import { format } from "date-fns";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

function ParamRow({ r, dateStr }: { r: any; dateStr?: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground">{r.parameter_name}</span>
      <div className="flex items-center gap-3">
        {dateStr && (
          <span className="text-muted-foreground whitespace-nowrap">{dateStr}</span>
        )}
        <span className="font-mono">
          {r.value} {r.unit || ""}
        </span>
        <FlagBadge flag={r.flag} />
      </div>
    </div>
  );
}

function PhysicianResultCard({ sample, isHistory }: { sample: any; isHistory?: boolean }) {
  const results = sample?.lab_results || [];
  const dateStr = sample?.completed_at
    ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")
    : "";
  const [expanded, setExpanded] = useState(false);

  const services = uniqueServices(sample);
  const isCombo = services.length > 1;

  if (isCombo || results.length <= 1) {
    if (results.length === 0) return null;
    return (
      <div className={`border rounded p-2 space-y-0 ${isHistory ? "opacity-80" : ""}`}>
        {results.map((r: any) => (
          <ParamRow key={r.id} r={r} dateStr={dateStr} />
        ))}
      </div>
    );
  }

  const hospId = services[0]?.hospitalization_id;
  const visible = expanded ? results : results.slice(0, 3);

  return (
    <div className={`border rounded p-2 space-y-2 ${isHistory ? "opacity-80" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{services[0]?.services?.name}</span>
          {hospId === null && (
            <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
              Амб.
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{dateStr}</span>
      </div>
      <div>
        {visible.map((r: any) => (
          <ParamRow key={r.id} r={r} />
        ))}
      </div>
      {results.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Свернуть" : `Показать все (${results.length})`}
        </button>
      )}
    </div>
  );
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
              <PhysicianResultCard key={s.id} sample={s} />
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
                    <PhysicianResultCard key={s.id} sample={s} isHistory />
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
