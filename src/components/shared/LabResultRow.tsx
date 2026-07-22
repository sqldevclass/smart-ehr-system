import { format } from "date-fns";
import { FlagBadge } from "@/pages/lab/LabResultsPage";

export function linkedServices(sample: any) {
  return (sample?.lab_sample_services || [])
    .map((l: any) => l.visit_services)
    .filter(Boolean);
}

export function uniqueServices(sample: any) {
  const seen = new Set();
  const out: any[] = [];
  for (const s of linkedServices(sample)) {
    const sid = s.services?.id;
    if (sid && !seen.has(sid)) {
      seen.add(sid);
      out.push(s);
    }
  }
  return out;
}

function ParamList({ results }: { results: any[] }) {
  return (
    <div className="divide-y">
      {results.map((r: any) => (
        <div
          key={r.id}
          className="flex items-center justify-between py-1 text-xs"
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
  );
}

export function LabResultCard({
  sample,
  isHistory,
}: {
  sample: any;
  isHistory?: boolean;
}) {
  const services = uniqueServices(sample);
  const isCombo = services.length > 1;
  const hospId = services[0]?.hospitalization_id;

  return (
    <div
      className={`border rounded p-2 space-y-2 ${isHistory ? "opacity-80" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate">
            {isCombo
              ? `Комбинированный анализ (${services.length})`
              : services[0]?.services?.name}
          </span>
          {hospId === null && (
            <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
              Амб.
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {sample?.completed_at
            ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")
            : ""}
        </span>
      </div>
      <ParamList results={sample?.lab_results || []} />
    </div>
  );
}
