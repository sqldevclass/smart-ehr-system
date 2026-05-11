import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, differenceInDays, differenceInYears } from "date-fns";
import { PeriodFilter, PeriodState, getDateBounds, getTodayBounds, SummaryCard, MetricTile } from "@/components/shared/PeriodFilter";

export default function InpatientPatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periodState, setPeriodState] = useState<PeriodState>({ period: "today" });
  const bounds = getDateBounds(periodState);
  const { data: physicianId } = useQuery({
    queryKey: ["physician-id", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id")
        .eq("profile_id", user!.id)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user,
  });

  const { data: hospitalizations = [], isLoading } = useQuery({
    queryKey: ["physician-inpatients", physicianId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, discharged_at, department_id, departments(name), patients(id, first_name, last_name, patient_number, date_of_birth), room_assignments(bed_number, rooms(name))")
        .eq("hospital_id", user!.hospitalId)
        .eq("primary_physician_id", physicianId!)
        .is("discharged_at", null)
        .order("admitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!physicianId && !!user?.hospitalId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Inpatients</CardTitle>
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
                <TableHead>DOB / Age</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Room / Bed</TableHead>
                <TableHead>Days</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hospitalizations.map((h: any, i: number) => {
                const p = h.patients;
                const ra = h.room_assignments?.[0];
                const days = differenceInDays(new Date(), new Date(h.admitted_at));
                const age = p?.date_of_birth ? differenceInYears(new Date(), new Date(p.date_of_birth)) : null;
                return (
                  <TableRow key={h.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{p?.last_name} {p?.first_name}</TableCell>
                    <TableCell className="font-mono text-xs">{p?.patient_number}</TableCell>
                    <TableCell>
                      {p?.date_of_birth ? format(new Date(p.date_of_birth), "MMM d, yyyy") : "—"}
                      {age !== null && <span className="text-muted-foreground"> ({age}y)</span>}
                    </TableCell>
                    <TableCell>{h.departments?.name || "—"}</TableCell>
                    <TableCell>{ra ? `${ra.rooms?.name} / Bed ${ra.bed_number}` : "—"}</TableCell>
                    <TableCell>{days}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/physician/inpatient/${h.id}`)}>
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
