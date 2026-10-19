import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ServiceItem {
  rendered_by_name: string | null;
  report_date: string;
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

  const rows = useMemo(() => {
    const byKey = new Map<string, { physician: string; month: string; count: number; revenue: number }>();
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

  return (
    <div className="mt-4 rounded-md border bg-card">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No services in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Physician</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Services</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.physician}-${r.month}`}>
                <TableCell>{r.physician}</TableCell>
                <TableCell>{r.month}</TableCell>
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
