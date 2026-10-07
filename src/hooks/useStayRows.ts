import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Most rows a past-stay list loads; callers say so in the UI when a stay has more. */
export const STAY_ROWS_LIMIT = 50;

export type StayTable = "pain_scale_readings" | "blood_glucose_readings" | "nursing_daily_notes";

interface Params {
  table: StayTable;
  select: string;
  hospitalizationId: string;
  orderBy: string;
}

/** The newest rows one hospitalization recorded in a nursing table. */
export function useStayRows<T>({ table, select, hospitalizationId, orderBy }: Params) {
  return useQuery({
    queryKey: ["stay-rows", table, hospitalizationId],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq("hospitalization_id", hospitalizationId)
        .order(orderBy, { ascending: false })
        .limit(STAY_ROWS_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}
