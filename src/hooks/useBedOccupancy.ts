import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface BedRow {
  department_id: string | null;
  department_name: string | null;
  room_id: string;
  room_name: string | null;
  room_type_name: string | null;
  capacity: number;
  bed_number: string | number;
  is_occupied: boolean;
  hospitalization_id: string | null;
  hospitalization_number: string | number | null;
  patient_id: string | null;
  patient_number: string | number | null;
  last_name: string | null;
  first_name: string | null;
  assigned_at: string | null;
}

export function useBedOccupancy(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bed-occupancy", user?.hospitalId],
    enabled: enabled && !!user?.hospitalId,
    queryFn: async () => {
      if (!user?.hospitalId) return [];
      const { data, error } = await supabase.rpc<
        "get_bed_occupancy",
        { p_hospital_id: string },
        { Row: BedRow; Result: BedRow[]; RelationName: "get_bed_occupancy"; Relationships: null }
      >("get_bed_occupancy", { p_hospital_id: user.hospitalId });
      if (error) throw error;
      return data ?? [];
    },
  });
}