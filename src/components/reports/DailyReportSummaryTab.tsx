import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import DailyReportSummaryChart from "@/components/reports/DailyReportSummaryChart";
import DailyReportBulletChart from "@/components/reports/DailyReportBulletChart";
import DailyReportYoyChart from "@/components/reports/DailyReportYoyChart";
import DailyReportPlanDialog from "@/components/reports/DailyReportPlanDialog";

interface ServiceItem {
  service_type_id: string | null;
  patient_id: string;
  cost_at_time: number;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthsInRange(from: string, to: string) {
  const start = new Date(from);
  const end = new Date(to);
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function shiftYearsISO(iso: string, years: number) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

export default function DailyReportSummaryTab({ from, to }: { from: string; to: string }) {
  const { user, hasAnyRole } = useAuth();
  const queryClient = useQueryClient();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const canManagePlans = hasAnyRole(["admin"]);
  const months = monthsInRange(from, to);
  const primaryMonth = months[0] ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  };

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

  const { data: priorYearItems = [] } = useQuery({
    queryKey: ["daily-report-items-prior-year", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("daily_report_service_items")
        .select("service_type_id, cost_at_time")
        .eq("hospital_id", user.hospitalId)
        .gte("completed_at", shiftYearsISO(from, -1))
        .lte("completed_at", shiftYearsISO(to, -1));
      if (error) throw error;
      return (data || []) as unknown as ServiceItem[];
    },
    enabled: !!user,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["service-type-plans", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user || months.length === 0) return [];
      const orClauses = months
        .map((m) => `and(year.eq.${m.year},month.eq.${m.month})`)
        .join(",");
      const { data, error } = await supabase
        .from("service_type_revenue_plans")
        .select("service_type_id, planned_revenue")
        .eq("hospital_id", user.hospitalId)
        .or(orClauses);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const planByType: Record<string, number> = {};
  (plans as any[]).forEach((p: any) => {
    planByType[p.service_type_id] =
      (planByType[p.service_type_id] || 0) + Number(p.planned_revenue || 0);
  });

  const rows = serviceTypes
    .filter((t: any) => t.code !== "test")
    .map((t: any) => {
      const matching = items.filter((i) => i.service_type_id === t.id);
      const priorMatching = priorYearItems.filter((i) => i.service_type_id === t.id);
      const patients = new Set(matching.map((i) => i.patient_id));
      return {
        id: t.id as string,
        name: t.name_ru as string,
        serviceCount: matching.length,
        visitorCount: patients.size,
        revenue: matching.reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0),
        priorYearRevenue: priorMatching.reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0),
        target: planByType[t.id] || 0,
      };
    })
    .filter((r) => r.serviceCount > 0 || r.target > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const totals = rows.reduce(
    (acc, r) => ({
      serviceCount: acc.serviceCount + r.serviceCount,
      revenue: acc.revenue + r.revenue,
    }),
    { serviceCount: 0, revenue: 0 },
  );

  return (
    <div className="mt-4 space-y-6">
      {canManagePlans && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setPlanDialogOpen(true)}>
            Set Revenue Plan
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <DailyReportSummaryChart
            data={rows.map((r) => ({ name: r.name, revenue: r.revenue }))}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <DailyReportBulletChart
              data={rows.map((r) => ({ name: r.name, revenue: r.revenue, target: r.target }))}
            />
            <DailyReportYoyChart
              data={rows.map((r) => ({
                name: r.name,
                currentRevenue: r.revenue,
                priorYearRevenue: r.priorYearRevenue,
              }))}
            />
          </div>
        </>
      )}

      <div className="rounded-md border bg-card">
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
                <TableRow key={r.id}>
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

      <DailyReportPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        serviceTypes={serviceTypes as any}
        year={primaryMonth.year}
        month={primaryMonth.month}
        existingPlans={planByType}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["service-type-plans"] });
        }}
      />
    </div>
  );
}
