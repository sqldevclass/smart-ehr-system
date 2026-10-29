import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyWarehouse } from "./useMyWarehouse";

export function usePendingStockOrderCount(warehouseTypeCode: "general" | "central_pharmacy") {
  const { data: warehouse } = useMyWarehouse(warehouseTypeCode);
  const { data = 0 } = useQuery({
    queryKey: ["stock-orders-pending-count", warehouse?.id],
    enabled: !!warehouse?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      if (!warehouse) return 0;
      try {
        const { count, error } = await (supabase as any).from("stock_order_items")
          .select("id, stock_orders!inner(from_warehouse_id)", { count: "exact", head: true })
          .eq("status", "pending").eq("stock_orders.from_warehouse_id", warehouse.id);
        return error ? 0 : count ?? 0;
      } catch { return 0; }
    },
  });
  return data as number;
}