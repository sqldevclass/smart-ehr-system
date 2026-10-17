import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ServiceItem {
  service_name: string | null;
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

  const rows = useMemo(() => {
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

  return (
    <div className="mt-4 rounded-md border bg-card">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No completed services in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r.name}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.count}</TableCell>
                <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
