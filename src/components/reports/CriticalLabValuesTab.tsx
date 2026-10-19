import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "critical_lab_values_columns";

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

  const columns: ColumnDef<CriticalLabItem, any>[] = [
    { id: "date", header: "Date", accessorFn: (r) => (r.completed_at ? format(new Date(r.completed_at), "dd.MM.yyyy HH:mm") : "") },
    { id: "patient_number", header: "Patient ID", accessorFn: (r) => r.patients?.patient_number || "" },
    { id: "patient", header: "Patient", accessorFn: (r) => (r.patients ? `${r.patients.last_name} ${r.patients.first_name}` : "") },
    { id: "parameter", header: "Parameter", accessorFn: (r) => r.parameter_name || "" },
    {
      id: "value",
      header: "Value",
      accessorFn: (r) => `${r.value ?? ""} ${r.unit ?? ""}`.trim(),
      meta: { align: "right" },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <span className="inline-flex items-center justify-end gap-1 text-destructive">
            {r.flag === "critical_high" && <ArrowUp className="h-3.5 w-3.5" />}
            {r.flag === "critical_low" && <ArrowDown className="h-3.5 w-3.5" />}
            {r.value} {r.unit || ""}
          </span>
        );
      },
    },
    {
      id: "critical_range",
      header: "Critical Range",
      accessorFn: (r) => `${r.critical_min ?? ""}–${r.critical_max ?? ""} ${r.unit ?? ""}`.trim(),
      meta: { align: "right" },
    },
    {
      id: "flag",
      header: "Flag",
      accessorFn: (r) => FLAG_LABELS[r.flag || ""] || r.flag || "",
      cell: ({ row }) => (
        <span className="text-destructive font-medium">{FLAG_LABELS[row.original.flag || ""] || row.original.flag}</span>
      ),
    },
  ];

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        emptyMessage="No critical lab results in this period."
        viewKey={VIEW_KEY}
        getRowId={(r) => r.id}
      />
    </div>
  );
}
