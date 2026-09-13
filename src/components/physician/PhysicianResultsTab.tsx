import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { uniqueServices } from "@/components/shared/LabResultRow";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, LineChart as LineChartIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

function ParamTableHeader() {
  return (
    <div className="grid grid-cols-[1fr_90px_60px_110px_120px_90px] print:grid-cols-[1fr_90px_60px_110px_90px] items-center gap-1 border-b py-1 text-[11px] font-medium text-muted-foreground">
      <span>Название</span>
      <span>Результат</span>
      <span>Ед.</span>
      <span>Норма</span>
      <span className="print:hidden">Назначил</span>
      <span>Дата</span>
    </div>
  );
}

function ParamTableRow({
  r, dateStr, orderedBy, checked, onToggle, printEligible, hideCheckbox,
}: {
  r: any; dateStr: string; orderedBy: string;
  checked: boolean; onToggle: () => void; printEligible: boolean; hideCheckbox?: boolean;
}) {
  const norm = r.ref_min != null || r.ref_max != null
    ? `${r.ref_min ?? ""}${r.ref_min != null && r.ref_max != null ? "–" : ""}${r.ref_max ?? ""}`
    : "—";
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_90px_60px_110px_120px_90px] print:grid-cols-[1fr_90px_60px_110px_90px] items-center gap-1 border-b py-1 text-sm last:border-0",
        !printEligible && "print:hidden"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {!hideCheckbox && (
          <Checkbox
            checked={checked}
            onCheckedChange={onToggle}
            className="print:hidden"
            aria-label={`Выбрать ${r.parameter_name}`}
          />
        )}
        <span className={cn("truncate text-slate-600", hideCheckbox && "pl-6")}>{r.parameter_name}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono">{r.value}</span>
        {r.flag && r.flag !== "normal" && r.flag !== "pending" && <FlagBadge flag={r.flag} />}
      </div>
      <span className="text-xs text-muted-foreground">{r.unit || "—"}</span>
      <span className="text-xs text-muted-foreground">{norm}</span>
      <span className="truncate text-xs text-muted-foreground print:hidden">{orderedBy || "—"}</span>
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

function SampleGroup({
  sample, search, isHistory, checkedParams, toggleParam, toggleGroup, allChecked,
}: {
  sample: any; search: string; isHistory?: boolean;
  checkedParams: Set<string>; toggleParam: (name: string) => void;
  toggleGroup: (names: string[], currentlyAllChecked: boolean) => void; allChecked: boolean;
}) {
  const q = search.trim().toLowerCase();
  const allResults = sample?.lab_results || [];
  const results = q ? allResults.filter((r: any) => r.parameter_name?.toLowerCase().includes(q)) : allResults;
  if (results.length === 0) return null;

  const dateStr = sample?.completed_at ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm") : "";
  const services = uniqueServices(sample);
  const label = services.map((s: any) => s.services?.name).filter(Boolean).join(" + ") || "Результат";
  const isAmbulatory = services[0]?.hospitalization_id === null;

  // ОАК is one panel with a fixed set of sub-parameters -- select
  // the whole thing as a unit, not each parameter individually.
  const isOak = services.length === 1 && services[0]?.services?.name === "ОАК";
  const oakParamNames = isOak ? results.map((r: any) => r.parameter_name) : [];
  const oakChecked = isOak && oakParamNames.length > 0 && oakParamNames.every((n: string) => checkedParams.has(n));

  return (
    <div className={isHistory ? "opacity-80" : undefined}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-2 py-1">
        <div className="flex min-w-0 items-center gap-2">
          {isOak && (
            <Checkbox
              checked={oakChecked}
              onCheckedChange={() => toggleGroup(oakParamNames, oakChecked)}
              className="print:hidden"
              aria-label="Выбрать ОАК"
            />
          )}
          <span className="truncate text-sm font-medium">{label}</span>
          {isAmbulatory && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">Амб.</span>
          )}
        </div>
        <span className="whitespace-nowrap text-xs text-muted-foreground">{dateStr}</span>
      </div>
      {results.map((r: any) => {
        const checked = checkedParams.has(r.parameter_name);
        return (
          <ParamTableRow
            key={r.id}
            r={r}
            dateStr={dateStr}
            orderedBy={resolveOrderedBy(sample, r)}
            checked={checked}
            onToggle={() => toggleParam(r.parameter_name)}
            printEligible={allChecked || checked}
            hideCheckbox={isOak}
          />
        );
      })}
    </div>
  );
}

// Small inline trend line -- no axes/tooltip, just the shape.
function Sparkline({ values }: { values: number[] }) {
  const w = 60, h = 22, pad = 2;
  if (values.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = pad + (i * (w - 2 * pad)) / (values.length - 1);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        points={points}
        className="text-primary"
      />
    </svg>
  );
}

