import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { FlagBadge } from "@/pages/lab/LabResultsPage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [selectedSample, setSelectedSample] = useState<any>(null);

  return (
    <div className="space-y-2">
      {current.length === 0 && history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет результатов.</p>
      ) : (
        <>
          <div className="divide-y border rounded">
            {current.map((s: any) => (
              <ResultRow
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
                    <ResultRow
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

      <Dialog
        open={!!selectedSample}
        onOpenChange={(open) => !open && setSelectedSample(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedSample?.visit_services?.services?.name}
              {selectedSample?.completed_at && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {format(
                    new Date(selectedSample.completed_at),
                    "dd.MM.yyyy HH:mm"
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedSample && <ResultDetail sample={selectedSample} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultRow({
  sample,
  isHistory,
  onClick,
}: {
  sample: any;
  isHistory?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left ${
        isHistory ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium truncate">
          {sample.visit_services?.services?.name}
        </span>
        {sample.visit_services?.hospitalization_id === null && (
          <span className="text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">
            Амб.
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
        {sample.completed_at
          ? format(new Date(sample.completed_at), "dd.MM.yyyy HH:mm")
          : ""}
      </span>
    </button>
  );
}

function ResultDetail({ sample }: { sample: any }) {
  return (
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
  );
}
