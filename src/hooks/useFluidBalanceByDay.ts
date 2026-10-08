import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import type { FluidDay } from "@/lib/fluidBalance";

/** Intake and output per local calendar day for one hospitalization, newest day first. */
export function useFluidBalanceByDay(hospitalizationId: string) {
  const timezone = useHospitalTimezone();
  return useQuery({
    queryKey: ["fluid-balance-by-day", hospitalizationId, timezone],
    queryFn: async (): Promise<FluidDay[]> => {
      const { data, error } = await supabase.rpc("get_fluid_balance_by_day" as any, {
        p_hospitalization_id: hospitalizationId,
        p_timezone: timezone,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row: any) => ({
        day: row.day,
        intake_ml: Number(row.intake_ml),
        output_ml: Number(row.output_ml),
      }));
    },
  });
}
