import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Most rows a past-stay list loads by default; callers say so in the UI when a stay has more. */
export const STAY_ROWS_LIMIT = 50;

export type StayTable =
  | "pain_scale_readings"
  | "blood_glucose_readings"
  | "nursing_daily_notes"
  | "nurse_device_monitoring_records";

interface Params {
  table: StayTable;
  select: string;
  hospitalizationId: string;
  orderBy: string;
  limit?: number;
}

/** The newest rows one hospitalization recorded in a nursing table. */
export function useStayRows<T>({ table, select, hospitalizationId, orderBy, limit = STAY_ROWS_LIMIT }: Params) {
  return useQuery({
    queryKey: ["stay-rows", table, hospitalizationId, limit],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase
        .from(table as any) // nurse_device_monitoring_records is not in the generated types
        .select(select)
        .eq("hospitalization_id", hospitalizationId)
        .order(orderBy, { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
  });
}
