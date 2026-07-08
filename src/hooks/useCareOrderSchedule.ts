import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCareOrderSchedule(hospitalId: string | undefined) {
  const { data: occurrences = [] } = useQuery({
    queryKey: ["care-order-schedule-all", hospitalId],
    enabled: !!hospitalId,
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_order_occurrences")
        .select(`
          id, order_id, scheduled_at, status,
          hospitalization_orders!inner(hospitalization_id, order_type, hospital_id)
        `)
        .eq("hospitalization_orders.hospital_id", hospitalId!)
        .eq("hospitalization_orders.order_type", "care")
        .eq("status", "pending");
      if (error) throw error;
      return data || [];
    },
  });

  const computeStatus = (scheduledAt: string): "overdue" | "due_soon" | "ok" => {
    const diffMin = (new Date(scheduledAt).getTime() - Date.now()) / 60000;
    if (diffMin <= 0) return "overdue";
    if (diffMin <= 30) return "due_soon";
    return "ok";
  };

  const getHospitalizationStatus = (hospId: string): "overdue" | "due_soon" | "ok" | "none" => {
    const relevant = (occurrences as any[]).filter(
      (o) => o.hospitalization_orders?.hospitalization_id === hospId,
    );
    if (relevant.length === 0) return "none";
    let worst: "overdue" | "due_soon" | "ok" = "ok";
    for (const o of relevant) {
      const s = computeStatus(o.scheduled_at);
      if (s === "overdue") { worst = "overdue"; break; }
      if (s === "due_soon") worst = "due_soon";
    }
    return worst;
  };

  const getOccurrenceStatus = (occurrenceId: string): "overdue" | "due_soon" | "ok" | "none" => {
    const o = (occurrences as any[]).find((x) => x.id === occurrenceId);
    if (!o) return "none";
    return computeStatus(o.scheduled_at);
  };

  return { getHospitalizationStatus, getOccurrenceStatus };
}
