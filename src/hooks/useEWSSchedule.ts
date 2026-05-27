import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEWSSchedule(hospitalId: string | undefined) {
  const { data: schedules = [] } = useQuery({
    queryKey: ["ews-schedule-all", hospitalId],
    enabled: !!hospitalId,
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ews_schedule")
        .select("hospitalization_id, next_due_at, last_score, is_active")
        .eq("hospital_id", hospitalId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  const scheduleMap = useMemo(() => {
    const map: Record<string, any> = {};
    schedules.forEach((s: any) => {
      map[s.hospitalization_id] = s;
    });
    return map;
  }, [schedules]);

  const getStatus = (hospId: string): "overdue" | "due_soon" | "ok" | "none" => {
    const s = scheduleMap[hospId];
    if (!s) return "none";
    const now = new Date();
    const due = new Date(s.next_due_at);
    const diffMin = (due.getTime() - now.getTime()) / 60000;
    if (diffMin <= 0) return "overdue";
    if (diffMin <= 30) return "due_soon";
    return "ok";
  };

  return { scheduleMap, getStatus };
}
