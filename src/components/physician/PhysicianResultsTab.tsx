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

function ParamTableHeader() {
  return (
    <div className="grid grid-cols-[1fr_140px_140px] items-center py-1 text-xs font-medium text-muted-foreground border-b">
      <span>Название</span>
      <span>Дата</span>
      <span className="text-right">Результат</span>
    </div>
  );
}

function ParamTableRow({ r, dateStr }: { r: any; dateStr: string }) {
  return (
    <div className="grid grid-cols-[1fr_140px_140px] items-center py-1.5 text-sm border-b last:border-0">
      <span className="text-slate-600">{r.parameter_name}</span>
      <span className="text-xs text-muted-foreground">{dateStr}</span>
      <div className="flex items-center gap-2 justify-end">
        <span className="font-mono">{r.value} {r.unit || ""}</span>
        <FlagBadge flag={r.flag} />
      </div>
    </div>
  );
}

function ParamRow({ r }: { r: any }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs border-b last:border-0">
      <span className="text-muted-foreground">{r.parameter_name}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{r.value} {r.unit || ""}</span>
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

function partitionSamples(list: any[]) {
  const flatRows: { key: string; r: any; dateStr: string }[] = [];
  const boxed: any[] = [];
  for (const s of list) {
    const results = s?.lab_results || [];
    const services = uniqueServices(s);
    const isCombo = services.length > 1;
    const dateStr = s?.completed_at
      ? format(new Date(s.completed_at), "dd.MM.yyyy HH:mm")
      : "";
    if (isCombo || results.length <= 1) {
      results.forEach((r: any) => {
        flatRows.push({ key: `${s.id}-${r.id}`, r, dateStr });
      });
    } else {
      boxed.push(s);
    }
  }
  return { flatRows, boxed };
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

  const { flatRows: currentFlat, boxed: currentBoxed } = partitionSamples(current);
  const { flatRows: historyFlat, boxed: historyBoxed } = partitionSamples(history);

  return (
    <div className="space-y-2">
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : (
        <>
          <div className="space-y-2">
            {currentFlat.length > 0 && (
              <div>
                <ParamTableHeader />
                {currentFlat.map(({ key, r, dateStr }) => (
                  <ParamTableRow key={key} r={r} dateStr={dateStr} />
                ))}
              </div>
            )}
            {currentBoxed.map((s: any) => (
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
