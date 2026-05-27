import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, BedDouble } from "lucide-react";
import DischargeDialog from "@/components/inpatient/DischargeDialog";
import { cn } from "@/lib/utils";

export default function HospitalizationPage() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [selected, setSelected] = useState<{ roomId: string; bed: number } | null>(null);
  const [roomSubmitting, setRoomSubmitting] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["hospitalization", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("*, department_id, patients(*), departments(name), hospitalization_types(name_ru), hospitalization_urgency(name_ru), room_assignments(*, rooms(name, room_types(name)))")
        .eq("id", hospId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospId,
  });

  const deptId = (hosp as any)?.department_id;

  const { data: rooms = [] } = useQuery({
    queryKey: ["department-rooms", deptId, user?.hospitalId],
    queryFn: async () => {
      if (!deptId || !user?.hospitalId) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, capacity, room_types(name)")
        .eq("hospital_id", user.hospitalId)
        .eq("department_id", deptId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!deptId && !!user?.hospitalId,
  });

  const { data: occupiedBeds = [] } = useQuery({
    queryKey: ["occupied-beds", user?.hospitalId],
    queryFn: async () => {
      if (!user?.hospitalId) return [];
      const { data, error } = await supabase
        .from("room_assignments")
        .select("room_id, bed_number")
        .eq("hospital_id", user.hospitalId)
        .is("discharged_at", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const occupiedSet = useMemo(() => {
    const s = new Set<string>();
    for (const a of occupiedBeds as any[]) {
      s.add(`${a.room_id}-${a.bed_number}`);
    }
    return s;
  }, [occupiedBeds]);

  const handleAssignRoom = async () => {
    if (!selected) return;
    setRoomSubmitting(true);
    try {
      const { error } = await supabase.from("room_assignments").insert({
        hospitalization_id: hospId,
        room_id: selected.roomId,
        bed_number: String(selected.bed),
        assigned_at: new Date().toISOString(),
        hospital_id: user!.hospitalId,
        assigned_by: user!.id,
      });
      if (error) throw error;
      toast.success("Room assigned.");
      setRoomDialogOpen(false);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["hospitalization", hospId] });
      queryClient.invalidateQueries({ queryKey: ["occupied-beds", user!.hospitalId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to assign room");
    } finally {
      setRoomSubmitting(false);
    }
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!hosp) return <p className="text-destructive">Hospitalization not found.</p>;

  const patient = hosp.patients as any;
  const days = differenceInDays(new Date(), new Date(hosp.admitted_at));
  const currentAssignment = (hosp.room_assignments as any[])?.[0];
  const age = patient?.date_of_birth
    ? differenceInDays(new Date(), new Date(patient.date_of_birth)) / 365.25
    : null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/inpatient")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to Admissions
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>
            {patient?.last_name} {patient?.first_name}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              #{patient?.patient_number}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">DOB</span>
              <p>{patient?.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Age</span>
              <p>{age !== null ? Math.floor(age) : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Hosp #</span>
              <p className="font-mono">{hosp.hospitalization_number}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Type</span>
              <p>{(hosp.hospitalization_types as any)?.name_ru}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Urgency</span>
              <Badge variant="outline">{(hosp.hospitalization_urgency as any)?.name_ru}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Admitted</span>
              <p>{format(new Date(hosp.admitted_at), "MMM d, yyyy HH:mm")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Days</span>
              <p>{days}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Department</span>
              <p>{(hosp.departments as any)?.name}</p>
            </div>
            {hosp.discharged_at && (
              <div>
                <span className="text-muted-foreground">Discharged</span>
                <p>{format(new Date(hosp.discharged_at), "MMM d, yyyy HH:mm")}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Room Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Room Assignment</span>
            {!hosp.discharged_at && (
              <Button size="sm" onClick={() => { setSelected(null); setRoomDialogOpen(true); }}>
                Assign Room
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentAssignment ? (
            <p className="text-sm">
              Room: <span className="font-medium">{currentAssignment.rooms?.name}</span>
              {" · "}Bed: <span className="font-medium">{currentAssignment.bed_number}</span>
              {currentAssignment.rooms?.room_types?.name && (
                <> · Type: <span className="font-medium">{currentAssignment.rooms.room_types.name}</span></>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No room assigned yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Assign Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Select Room and Bed</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {rooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rooms available in this department.</p>
            ) : (
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
                          const isSelected = selected?.roomId === room.id && selected?.bed === bed;
                          const circle = (
                            <button
                              key={bed}
                              type="button"
                              disabled={occupied}
                              onClick={() => !occupied && setSelected({ roomId: room.id, bed })}
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
                              <TooltipContent>Occupied</TooltipContent>
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
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignRoom} disabled={!selected || roomSubmitting}>
              {roomSubmitting ? "Assigning…" : "Confirm Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
