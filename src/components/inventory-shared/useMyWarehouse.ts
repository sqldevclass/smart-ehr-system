import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useMyWarehouse(warehouseTypeCode: "central_pharmacy" | "general") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-warehouse", user?.hospitalId, warehouseTypeCode],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, warehouse_types!inner(code)")
        .eq("hospital_id", user!.hospitalId)
        .eq("warehouse_types.code", warehouseTypeCode)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string } | null;
    },
  });
}
