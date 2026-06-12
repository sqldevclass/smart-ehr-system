import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  hospitalId: string;
  variant?: "banner" | "list";
}

const SEVERITY_ORDER: Record<string, number> = {
  contraindicated: 0, major: 1, moderate: 2, minor: 3,
};

const SEVERITY_STYLE: Record<string, string> = {
  contraindicated: "bg-red-100 text-red-800 border-red-300",
  major: "bg-red-50 text-red-700 border-red-200",
  moderate: "bg-amber-50 text-amber-800 border-amber-200",
  minor: "bg-blue-50 text-blue-700 border-blue-200",
};

const SEVERITY_LABEL: Record<string, string> = {
  contraindicated: "Противопоказано",
  major: "Серьёзное",
  moderate: "Умеренное",
  minor: "Незначительное",
};

export function useInteractionCount(hospitalizationId: string, hospitalId: string) {
  return useQuery({
    queryKey: ["patient-interactions", hospitalizationId],
    enabled: !!hospitalizationId && !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("detect_patient_interactions", {
        p_hospitalization_id: hospitalizationId,
        p_hospital_id: hospitalId,
      });
      if (error) throw error;
      return data || [];
    },
  });
}

export default function InteractionWarnings({
  hospitalizationId, hospitalId, variant = "banner",
}: Props) {
  const { data: interactions = [] } = useInteractionCount(hospitalizationId, hospitalId);

  if (interactions.length === 0) return null;

  const sorted = [...interactions].sort(
    (a: any, b: any) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  if (variant === "banner") {
    const worst = sorted[0]?.severity ?? "moderate";
    return (
      <div className={cn("border rounded-md p-3 space-y-2", SEVERITY_STYLE[worst])}>
        <div className="flex items-center gap-2 font-semibold text-sm">
          <AlertTriangle className="h-4 w-4" />
          Обнаружены лекарственные взаимодействия ({sorted.length})
        </div>
        <div className="space-y-1.5">
          {sorted.map((ix: any, i: number) => (
            <div key={i} className="text-xs space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{ix.drug_a_name} + {ix.drug_b_name}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", SEVERITY_STYLE[ix.severity])}>
                  {SEVERITY_LABEL[ix.severity] ?? ix.severity}
                </span>
              </div>
              {ix.clinical_effect && <p className="text-[11px] opacity-90">{ix.clinical_effect}</p>}
              {ix.actions_recommendations && (
                <p className="text-[11px] italic opacity-80">→ {ix.actions_recommendations}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((ix: any, i: number) => (
        <div key={i} className={cn("border rounded-md p-3 space-y-1", SEVERITY_STYLE[ix.severity])}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{ix.drug_a_name} + {ix.drug_b_name}</span>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", SEVERITY_STYLE[ix.severity])}>
              {SEVERITY_LABEL[ix.severity] ?? ix.severity}
            </span>
          </div>
          {ix.clinical_effect && <p className="text-xs">{ix.clinical_effect}</p>}
          {ix.clinical_significance && <p className="text-xs opacity-80">{ix.clinical_significance}</p>}
          {ix.actions_recommendations && (
            <p className="text-xs italic">→ {ix.actions_recommendations}</p>
          )}
        </div>
      ))}
    </div>
  );
}
