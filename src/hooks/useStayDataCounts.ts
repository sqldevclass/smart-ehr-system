import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** How many records a hospitalization has in each part of the monitoring history. */
export interface StayDataCounts {
  scales: number;
  pain: number;
  glucose: number;
  fluid: number;
  notes: number;
  devices: number;
}

export function useStayDataCounts(hospitalizationId: string) {
  return useQuery({
    queryKey: ["stay-data-counts", hospitalizationId],
    queryFn: async (): Promise<StayDataCounts> => {
      const { data, error } = await supabase.rpc("get_stay_data_counts" as any, {
        p_hospitalization_id: hospitalizationId,
      });
      if (error) throw error;
      return data as unknown as StayDataCounts;
    },
  });
}
