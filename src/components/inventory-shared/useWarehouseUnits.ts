import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WarehouseUnit {
  equipment_id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  serial_number: string | null;
  model: string | null;
  info_status: "pending" | "ready";
  purchase_price: number | null;
  purchase_date: string | null;
}

export function useWarehouseUnits(warehouseId: string | null | undefined) {
  const query = useQuery({
    queryKey: ["warehouse-units", warehouseId],
    enabled: !!warehouseId,
    queryFn: async (): Promise<WarehouseUnit[]> => {
      const { data, error } = await supabase.rpc("list_available_units" as any, { p_warehouse_id: warehouseId } as any);
      if (error) throw error;
      return (data ?? []) as unknown as WarehouseUnit[];
    },
  });
  const units = query.data ?? [];
  const byBatch = useMemo(() => {
    const result = new Map<string, WarehouseUnit[]>();
    for (const unit of units) result.set(unit.batch_id, [...(result.get(unit.batch_id) ?? []), unit]);
    return result;
  }, [query.data]);
  return { ...query, units, byBatch };
}