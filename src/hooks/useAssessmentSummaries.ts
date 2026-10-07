import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { AssessmentSummary } from "@/lib/assessmentCell";

export function useAssessmentSummaries(hospitalizationIds: string[]) {
  const { user } = useAuth();
  const key = [...hospitalizationIds].sort().join(",");
  return useQuery({
    queryKey: ["assessment-summaries", user?.hospitalId, key],
    enabled: !!user?.hospitalId && hospitalizationIds.length > 0,
    staleTime: 0,
    refetchInterval: 300000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_assessment_summaries" as any, {
        p_hospitalization_ids: hospitalizationIds,
      });
      if (error) {
        console.error("get_assessment_summaries failed", error);
        throw error;
      }
      const map: Record<string, AssessmentSummary> = {};
      ((data as any[]) ?? []).forEach((r) => {
        map[r.hospitalization_id] = r.summary as AssessmentSummary;
      });
      return map;
    },
  });
}
