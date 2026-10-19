import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "physician_monthly_columns";

interface ServiceItem {
  rendered_by_name: string | null;
  report_date: string;
  revenue: number;
}

interface Row {
  physician: string;
  month: string;
  count: number;
  revenue: number;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PhysicianMonthlyTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["physician-monthly-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select("rendered_by_name, report_date, revenue")
        .eq("hospital_id", user.hospitalId)
        .gte("report_date", from)
        .lte("report_date", to);
      if (error) throw error;
      return (data || []) as ServiceItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    items.forEach((i) => {
      const physician = i.rendered_by_name || "Unassigned";
      const month = format(new Date(i.report_date), "yyyy-MM");
      const key = `${physician}__${month}`;
      const row = byKey.get(key) || { physician, month, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += Number(i.revenue || 0);
      byKey.set(key, row);
    });
    return Array.from(byKey.values()).sort((a, b) => a.physician.localeCompare(b.physician) || a.month.localeCompare(b.month));
  }, [items]);

  const columns: ColumnDef<Row, any>[] = [
    { id: "physician", header: "Physician", accessorFn: (r) => r.physician },
    { id: "month", header: "Month", accessorFn: (r) => r.month },
    { id: "count", header: "Services", accessorFn: (r) => r.count, meta: { align: "right" } },
    { id: "revenue", header: "Revenue", accessorFn: (r) => fmt(r.revenue), meta: { align: "right" } },
  ];

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No services in this period."
        viewKey={VIEW_KEY}
        getRowId={(r) => `${r.physician}-${r.month}`}
      />
    </div>
  );
}
