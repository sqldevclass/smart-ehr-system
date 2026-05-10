import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { differenceInDays } from "date-fns";

export default function NursePatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: hospitalizations = [], isLoading } = useQuery({
    queryKey: ["nurse-active-hosp", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, departments(name), patients(first_name, last_name, patient_number, date_of_birth), room_assignments(bed_number, rooms(name)), primary_physician_id, physicians(profiles(full_name))")
        .eq("hospital_id", user!.hospitalId)
        .is("discharged_at", null)
        .order("admitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const handleView = () => {
    toast.info("Patient view coming in Phase 9.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inpatients</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !hospitalizations.length ? (
          <p className="text-muted-foreground text-sm">No active inpatients.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Patient #</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Room / Bed</TableHead>
                <TableHead>Physician</TableHead>
                <TableHead>Days</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hospitalizations.map((h: any, i: number) => {
                const p = h.patients;
                const ra = h.room_assignments?.[0];
                const days = differenceInDays(new Date(), new Date(h.admitted_at));
                return (
                  <TableRow key={h.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{p?.last_name} {p?.first_name}</TableCell>
                    <TableCell className="font-mono text-xs">{p?.patient_number}</TableCell>
                    <TableCell>{h.departments?.name || "—"}</TableCell>
                    <TableCell>{ra ? `${ra.rooms?.name} / Bed ${ra.bed_number}` : "—"}</TableCell>
                    <TableCell>{h.physicians?.profiles?.full_name || "—"}</TableCell>
                    <TableCell>{days}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={handleView}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
