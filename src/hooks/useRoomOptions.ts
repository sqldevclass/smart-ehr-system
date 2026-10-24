import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useRoomOptions(config: { departmentCode: string; roomTypeName: string }) {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;

  return useQuery({
    queryKey: ["room-options", hospitalId, config.departmentCode, config.roomTypeName],
    enabled: !!hospitalId,
    queryFn: async () => {
      if (!hospitalId) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, is_active, departments!inner(code), room_types!inner(name)")
        .eq("hospital_id", hospitalId)
        .eq("departments.code", config.departmentCode)
        .eq("room_types.name", config.roomTypeName);
      if (error) throw error;
      return (data ?? [])
        .map((room) => ({ id: room.id, name: room.name, isActive: room.is_active }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    },
  });
}