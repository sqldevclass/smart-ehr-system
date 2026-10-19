import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface DiagnosisItem {
  icd10_code: string;
  diagnosis_type: string | null;
  icd10_codes: { name_ru: string } | null;
}

export default function TopDiagnosesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["top-diagnoses", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select("icd10_code, diagnosis_type, icd10_codes(name_ru)")
        .eq("hospital_id", user.hospitalId)
        .gte("recorded_at", from)
        .lte("recorded_at", to);
      if (error) throw error;
      return (data || []) as unknown as DiagnosisItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const byCode = new Map<string, { code: string; name: string; count: number }>();
    items.forEach((d) => {
      const row = byCode.get(d.icd10_code) || { code: d.icd10_code, name: d.icd10_codes?.name_ru || d.icd10_code, count: 0 };
      row.count += 1;
      byCode.set(d.icd10_code, row);
    });
    return Array.from(byCode.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [items]);

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Top 20 diagnoses recorded in this period (all diagnosis types: main, comorbid, complication, competing, background).
      </p>
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No diagnoses recorded in this period.</p>
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
              {rows.map((r) => (
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
  );
}
