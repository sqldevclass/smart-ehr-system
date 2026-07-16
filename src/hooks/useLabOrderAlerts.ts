import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useLabOrderAlerts(hospitalId: string | undefined) {
  const { data: preliminaryOrders = [] } = useQuery({
    queryKey: ["lab-order-alerts-all", hospitalId],
    enabled: !!hospitalId,
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select(`
          id, hospitalization_id,
          service_statuses!inner(code),
          services!inner(service_type_id, service_types!inner(code))
        `)
        .eq("hospital_id", hospitalId!)
        .eq("service_statuses.code", "preliminary");
      if (error) throw error;
      return (data || []).filter(
        (r: any) => r.services?.service_types?.code === "laboratory",
      );
    },
  });

  const getHospitalizationStatus = (hospId: string): "overdue" | "none" => {
    const has = (preliminaryOrders as any[]).some(
      (o) => o.hospitalization_id === hospId,
    );
    return has ? "overdue" : "none";
  };

  return { getHospitalizationStatus };
}
