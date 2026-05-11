import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { differenceInDays } from "date-fns";
import { PeriodFilter, PeriodState, getDateBounds, getTodayBounds, SummaryCard, MetricTile } from "@/components/shared/PeriodFilter";

export default function NursePatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [periodState, setPeriodState] = useState<PeriodState>({ period: "today" });
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const bounds = getDateBounds(periodState);

  const { data: departments = [] } = useQuery({
    queryKey: ["nurse-departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: hospitalizations = [], isLoading } = useQuery({
    queryKey: ["nurse-active-hosp", user?.hospitalId, bounds.from, bounds.to, deptFilter],
    queryFn: async () => {
      let q = supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, department_id, departments(name), patients(first_name, last_name, patient_number, date_of_birth), room_assignments(bed_number, rooms(name)), primary_physician_id, physicians(profiles(full_name))")
        .eq("hospital_id", user!.hospitalId)
        .gte("admitted_at", bounds.from)
        .lte("admitted_at", bounds.to)
        .order("admitted_at", { ascending: false });
      if (deptFilter !== "all") q = q.eq("department_id", deptFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: summary } = useQuery({
    queryKey: ["nurse-summary", user?.hospitalId],
    queryFn: async () => {
      const today = getTodayBounds();
      const [activeRes, todayRes] = await Promise.all([
        supabase.from("hospitalizations")
          .select("id, department_id, departments(name)")
          .eq("hospital_id", user!.hospitalId)
          .is("discharged_at", null),
        supabase.from("hospitalizations")
          .select("id", { count: "exact", head: true })
          .eq("hospital_id", user!.hospitalId)
          .gte("admitted_at", today.from).lte("admitted_at", today.to),
      ]);
      const activeRows = activeRes.data || [];
      const byDept = new Map<string, number>();
      for (const r of activeRows as any[]) {
        const name = r.departments?.name || "—";
        byDept.set(name, (byDept.get(name) || 0) + 1);
      }
      const top3 = Array.from(byDept.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      return {
        active: activeRows.length,
        admittedToday: todayRes.count || 0,
        top3,
      };
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
      <CardContent className="space-y-4">
        <SummaryCard>
          <MetricTile label="Total Active" value={summary?.active ?? "—"} highlight />
          <MetricTile label="Admitted Today" value={summary?.admittedToday ?? "—"} />
          {(summary?.top3 || []).map(([name, count]) => (
            <MetricTile key={name} label={`Dept: ${name}`} value={count} />
          ))}
        </SummaryCard>

        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter value={periodState} onChange={setPeriodState} />
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !hospitalizations.length ? (
          <p className="text-muted-foreground text-sm">No active inpatients.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
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
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
