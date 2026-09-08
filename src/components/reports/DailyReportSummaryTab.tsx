import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ServiceItem {
  service_type_id: string | null;
  patient_id: string;
  cost_at_time: number;
}

const fmt = (n: number) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DailyReportSummaryTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types-lookup", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_types")
        .select("id, code, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user.hospitalId}`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["daily-report-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("daily_report_service_items")
        .select("service_type_id, patient_id, cost_at_time")
        .eq("hospital_id", user.hospitalId)
        .gte("completed_at", from)
        .lte("completed_at", to);
      if (error) throw error;
      return (data || []) as unknown as ServiceItem[];
    },
    enabled: !!user,
  });

  const rows = serviceTypes
    .filter((t: any) => t.code !== "test")
    .map((t: any) => {
      const matching = items.filter((i) => i.service_type_id === t.id);
      const patients = new Set(matching.map((i) => i.patient_id));
      return {
        name: t.name_ru,
        serviceCount: matching.length,
        visitorCount: patients.size,
        revenue: matching.reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0),
      };
    })
    .filter((r) => r.serviceCount > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const totals = rows.reduce(
    (acc, r) => ({
      serviceCount: acc.serviceCount + r.serviceCount,
      revenue: acc.revenue + r.revenue,
    }),
    { serviceCount: 0, revenue: 0 },
  );

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
              <TableHead>Service Category</TableHead>
              <TableHead className="text-right">Services</TableHead>
              <TableHead className="text-right">Visitors</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.serviceCount}</TableCell>
                <TableCell className="text-right">{r.visitorCount}</TableCell>
                <TableCell className="text-right">{fmt(r.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">{totals.serviceCount}</TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold">{fmt(totals.revenue)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