function buildPivot(samples: any[], checkedParams: Set<string>) {
  const entries: { param: string; dateKey: number; dateLabel: string; value: string }[] = [];
  samples.forEach((s: any) => {
    const ts = s.completed_at ? new Date(s.completed_at).getTime() : 0;
    const dateLabel = s.completed_at ? format(new Date(s.completed_at), "dd.MM.yyyy") : "—";
    (s.lab_results || []).forEach((r: any) => {
      if (checkedParams.has(r.parameter_name)) {
        entries.push({ param: r.parameter_name, dateKey: ts, dateLabel, value: r.value });
      }
    });
  });
  const dateKeys = Array.from(new Set(entries.map((e) => e.dateKey))).sort((a, b) => a - b);
  const dateLabels = dateKeys.map((k) => entries.find((e) => e.dateKey === k)!.dateLabel);
  const rows = Array.from(checkedParams).map((param) => {
    const byDate: Record<number, string> = {};
    entries.filter((e) => e.param === param).forEach((e) => { byDate[e.dateKey] = e.value; });
    const numericSeries = dateKeys.map((k) => parseFloat(byDate[k])).filter((v) => !isNaN(v));
    return { param, byDate, numericSeries };
  });
  return { dateKeys, dateLabels, rows };
}

function DynamicsDialog({
  open, onOpenChange, samples, checkedParams,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; samples: any[]; checkedParams: Set<string>;
}) {
  const { dateKeys, dateLabels, rows } = buildPivot(samples, checkedParams);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Динамика показателей</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          {dateKeys.length === 0 ? (
            <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
              Нет исторических данных по выбранным показателям.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Показатель</th>
                  {dateLabels.map((d, i) => (
                    <th key={i} className="py-2 px-2 text-right whitespace-nowrap">{d}</th>
                  ))}
                  <th className="py-2 pl-4 text-center">Тренд</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.param} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.param}</td>
                    {dateKeys.map((k) => (
                      <td key={k} className="py-2 px-2 text-right font-mono">
                        {row.byDate[k] ?? "—"}
                      </td>
                    ))}
                    <td className="py-2 pl-4 text-center">
                      <Sparkline values={row.numericSeries} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PhysicianResultsTab({ hospitalizationId, patientId, hospitalId }: Props) {
  const [search, setSearch] = useState("");
  const [checkedParams, setCheckedParams] = useState<Set<string>>(new Set());
  const [dynamicsOpen, setDynamicsOpen] = useState(false);

  const toggleParam = (name: string) =>
    setCheckedParams((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const toggleGroup = (names: string[], currentlyAllChecked: boolean) =>
    setCheckedParams((prev) => {
      const next = new Set(prev);
      names.forEach((n) => (currentlyAllChecked ? next.delete(n) : next.add(n)));
      return next;
    });

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
  const allChecked = checkedParams.size === 0;

  const visibleParamNames = new Set<string>();
  [...current, ...history].forEach((s: any) => {
    (s.lab_results || []).forEach((r: any) => {
      if (!q || r.parameter_name?.toLowerCase().includes(q)) visibleParamNames.add(r.parameter_name);
    });
  });
  const allVisibleSelected = visibleParamNames.size > 0 &&
    Array.from(visibleParamNames).every((n) => checkedParams.has(n));
  const toggleSelectAll = () =>
    setCheckedParams(allVisibleSelected ? new Set() : new Set(visibleParamNames));

  return (
    <div className="space-y-1.5 lab-results-print-area">
      <div className="flex items-center gap-2 print:hidden">
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0 cursor-pointer">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleSelectAll} />
          Выбрать все
        </label>
        <Input
          placeholder="Поиск по названию показателя..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        {checkedParams.size > 0 && (
          <Button variant="outline" size="sm" onClick={() => setDynamicsOpen(true)} className="shrink-0">
            <LineChartIcon className="mr-1.5 h-4 w-4" />
            Динамика ({checkedParams.size})
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()} className="shrink-0">
          <Printer className="mr-1.5 h-4 w-4" />
          Печать
        </Button>
      </div>
      <div className="print:hidden" />

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
                <SampleGroup
                  key={s.id}
                  sample={s}
                  search={search}
                  checkedParams={checkedParams}
                  toggleParam={toggleParam}
                  toggleGroup={toggleGroup}
                  allChecked={allChecked}
                />
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="pt-1.5">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="text-sm text-blue-600 hover:underline print:hidden"
              >
                {showHistory ? "Скрыть историю" : `Показать историю (${history.length})`}
              </button>
              {showHistory && historyMatches > 0 && (
                <div className="mt-1.5">
                  <ParamTableHeader />
                  {history.map((s: any) => (
                    <SampleGroup
                      key={s.id}
                      sample={s}
                      search={search}
                      isHistory
                      checkedParams={checkedParams}
                      toggleParam={toggleParam}
                      toggleGroup={toggleGroup}
                      allChecked={allChecked}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <DynamicsDialog
        open={dynamicsOpen}
        onOpenChange={setDynamicsOpen}
        samples={samples}
        checkedParams={checkedParams}
      />
    </div>
  );
}
