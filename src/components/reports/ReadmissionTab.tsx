import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const READMISSION_WINDOW_DAYS = 30;

interface HospItem {
  id: string;
  patient_id: string;
  admitted_at: string;
  discharged_at: string | null;
  discharge_type: string | null;
  department_id: string | null;
  departments: { name: string } | null;
}

export default function ReadmissionTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  // Need full admission history (not just the period) to tell whether a
  // discharge in-period was followed by a readmission, which may land
  // after `to`.
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["readmission-all-hospitalizations", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, patient_id, admitted_at, discharged_at, discharge_type, department_id, departments(name)")
        .eq("hospital_id", user.hospitalId)
        .order("admitted_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as HospItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const byPatient = new Map<string, HospItem[]>();
    items.forEach((i) => {
      const arr = byPatient.get(i.patient_id) || [];
      arr.push(i);
      byPatient.set(i.patient_id, arr);
    });

    const byDept = new Map<string, { name: string; eligible: number; readmitted: number }>();
    const windowMs = READMISSION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    items.forEach((h) => {
      if (!h.discharged_at) return;
      if (h.discharge_type === "deceased") return; // can't be readmitted
      const dischargedAt = new Date(h.discharged_at);
      if (dischargedAt < new Date(from) || dischargedAt > new Date(to)) return;

      const siblings = byPatient.get(h.patient_id) || [];
      const wasReadmitted = siblings.some((other) => {
        if (other.id === h.id) return false;
        const admittedAt = new Date(other.admitted_at);
        return admittedAt > dischargedAt && admittedAt.getTime() - dischargedAt.getTime() <= windowMs;
      });

      const key = h.department_id || "none";
      const row = byDept.get(key) || { name: h.departments?.name || "Unassigned", eligible: 0, readmitted: 0 };
      row.eligible += 1;
      if (wasReadmitted) row.readmitted += 1;
      byDept.set(key, row);
    });

    return Array.from(byDept.values()).sort((a, b) => b.eligible - a.eligible);
  }, [items, from, to]);

  const totalEligible = rows.reduce((s, r) => s + r.eligible, 0);
  const totalReadmitted = rows.reduce((s, r) => s + r.readmitted, 0);

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Readmission = same patient admitted again within {READMISSION_WINDOW_DAYS} days of a discharge in this period. Deceased discharges are excluded.
      </p>
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No eligible discharges in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Discharges</TableHead>
                <TableHead className="text-right">Readmitted (≤{READMISSION_WINDOW_DAYS}d)</TableHead>
                <TableHead className="text-right">Readmission Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.eligible}</TableCell>
                  <TableCell className="text-right">{r.readmitted}</TableCell>
                  <TableCell className="text-right">
                    {((r.readmitted / r.eligible) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">{totalEligible}</TableCell>
                <TableCell className="text-right font-semibold">{totalReadmitted}</TableCell>
                <TableCell className="text-right font-semibold">
                  {totalEligible > 0 ? ((totalReadmitted / totalEligible) * 100).toFixed(1) : "0.0"}%
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
