import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface HospItem {
  id: string;
  admitted_at: string;
  discharged_at: string;
  department_id: string | null;
  departments: { name: string } | null;
}

interface DiagnosisItem {
  hospitalization_id: string;
  icd10_code: string;
  icd10_codes: { name_ru: string } | null;
}

const fmtDays = (n: number) => n.toFixed(1);

export default function AlosTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["alos-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, admitted_at, discharged_at, department_id, departments(name)")
        .eq("hospital_id", user.hospitalId)
        .not("discharged_at", "is", null)
        .gte("discharged_at", from)
        .lte("discharged_at", to);
      if (error) throw error;
      return (data || []) as unknown as HospItem[];
    },
    enabled: !!user,
  });

  const hospIds = useMemo(() => items.map((i) => i.id), [items]);

  const { data: diagnoses = [] } = useQuery({
    queryKey: ["alos-main-diagnoses", user?.hospitalId, hospIds.join(",")],
    queryFn: async () => {
      if (!user || hospIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select("hospitalization_id, icd10_code, icd10_codes(name_ru)")
        .eq("hospital_id", user.hospitalId)
        .eq("diagnosis_type", "main")
        .in("hospitalization_id", hospIds);
      if (error) throw error;
      return (data || []) as unknown as DiagnosisItem[];
    },
    enabled: !!user && hospIds.length > 0,
  });

  const losDaysById = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      const days = (new Date(i.discharged_at).getTime() - new Date(i.admitted_at).getTime()) / (1000 * 60 * 60 * 24);
      map.set(i.id, Math.max(days, 0));
    });
    return map;
  }, [items]);

  const byDepartment = useMemo(() => {
    const byDept = new Map<string, { name: string; count: number; totalDays: number }>();
    items.forEach((i) => {
      const key = i.department_id || "none";
      const row = byDept.get(key) || { name: i.departments?.name || "Unassigned", count: 0, totalDays: 0 };
      row.count += 1;
      row.totalDays += losDaysById.get(i.id) || 0;
      byDept.set(key, row);
    });
    return Array.from(byDept.values())
      .map((r) => ({ ...r, avgDays: r.totalDays / r.count }))
      .sort((a, b) => b.count - a.count);
  }, [items, losDaysById]);

  const byDiagnosis = useMemo(() => {
    const diagnosisByHospId = new Map<string, { code: string; name: string }>();
    diagnoses.forEach((d) => {
      if (!diagnosisByHospId.has(d.hospitalization_id)) {
        diagnosisByHospId.set(d.hospitalization_id, { code: d.icd10_code, name: d.icd10_codes?.name_ru || d.icd10_code });
      }
    });
    const byDx = new Map<string, { code: string; name: string; count: number; totalDays: number }>();
    items.forEach((i) => {
      const dx = diagnosisByHospId.get(i.id);
      const key = dx ? dx.code : "none";
      const row = byDx.get(key) || { code: key, name: dx?.name || "No main diagnosis recorded", count: 0, totalDays: 0 };
      row.count += 1;
      row.totalDays += losDaysById.get(i.id) || 0;
      byDx.set(key, row);
    });
    return Array.from(byDx.values())
      .map((r) => ({ ...r, avgDays: r.totalDays / r.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [items, diagnoses, losDaysById]);

  const overallAvg = items.length > 0
    ? Array.from(losDaysById.values()).reduce((s, d) => s + d, 0) / items.length
    : 0;

  return (
    <div className="mt-4 space-y-6">
      <div className="text-sm text-muted-foreground">
        Overall average length of stay: <span className="font-semibold text-foreground">{fmtDays(overallAvg)} days</span>
        {" "}({items.length} discharges)
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">By Department</h3>
        <div className="rounded-md border bg-card">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : byDepartment.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No discharges in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-right">Discharges</TableHead>
                  <TableHead className="text-right">Avg. LOS (days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDepartment.map((r) => (
                  <TableRow key={r.name}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{fmtDays(r.avgDays)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">By Main Diagnosis (Top 20)</h3>
        <div className="rounded-md border bg-card">
          {byDiagnosis.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No discharges in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ICD-10</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead className="text-right">Discharges</TableHead>
                  <TableHead className="text-right">Avg. LOS (days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDiagnosis.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell>{r.code === "none" ? "—" : r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right">{fmtDays(r.avgDays)}</TableCell>
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
