import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { uniqueServices } from "@/components/shared/LabResultRow";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

function ParamTableHeader() {
  return (
    <div className="grid grid-cols-[1fr_90px_60px_110px_120px_90px] items-center py-1 text-[11px] font-medium text-muted-foreground border-b gap-1">
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
    <div className="grid grid-cols-[1fr_90px_60px_110px_120px_90px] items-center py-1 text-sm border-b last:border-0 gap-1">
      <span className="text-slate-600 truncate">{r.parameter_name}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono">{r.value}</span>
        {r.flag && r.flag !== "normal" && r.flag !== "pending" && <FlagBadge flag={r.flag} />}
      </div>
      <span className="text-xs text-muted-foreground">{r.unit || "—"}</span>
      <span className="text-xs text-muted-foreground">{norm}</span>
      <span className="text-xs text-muted-foreground truncate">{orderedBy || "—"}</span>
      <span className="text-xs text-muted-foreground">{dateStr}</span>
    </div>
  );
}

function ParamRow({ r, orderedBy }: { r: any; orderedBy: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs border-b last:border-0">
      <span className="text-muted-foreground">{r.parameter_name}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{r.value} {r.unit || ""}</span>
        {r.flag && r.flag !== "normal" && r.flag !== "pending" && <FlagBadge flag={r.flag} />}
        <span className="text-muted-foreground/70 w-24 truncate text-right">{orderedBy || ""}</span>
      </div>
    </div>
  );
}

function resolveOrderedBy(sample: any, r: any): string {
  const serviceId = r.lab_parameter_templates?.service_id;
  const link = (sample?.lab_sample_services || []).find(
    (l: any) => l.visit_services?.services?.id === serviceId,
  );
  const person = link?.visit_services?.staff_roles?.persons;
  return person ? `${person.last_name ?? ""} ${person.first_name ?? ""}`.trim() : "";
}

function PhysicianResultCard({ sample, isHistory }: { sample: any; isHistory?: boolean }) {
  const results = sample?.lab_results || [];
  const dateStr = sample?.completed_at ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm") : "";
  const [expanded, setExpanded] = useState(false);

  const services = uniqueServices(sample);
  const hospId = services[0]?.hospitalization_id;
  const visible = expanded ? results : results.slice(0, 3);

  return (
    <div className={`border rounded p-2 space-y-1 ${isHistory ? "opacity-80" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">{services[0]?.services?.name}</span>
          {hospId === null && (
            <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">Амб.</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{dateStr}</span>
      </div>
      <div>
        {visible.map((r: any) => (
          <ParamRow key={r.id} r={r} orderedBy={resolveOrderedBy(sample, r)} />
        ))}
      </div>
      {results.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="text-xs text-blue-600 hover:underline">
          {expanded ? "Свернуть" : `Показать все (${results.length})`}
        </button>
      )}
    </div>
  );
}

function partitionSamples(list: any[], search: string) {
  const q = search.trim().toLowerCase();
  const flatRows: { key: string; r: any; dateStr: string; orderedBy: string }[] = [];
  const boxed: any[] = [];
  for (const s of list) {
    const allResults = s?.lab_results || [];
    const results = q ? allResults.filter((r: any) => r.parameter_name?.toLowerCase().includes(q)) : allResults;
    if (results.length === 0) continue;
    const services = uniqueServices(s);
    const isCombo = services.length > 1;
    const dateStr = s?.completed_at ? format(new Date(s.completed_at), "dd.MM.yyyy HH:mm") : "";
    if (isCombo || allResults.length <= 1 || q) {
      results.forEach((r: any) => {
        flatRows.push({ key: `${s.id}-${r.id}`, r, dateStr, orderedBy: resolveOrderedBy(s, r) });
      });
    } else {
      boxed.push(s);
    }
  }
  return { flatRows, boxed };
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
              id, hospitalization_id,
              services!inner(id, name),
              staff_roles!assigned_staff_role_id(persons(first_name, last_name))
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

  const { flatRows: currentFlat, boxed: currentBoxed } = partitionSamples(current, search);
  const { flatRows: historyFlat, boxed: historyBoxed } = partitionSamples(history, search);

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
      ) : currentFlat.length === 0 && currentBoxed.length === 0 && historyFlat.length === 0 && historyBoxed.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ничего не найдено.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {currentFlat.length > 0 && (
              <div>
                <ParamTableHeader />
                {currentFlat.map(({ key, r, dateStr, orderedBy }) => (
                  <ParamTableRow key={key} r={r} dateStr={dateStr} orderedBy={orderedBy} />
                ))}
              </div>
            )}
            {currentBoxed.map((s: any) => (
              <PhysicianResultCard key={s.id} sample={s} />
            ))}
          </div>
          {history.length > 0 && (
            <div className="pt-1.5">
              <button onClick={() => setShowHistory((v) => !v)} className="text-sm text-blue-600 hover:underline">
                {showHistory ? "Скрыть историю" : `Показать историю (${history.length})`}
              </button>
              {showHistory && (
                <div className="mt-1.5 space-y-1.5">
                  {historyFlat.length > 0 && (
                    <div className="opacity-80">
                      <ParamTableHeader />
                      {historyFlat.map(({ key, r, dateStr, orderedBy }) => (
                        <ParamTableRow key={key} r={r} dateStr={dateStr} orderedBy={orderedBy} />
                      ))}
                    </div>
                  )}
                  {historyBoxed.map((s: any) => (
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
