import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ClinicBlock { id: string; name: string; is_active: boolean }
export interface ClinicFloor { id: string; block_id: string; number: number; label: string | null }
type RoomFloor = { floor_id: string | null; department_id: string | null };
type DepartmentFloor = { id: string; floor_id: string | null };

export function effectiveRoomFloorId(room: RoomFloor, departments: DepartmentFloor[]): string | null {
  return room.floor_id ?? departments.find(d => d.id === room.department_id)?.floor_id ?? null;
}

export function isInheritedFloor(room: RoomFloor, departments: DepartmentFloor[]): boolean {
  return room.floor_id === null && effectiveRoomFloorId(room, departments) !== null;
}

export const floorLabel = (floor: ClinicFloor) => {
  if (floor.label) return floor.label;
  if (floor.number > 0) return `${floor.number} этаж`;
  if (floor.number === 0) return "Цокольный";
  if (floor.number === -1) return "Подвал";
  return `Подвал ${Math.abs(floor.number)}`;
};

export function useClinicStructure() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["clinic-structure", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      if (!user) return { blocks: [] as ClinicBlock[], floors: [] as ClinicFloor[] };
      const [blocks, floors] = await Promise.all([
        supabase.from("clinic_blocks").select("id, name, is_active").eq("hospital_id", user.hospitalId).order("name"),
        supabase.from("clinic_floors").select("id, block_id, number, label").eq("hospital_id", user.hospitalId).order("number"),
      ]);
      if (blocks.error) throw blocks.error;
      if (floors.error) throw floors.error;
      const blockRows = (blocks.data || []) as ClinicBlock[];
      const floorRows = (floors.data || []) as ClinicFloor[];
      const order = new Map(blockRows.map((b, i) => [b.id, i]));
      floorRows.sort((a, b) => (order.get(a.block_id) ?? 0) - (order.get(b.block_id) ?? 0) || a.number - b.number);
      return { blocks: blockRows, floors: floorRows };
    },
  });
  const blocks = query.data?.blocks ?? [];
  const floors = query.data?.floors ?? [];
  const floorsByBlock = useMemo(() => {
    const map = new Map<string, ClinicFloor[]>();
    for (const floor of floors) map.set(floor.block_id, [...(map.get(floor.block_id) ?? []), floor]);
    return map;
  }, [floors]);
  const getFloor = (id: string | null | undefined) => floors.find(f => f.id === id);
  const formatFloor = (id: string | null | undefined) => {
    const floor = getFloor(id);
    const block = blocks.find(b => b.id === floor?.block_id);
    return floor && block ? `${block.name} · ${floorLabel(floor)}` : "—";
  };
  return { ...query, blocks, floors, floorsByBlock, getFloor, formatFloor };
}