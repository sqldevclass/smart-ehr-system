import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface StructureDepartment {
  id: string;
  name: string;
  code: string | null;
  floor_id: string | null;
  is_active: boolean;
}

export interface StructureRoom {
  id: string;
  name: string;
  room_type_id: string | null;
  capacity: number;
  is_active: boolean;
  department_id: string | null;
  floor_id: string | null;
  room_types: { name: string; is_office_room?: boolean } | null;
}

export interface StructureWarehouse {
  id: string;
  name: string;
  is_active: boolean;
  warehouse_type_id: string | null;
  department_id: string | null;
  floor_id: string | null;
  warehouse_types: { name_ru: string } | null;
  departments: { name: string } | null;
}

export function useClinicStructureData() {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId ?? "";

  const departmentsQuery = useQuery({
    queryKey: ["departments", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code, is_active, floor_id")
        .eq("hospital_id", hospitalId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as StructureDepartment[];
    },
  });

  const roomsQuery = useQuery({
    queryKey: ["rooms", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_type_id, capacity, is_active, department_id, floor_id, room_types(name, is_office_room)")
        .eq("hospital_id", hospitalId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as StructureRoom[];
    },
  });

  const warehousesQuery = useQuery({
    queryKey: ["warehouses", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, is_active, warehouse_type_id, department_id, floor_id, warehouse_types(name_ru), departments(name)")
        .eq("hospital_id", hospitalId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as StructureWarehouse[];
    },
  });

  return {
    departmentsQuery,
    roomsQuery,
    warehousesQuery,
    departments: departmentsQuery.data ?? [],
    rooms: roomsQuery.data ?? [],
    warehouses: warehousesQuery.data ?? [],
  };
}
