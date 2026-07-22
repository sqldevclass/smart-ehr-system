import { useState } from "react";
import { format } from "date-fns";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function linkedServices(sample: any) {
  return (sample?.lab_sample_services || [])
    .map((l: any) => l.visit_services)
    .filter(Boolean);
}

export function LabResultRow({
  sample,
  isHistory,
  onClick,
}: {
  sample: any;
  isHistory?: boolean;
  onClick: () => void;
}) {
  const services = linkedServices(sample);
  const isCombo = services.length > 1;
  const primaryName = services[0]?.services?.name || "—";
  const hospId = services[0]?.hospitalization_id;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left ${
        isHistory ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium truncate">{primaryName}</span>
        {isCombo && (
          <span className="text-[10px] rounded bg-muted text-muted-foreground px-1.5 py-0.5 font-medium">
            +{services.length - 1}
          </span>
        )}
        {hospId === null && (
          <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
            Амб.
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
        {sample?.completed_at
          ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")
          : ""}
      </span>
    </button>
  );
}

export function LabResultDialog({
  sample,
  open,
  onOpenChange,
}: {
  sample: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const services = sample ? linkedServices(sample) : [];
  const isCombo = services.length > 1;
  const [expandedServiceIds, setExpandedServiceIds] = useState<Set<string>>(
    new Set(),
  );

  const toggleService = (id: string) => {
    setExpandedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resultsForService = (serviceId: string) =>
    (sample?.lab_results || []).filter(
      (r: any) => r.lab_parameter_templates?.service_id === serviceId,
    );

  const renderParamList = (results: any[]) => (
    <div className="divide-y">
      {results.map((r: any) => (
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCombo
              ? `Комбинированный анализ (${services.length})`
              : services[0]?.services?.name}
            {sample?.completed_at && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {!isCombo ? (
          renderParamList(sample?.lab_results || [])
        ) : (
          <div className="divide-y border rounded">
            {services.map((s: any) => {
              const svcId = s.services?.id;
              const isOpen = expandedServiceIds.has(svcId);
              return (
                <div key={svcId}>
                  <button
                    type="button"
                    onClick={() => toggleService(svcId)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50"
                  >
                    <span>{s.services?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {isOpen ? "▲" : "▼"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-2">
                      {renderParamList(resultsForService(svcId))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
