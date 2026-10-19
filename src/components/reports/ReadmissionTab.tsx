import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const READMISSION_WINDOW_DAYS = 30;
const SAME_DX_WINDOW_DAYS = 28;

interface HospItem {
  id: string;
  patient_id: string;
  admitted_at: string;
  discharged_at: string | null;
  discharge_type: string | null;
  department_id: string | null;
  departments: { name: string } | null;
}

interface MainDxItem {
  hospitalization_id: string;
  icd10_code: string;
}

export default function ReadmissionTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

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

  const { data: mainDiagnoses = [] } = useQuery({
    queryKey: ["readmission-main-diagnoses", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select("hospitalization_id, icd10_code")
        .eq("hospital_id", user.hospitalId)
        .eq("diagnosis_type", "main");
      if (error) throw error;
      return (data || []) as MainDxItem[];
    },
    enabled: !!user,
  });

  const mainDxByHosp = useMemo(() => {
    const map = new Map<string, string>();
    mainDiagnoses.forEach((d) => {
      if (!map.has(d.hospitalization_id)) map.set(d.hospitalization_id, d.icd10_code);
    });
    return map;
  }, [mainDiagnoses]);

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
      if (h.discharge_type === "deceased") return;
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

  const sameDxStats = useMemo(() => {
    const byPatient = new Map<string, HospItem[]>();
    items.forEach((i) => {
      const arr = byPatient.get(i.patient_id) || [];
      arr.push(i);
      byPatient.set(i.patient_id, arr);
    });

    const windowMs = SAME_DX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let eligible = 0;
    let readmittedSameDx = 0;

    items.forEach((h) => {
      if (!h.discharged_at) return;
      if (h.discharge_type === "deceased") return;
      const dischargedAt = new Date(h.discharged_at);
      if (dischargedAt < new Date(from) || dischargedAt > new Date(to)) return;

      const indexDx = mainDxByHosp.get(h.id);
      if (!indexDx) return;
      eligible += 1;

      const siblings = byPatient.get(h.patient_id) || [];
      const matched = siblings.some((other) => {
        if (other.id === h.id) return false;
        const admittedAt = new Date(other.admitted_at);
        const withinWindow = admittedAt > dischargedAt && admittedAt.getTime() - dischargedAt.getTime() <= windowMs;
        if (!withinWindow) return false;
        return mainDxByHosp.get(other.id) === indexDx;
      });
      if (matched) readmittedSameDx += 1;
    });

    return { eligible, readmittedSameDx };
  }, [items, mainDxByHosp, from, to]);

  const totalEligible = rows.reduce((s, r) => s + r.eligible, 0);
  const totalReadmitted = rows.reduce((s, r) => s + r.readmitted, 0);

  return (
    <div className="mt-4 space-y-3">
      <SummaryCard>
        <MetricTile
          label={`Readmission, same Dx, ≤${SAME_DX_WINDOW_DAYS}d`}
          value={
            sameDxStats.eligible > 0
              ? `${sameDxStats.readmittedSameDx} / ${sameDxStats.eligible} (${((sameDxStats.readmittedSameDx / sameDxStats.eligible) * 100).toFixed(1)}%)`
              : "—"
          }
          highlight={sameDxStats.readmittedSameDx > 0}
        />
      </SummaryCard>
      <p className="text-xs text-muted-foreground">
        Readmission (any cause) = same patient admitted again within {READMISSION_WINDOW_DAYS} days of a discharge in this period. Same-diagnosis stat above compares each discharge's main diagnosis to the readmission's main diagnosis within {SAME_DX_WINDOW_DAYS} days; discharges with no main diagnosis recorded are excluded from that denominator. Deceased discharges are excluded from both.
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
