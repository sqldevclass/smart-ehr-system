import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface RiskItem {
  scale_id: string;
  risk_level: string | null;
  clinical_scales: { code: string; name_ru: string } | null;
}

interface DiagnosisItem {
  icd10_code: string;
  icd10_codes: { name_ru: string } | null;
}

export default function VteTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: riskItems = [], isLoading: loadingRisk } = useQuery({
    queryKey: ["vte-risk-assessments", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_scale_assessments")
        .select("scale_id, risk_level, clinical_scales!inner(code, name_ru)")
        .eq("hospital_id", user.hospitalId)
        .in("clinical_scales.code", ["wells_dvt", "wells_pe"])
        .gte("assessed_at", from)
        .lte("assessed_at", to);
      if (error) throw error;
      return (data || []).filter((r: any) => r.clinical_scales) as unknown as RiskItem[];
    },
    enabled: !!user,
  });

  const { data: diagnosisItems = [], isLoading: loadingDx } = useQuery({
    queryKey: ["vte-confirmed-diagnoses", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select("icd10_code, icd10_codes(name_ru)")
        .eq("hospital_id", user.hospitalId)
        .or("icd10_code.ilike.I26%,icd10_code.ilike.I80%,icd10_code.ilike.I81%,icd10_code.ilike.I82%")
        .gte("recorded_at", from)
        .lte("recorded_at", to);
      if (error) throw error;
      return (data || []) as unknown as DiagnosisItem[];
    },
    enabled: !!user,
  });

  const riskRows = useMemo(() => {
    const byKey = new Map<string, { scale: string; level: string; count: number }>();
    riskItems.forEach((r) => {
      const scale = r.clinical_scales?.name_ru || "—";
      const level = r.risk_level || "Not scored";
      const key = `${scale}__${level}`;
      const row = byKey.get(key) || { scale, level, count: 0 };
      row.count += 1;
      byKey.set(key, row);
    });
    return Array.from(byKey.values()).sort((a, b) => a.scale.localeCompare(b.scale) || b.count - a.count);
  }, [riskItems]);

  const diagnosisRows = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; count: number }>();
    diagnosisItems.forEach((d) => {
      const row = byCode.get(d.icd10_code) || { code: d.icd10_code, name: d.icd10_codes?.name_ru || "—", count: 0 };
      row.count += 1;
      byCode.set(d.icd10_code, row);
    });
    return Array.from(byCode.values()).sort((a, b) => b.count - a.count);
  }, [diagnosisItems]);

  return (
    <div className="mt-4 space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">VTE Risk Assessments (Wells DVT / Wells PE)</h3>
        <div className="rounded-md border bg-card">
          {loadingRisk ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : riskRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No Wells scale assessments in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scale</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskRows.map((r) => (
                  <TableRow key={`${r.scale}-${r.level}`}>
                    <TableCell>{r.scale}</TableCell>
                    <TableCell>{r.level}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Confirmed VTE Diagnoses (ICD-10 I26, I80–I82)</h3>
        <div className="rounded-md border bg-card">
          {loadingDx ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : diagnosisRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No VTE diagnoses recorded in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ICD-10</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnosisRows.map((r) => (
                  <TableRow key={r.code}>
                    <TableCell>{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
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
