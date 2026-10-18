import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface CriticalLabItem {
  id: string;
  parameter_name: string | null;
  value: string | null;
  unit: string | null;
  critical_min: number | null;
  critical_max: number | null;
  flag: string | null;
  completed_at: string | null;
  patients: { first_name: string; last_name: string; patient_number: string } | null;
}

const FLAG_LABELS: Record<string, string> = {
  critical_high: "Critical High",
  critical_low: "Critical Low",
};

export default function CriticalLabValuesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["critical-lab-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("lab_results")
        .select(`
          id, parameter_name, value, unit, critical_min, critical_max, flag,
          lab_samples!inner(completed_at, patients(first_name, last_name, patient_number))
        `)
        .eq("hospital_id", user.hospitalId)
        .ilike("flag", "critical%")
        .gte("lab_samples.completed_at", from)
        .lte("lab_samples.completed_at", to);
      if (error) throw error;
      return (data || [])
        .map((r: any) => ({
          ...r,
          completed_at: r.lab_samples?.completed_at ?? null,
          patients: r.lab_samples?.patients ?? null,
        }))
        .sort((a: any, b: any) => (b.completed_at || "").localeCompare(a.completed_at || "")) as unknown as CriticalLabItem[];
    },
    enabled: !!user,
  });

  return (
    <div className="mt-4 rounded-md border bg-card">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No critical lab results in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Patient ID</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Parameter</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Critical Range</TableHead>
              <TableHead>Flag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.completed_at ? format(new Date(r.completed_at), "dd.MM.yyyy HH:mm") : ""}</TableCell>
                <TableCell>{r.patients?.patient_number || ""}</TableCell>
                <TableCell>{r.patients ? `${r.patients.last_name} ${r.patients.first_name}` : ""}</TableCell>
                <TableCell>{r.parameter_name}</TableCell>
                <TableCell className="text-right">{r.value} {r.unit || ""}</TableCell>
                <TableCell className="text-right">{r.critical_min}–{r.critical_max} {r.unit || ""}</TableCell>
                <TableCell>{FLAG_LABELS[r.flag || ""] || r.flag}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
