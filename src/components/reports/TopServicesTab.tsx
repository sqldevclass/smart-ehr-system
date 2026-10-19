import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "top_services_columns";

interface ServiceItem {
  service_name: string | null;
  revenue: number;
}

interface Row {
  name: string;
  count: number;
  revenue: number;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TopServicesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["top-services-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select("service_name, revenue")
        .eq("hospital_id", user.hospitalId)
        .gte("report_date", from)
        .lte("report_date", to)
        .eq("service_status_code", "completed");
      if (error) throw error;
      return (data || []) as unknown as ServiceItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo<Row[]>(() => {
    const byName = new Map<string, { count: number; revenue: number }>();
    items.forEach((i) => {
      const name = i.service_name || "—";
      const row = byName.get(name) || { count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += Number(i.revenue || 0);
      byName.set(name, row);
    });
    return Array.from(byName.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100);
  }, [items]);

  const columns: ColumnDef<Row, any>[] = [
    { id: "name", header: "Услуга", accessorFn: (r) => r.name },
    { id: "count", header: "Количество", accessorFn: (r) => r.count, meta: { align: "right" } },
    { id: "revenue", header: "Доход", accessorFn: (r) => fmt(r.revenue), meta: { align: "right" } },
  ];

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="За этот период завершённых услуг нет."
        viewKey={VIEW_KEY}
        getRowId={(r) => r.name}
      />
    </div>
  );
}
