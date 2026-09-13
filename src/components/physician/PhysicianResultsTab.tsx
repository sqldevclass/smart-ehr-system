import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { uniqueServices } from "@/components/shared/LabResultRow";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

function ParamTableHeader() {
  return (
    <div className="grid grid-cols-[1fr_90px_60px_110px_120px_90px] items-center gap-1 border-b py-1 text-[11px] font-medium text-muted-foreground">
      <span>Название</span>
      <span>Результат</span>
      <span>Ед.</span>
      <span>Норма</span>
      <span>Назначил</span>
      <span>Дата</span>
    </div>
  );
}

function ParamTableRow({ r, dateStr, orderedBy }: { r: any; dateStr: string; orderedBy: string }) {
  const norm = r.ref_min != null || r.ref_max != null
    ? `${r.ref_min ?? ""}${r.ref_min != null && r.ref_max != null ? "–" : ""}${r.ref_max ?? ""}`
    : "—";
  return (
    <div className="grid grid-cols-[1fr_90px_60px_110px_120px_90px] items-center gap-1 border-b py-1 text-sm last:border-0">
      <span className="truncate text-slate-600">{r.parameter_name}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono">{r.value}</span>
        {r.flag && r.flag !== "normal" && r.flag !== "pending" && <FlagBadge flag={r.flag} />}
      </div>
      <span className="text-xs text-muted-foreground">{r.unit || "—"}</span>
      <span className="text-xs text-muted-foreground">{norm}</span>
      <span className="truncate text-xs text-muted-foreground">{orderedBy || "—"}</span>
      <span className="text-xs text-muted-foreground">{dateStr}</span>
    </div>
  );
}

function resolveOrderedBy(sample: any, r: any): string {
  const serviceId = r.lab_parameter_templates?.service_id;
  const link = (sample?.lab_sample_services || []).find(
    (l: any) => l.visit_services?.services?.id === serviceId,
  );
  return link?.visit_services?.profiles?.full_name || "";
}

// Every completed sample is its own group -- labeled by which
// test(s) it covers and when, with all its result rows underneath
// using the same columns as everywhere else. No more special-casing
// single-result vs. multi-result samples into two different layouts.
function SampleGroup({ sample, search, isHistory }: { sample: any; search: string; isHistory?: boolean }) {
  const q = search.trim().toLowerCase();
  const allResults = sample?.lab_results || [];
  const results = q ? allResults.filter((r: any) => r.parameter_name?.toLowerCase().includes(q)) : allResults;
  if (results.length === 0) return null;

  const dateStr = sample?.completed_at ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm") : "";
  const services = uniqueServices(sample);
  const label = services.map((s: any) => s.services?.name).filter(Boolean).join(" + ") || "Результат";
  const isAmbulatory = services[0]?.hospitalization_id === null;

  return (
    <div className={isHistory ? "opacity-80" : undefined}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {isAmbulatory && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Амб.</span>
          )}
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{dateStr}</span>
      </div>
      {results.map((r: any) => (
        <ParamTableRow key={r.id} r={r} dateStr={dateStr} orderedBy={resolveOrderedBy(sample, r)} />
      ))}
    </div>
  );
}

export default function PhysicianResultsTab({ hospitalizationId, patientId, hospitalId }: Props) {
  const [search, setSearch] = useState("");

  const { data: samples = [] } = useQuery({
    queryKey: ["physician-lab-results", patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_samples")
        .select(`
          id, completed_at,
          lab_sample_services(
            visit_service_id,
            visit_services!inner(
              id, hospitalization_id, created_by,
              services!inner(id, name),
              profiles!created_by(full_name)
            )
          ),
          lab_results(id, parameter_name, value, unit, ref_min, ref_max, flag, parameter_template_id, lab_parameter_templates(service_id))
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
    (s.lab_sample_services || []).some((l: any) => l.visit_services?.hospitalization_id === hospitalizationId),
  );
  const history = samples.filter(
    (s: any) => !(s.lab_sample_services || []).some((l: any) => l.visit_services?.hospitalization_id === hospitalizationId),
  );

  const [showHistory, setShowHistory] = useState(false);

  const q = search.trim().toLowerCase();
  const matchCount = (list: any[]) =>
    list.reduce(
      (sum, s) => sum + (s.lab_results || []).filter(
        (r: any) => !q || r.parameter_name?.toLowerCase().includes(q),
      ).length,
      0,
    );
  const currentMatches = matchCount(current);
  const historyMatches = matchCount(history);

  return (
    <div className="space-y-1.5">
      <Input
        placeholder="Поиск по названию показателя..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : currentMatches === 0 && historyMatches === 0 ? (
        <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
      ) : (
        <>
          {currentMatches > 0 && (
            <div>
              <ParamTableHeader />
              {current.map((s: any) => (
                <SampleGroup key={s.id} sample={s} search={search} />
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="pt-1.5">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showHistory ? "Скрыть историю" : `Показать историю (${history.length})`}
              </button>
              {showHistory && historyMatches > 0 && (
                <div className="mt-1.5">
                  <ParamTableHeader />
                  {history.map((s: any) => (
                    <SampleGroup key={s.id} sample={s} search={search} isHistory />
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
