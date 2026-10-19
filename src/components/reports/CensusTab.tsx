import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

interface RoomItem {
  id: string;
  department_id: string | null;
  capacity: number | null;
  departments: { name: string } | null;
}

interface AssignmentItem {
  room_id: string;
  assigned_at: string;
  discharged_at: string | null;
}

export default function CensusTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: admissionCount = 0 } = useQuery({
    queryKey: ["census-admissions", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("hospitalizations")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", user.hospitalId)
        .gte("admitted_at", from)
        .lte("admitted_at", to);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const { data: opPatientCount = 0 } = useQuery({
    queryKey: ["census-op-patients", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return 0;
      const { data, error } = await supabase
        .from("visit_services")
        .select("patient_id")
        .eq("hospital_id", user.hospitalId)
        .is("hospitalization_id", null)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return new Set((data || []).map((r) => r.patient_id)).size;
    },
    enabled: !!user,
  });

  const { data: rooms = [] } = useQuery({
    queryKey: ["census-rooms", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, department_id, capacity, departments(name)")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as unknown as RoomItem[];
    },
    enabled: !!user,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["census-room-assignments", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("room_assignments")
        .select("room_id, assigned_at, discharged_at")
        .eq("hospital_id", user.hospitalId)
        .lte("assigned_at", to)
        .or(`discharged_at.is.null,discharged_at.gte.${from}`);
      if (error) throw error;
      return (data || []) as AssignmentItem[];
    },
    enabled: !!user,
  });

  const occupancyRows = useMemo(() => {
    const periodMs = new Date(to).getTime() - new Date(from).getTime();
    const periodDays = Math.max(periodMs / (1000 * 60 * 60 * 24), 1 / 24);

    const bedsByDept = new Map<string, { name: string; beds: number }>();
    const deptByRoom = new Map<string, string>();
    rooms.forEach((r) => {
      const key = r.department_id || "none";
      deptByRoom.set(r.id, key);
      const entry = bedsByDept.get(key) || { name: r.departments?.name || "Unassigned", beds: 0 };
      entry.beds += r.capacity || 0;
      bedsByDept.set(key, entry);
    });

    const occupiedDaysByDept = new Map<string, number>();
    assignments.forEach((a) => {
      const deptKey = deptByRoom.get(a.room_id) || "none";
      const start = Math.max(new Date(a.assigned_at).getTime(), new Date(from).getTime());
      const end = Math.min(a.discharged_at ? new Date(a.discharged_at).getTime() : new Date(to).getTime(), new Date(to).getTime());
      const days = Math.max((end - start) / (1000 * 60 * 60 * 24), 0);
      occupiedDaysByDept.set(deptKey, (occupiedDaysByDept.get(deptKey) || 0) + days);
    });

    return Array.from(bedsByDept.entries())
      .map(([key, dept]) => {
        const occupiedDays = occupiedDaysByDept.get(key) || 0;
        const availableBedDays = dept.beds * periodDays;
        return {
          name: dept.name,
          beds: dept.beds,
          occupancyPct: availableBedDays > 0 ? (occupiedDays / availableBedDays) * 100 : 0,
        };
      })
      .sort((a, b) => b.occupancyPct - a.occupancyPct);
  }, [rooms, assignments, from, to]);

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Admissions" value={admissionCount} />
        <MetricTile label="Outpatient Patients" value={opPatientCount} />
      </SummaryCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Bed Occupancy by Department</h3>
        <div className="rounded-md border bg-card">
          {occupancyRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No active rooms configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Beds</TableHead>
                  <TableHead className="text-right">Occupancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occupancyRows.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.beds}</TableCell>
                    <TableCell className="text-right">{r.occupancyPct.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
