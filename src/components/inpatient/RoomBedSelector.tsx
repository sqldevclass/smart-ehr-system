import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RoomBedValue {
  roomId: string;
  bedNumber: number | null;
}

interface Props {
  hospitalId: string;
  departmentId: string;
  value: RoomBedValue;
  onChange: (v: RoomBedValue) => void;
}

export function RoomBedSelector({ hospitalId, departmentId, value, onChange }: Props) {
  const { data: rooms = [] } = useQuery({
    queryKey: ["rbs-rooms", departmentId, hospitalId],
    queryFn: async () => {
      if (!departmentId || !hospitalId) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, capacity, room_types(name)")
        .eq("hospital_id", hospitalId)
        .eq("department_id", departmentId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!departmentId && !!hospitalId,
  });

  const { data: occupiedBeds = [] } = useQuery({
    queryKey: ["rbs-occupied", hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_assignments")
        .select("room_id, bed_number")
        .eq("hospital_id", hospitalId)
        .is("discharged_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospitalId,
  });

  const occupiedSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of occupiedBeds as any[]) s.add(`${a.room_id}-${a.bed_number}`);
    return s;
  }, [occupiedBeds]);

  if (!departmentId) {
    return <p className="text-sm text-muted-foreground">Отделение не указано.</p>;
  }
  if (rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет палат в этом отделении.</p>;
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1">
      <TooltipProvider>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(rooms as any[]).map((room) => (
            <div key={room.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{room.name}</span>
                </div>
                {room.room_types?.name && (
                  <Badge variant="outline" className="text-xs">{room.room_types.name}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: room.capacity || 0 }, (_, i) => i + 1).map((bed) => {
                  const occupied = occupiedSet.has(`${room.id}-${bed}`);
                  const isSelected = value.roomId === room.id && value.bedNumber === bed;
                  const circle = (
                    <button
                      key={bed}
                      type="button"
                      disabled={occupied}
                      onClick={() => !occupied && onChange({ roomId: room.id, bedNumber: bed })}
                      className={cn(
                        "h-9 w-9 rounded-full text-xs font-medium border transition-colors flex items-center justify-center",
                        occupied
                          ? "bg-muted text-muted-foreground border-muted cursor-not-allowed"
                          : isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25"
                      )}
                    >
                      {bed}
                    </button>
                  );
                  return occupied ? (
                    <Tooltip key={bed}>
                      <TooltipTrigger asChild>
                        <span>{circle}</span>
                      </TooltipTrigger>
                      <TooltipContent>Занято</TooltipContent>
                    </Tooltip>
                  ) : (
                    circle
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}
