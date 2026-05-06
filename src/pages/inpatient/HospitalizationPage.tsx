import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";

export default function HospitalizationPage() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [bedNumber, setBedNumber] = useState("");
  const [roomSubmitting, setRoomSubmitting] = useState(false);

  const [dischargeDialogOpen, setDischargeDialogOpen] = useState(false);
  const [dischargeType, setDischargeType] = useState("discharged");
  const [dischargeSubmitting, setDischargeSubmitting] = useState(false);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["hospitalization", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("*, patients(*), departments(name), hospitalization_types(name_ru), hospitalization_urgency(name_ru), room_assignments(*, rooms(name, room_type))")
        .eq("id", hospId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospId,
  });

  const { data: rooms } = useQuery({
    queryKey: ["department-rooms", hosp?.department_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id, name, room_type")
        .eq("department_id", hosp!.department_id)
        .order("name");
      return data || [];
    },
    enabled: !!hosp?.department_id,
  });

  const handleAssignRoom = async () => {
    if (!selectedRoomId || !bedNumber) return;
    setRoomSubmitting(true);
    try {
      const { error } = await supabase.from("room_assignments").insert({
        hospitalization_id: hospId,
        room_id: selectedRoomId,
        bed_number: bedNumber,
        assigned_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Room assigned.");
      setRoomDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hospitalization", hospId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to assign room");
    } finally {
      setRoomSubmitting(false);
    }
  };

  const handleDischarge = async () => {
    setDischargeSubmitting(true);
    try {
      const { error } = await supabase
        .from("hospitalizations")
        .update({
          discharged_at: new Date().toISOString(),
          discharge_type: dischargeType,
        })
        .eq("id", hospId!);
      if (error) throw error;
      toast.success("Patient discharged.");
      setDischargeDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hospitalization", hospId] });
      queryClient.invalidateQueries({ queryKey: ["active-hospitalizations"] });
      navigate("/inpatient");
    } catch (err: any) {
      toast.error(err.message || "Failed to discharge");
    } finally {
      setDischargeSubmitting(false);
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
          <CardTitle className="flex items-center justify-between">
            <span>
              {patient?.last_name} {patient?.first_name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                #{patient?.patient_number}
              </span>
            </span>
            {!hosp.discharged_at && (
              <Button variant="destructive" size="sm" onClick={() => setDischargeDialogOpen(true)}>
                Discharge
              </Button>
            )}
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
              <Button size="sm" onClick={() => { setSelectedRoomId(""); setBedNumber(""); setRoomDialogOpen(true); }}>
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
              {currentAssignment.rooms?.room_type && (
                <> · Type: <span className="font-medium">{currentAssignment.rooms.room_type}</span></>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No room assigned yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Assign Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Room</Label>
              <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {rooms?.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} {r.room_type ? `(${r.room_type})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bed Number</Label>
              <Input value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} placeholder="e.g. 1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignRoom} disabled={!selectedRoomId || !bedNumber || roomSubmitting}>
              {roomSubmitting ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discharge Dialog */}
      <Dialog open={dischargeDialogOpen} onOpenChange={setDischargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discharge Patient</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Discharge Type</Label>
            <Select value={dischargeType} onValueChange={setDischargeType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="discharged">Discharged</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="deceased">Deceased</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDischarge} disabled={dischargeSubmitting}>
              {dischargeSubmitting ? "Discharging…" : "Confirm Discharge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
