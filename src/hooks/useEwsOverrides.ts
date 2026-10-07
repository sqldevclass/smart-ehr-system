import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Active patient-specific PEWS threshold overrides for one hospitalization, keyed by parameter id. */
export function useEwsOverrides(hospitalizationId: string | undefined) {
  const { data: overrides = [], isLoading, refetch } = useQuery({
    queryKey: ["ews-overrides", hospitalizationId],
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ews_patient_overrides")
        .select("parameter_id, override_min, override_max, reason")
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_active", true);
      return data || [];
    },
  });

  const overrideMap = useMemo(() => {
    const map: Record<string, any> = {};
    overrides.forEach((o: any) => {
      map[o.parameter_id] = o;
    });
    return map;
  }, [overrides]);

  return { overrides, overrideMap, isLoading, refetchOverrides: refetch };
}
