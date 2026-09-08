import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface PayrollRow {
  staff_role_id: string;
  full_name: string;
  base_pay_amount: number;
  own_service_amount: number;
  referral_amount: number;
  department_bucket_amount: number;
  total_amount: number;
  is_confirmed: boolean;
}

interface PayItemRow {
  cost_at_time: number;
  department_id: string | null;
  service_type_id: string | null;
}

interface DeptInfo {
  id: string | null;
  name: string;
}

// Grounded in this app's own tokens: --primary (218 17% 18%, graphite)
// and --accent (189 41% 41%, teal). The composition ramp is four steps
// of the same teal family rather than four unrelated hues, so the
// stacked bar reads as "parts of one whole" instead of a rainbow.
const GRAPHITE = "#262c36";
const TEAL_RAMP = {
  darkest: "#1F4A52",
  dark: "#2E6570",
  mid: "#3E8793",
  light: "#8FC3CB",
};

function monthRange(year: number, month: number) {
  const start = new Date(year, (month || 1) - 1, 1);
  const end = new Date(year, month || 1, 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export default function FinancePayrollCharts({
  rows,
  year,
  month,
}: {
  rows: PayrollRow[];
  year: number;
  month: number;
}) {
  const { user } = useAuth();
  const { startISO, endISO } = monthRange(year, month);

  const { data: deptByStaffRole = {} } = useQuery({
    queryKey: ["staff-departments", user?.hospitalId],
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, department_id, departments!department_id(name)")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician");
      if (error) throw error;
      const map: Record<string, DeptInfo> = {};
      (data || []).forEach((r: any) => {
        map[r.id] = { id: r.department_id, name: r.departments?.name ?? "No Department" };
      });
      return map;
    },
    enabled: !!user,
  });

  const { data: serviceTypeNames = {} } = useQuery({
    queryKey: ["service-types-lookup", user?.hospitalId],
    queryFn: async () => {
      if (!user) return {};
      const { data, error } = await supabase
        .from("service_types")
        .select("id, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user.hospitalId}`);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        map[s.id] = s.name_ru;
      });
      return map;
    },
    enabled: !!user,
  });

  const { data: ownServiceItems = [] } = useQuery({
    queryKey: ["own-service-items-all", user?.hospitalId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_service_pay_items")
        .select("cost_at_time, department_id, service_type_id")
        .eq("category", "own_service")
        .gte("completed_at", startISO)
        .lt("completed_at", endISO);
      if (error) throw error;
      return (data || []) as PayItemRow[];
    },
    enabled: !!user,
  });

  const { data: trend = [] } = useQuery({
    queryKey: ["payroll-trend", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const points: { label: string; total: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(year, (month || 1) - 1 - i, 1);
        const py = d.getFullYear();
        const pm = d.getMonth() + 1;
        const { data, error } = await supabase.rpc("get_physician_payroll", {
          p_hospital_id: user.hospitalId,
          p_year: py,
          p_month: pm,
        });
        if (error) throw error;
        const total = (data || []).reduce(
          (sum: number, r: any) => sum + Number(r.total_amount || 0),
          0
        );
        points.push({
          label: d.toLocaleString(undefined, { month: "short", year: "2-digit" }),
          total,
        });
      }
      return points;
    },
    enabled: !!user,
  });

  const breakdownData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.full_name.split(" ")[0],
        Base: r.base_pay_amount,
        Own: r.own_service_amount,
        Referral: r.referral_amount,
        Bucket: r.department_bucket_amount,
      })),
    [rows]
  );

  const deptData = useMemo(() => {
    const revenueByDept: Record<string, number> = {};
    ownServiceItems.forEach((item) => {
      const key = item.department_id ?? "none";
      revenueByDept[key] = (revenueByDept[key] || 0) + Number(item.cost_at_time || 0);
    });

    const payoutByDept: Record<string, number> = {};
    rows.forEach((r) => {
      const dept = deptByStaffRole[r.staff_role_id];
      const key = dept?.id ?? "none";
      payoutByDept[key] = (payoutByDept[key] || 0) + Number(r.department_bucket_amount || 0);
    });

    const allKeys = new Set([...Object.keys(revenueByDept), ...Object.keys(payoutByDept)]);
    const nameFor = (key: string) => {
      const found = Object.values(deptByStaffRole).find((d) => (d.id ?? "none") === key);
      return found?.name ?? "No Department";
    };

    return Array.from(allKeys).map((key) => ({
      name: nameFor(key),
      Revenue: revenueByDept[key] || 0,
      Payout: payoutByDept[key] || 0,
    }));
  }, [ownServiceItems, rows, deptByStaffRole]);

  const serviceTypeData = useMemo(() => {
    const byType: Record<string, number> = {};
    ownServiceItems.forEach((item) => {
      const key = item.service_type_id ?? "none";
      byType[key] = (byType[key] || 0) + Number(item.cost_at_time || 0);
    });
    return Object.entries(byType)
      .map(([id, total]) => ({ name: serviceTypeNames[id] ?? "Unknown", Revenue: total }))
      .sort((a, b) => b.Revenue - a.Revenue)
      .slice(0, 8);
  }, [ownServiceItems, serviceTypeNames]);

  const breakdownConfig = {
    Base: { label: "Base Pay", color: TEAL_RAMP.darkest },
    Own: { label: "Own-Service", color: TEAL_RAMP.dark },
    Referral: { label: "Referral", color: TEAL_RAMP.mid },
    Bucket: { label: "Dept. Bucket", color: TEAL_RAMP.light },
  };

  const deptConfig = {
    Revenue: { label: "Department Revenue", color: GRAPHITE },
    Payout: { label: "Bucket Payout", color: TEAL_RAMP.mid },
  };

  const serviceTypeConfig = {
    Revenue: { label: "Revenue", color: TEAL_RAMP.mid },
  };

  const trendConfig = {
    total: { label: "Total Payroll", color: TEAL_RAMP.mid },
  };

  const gridProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
  const axisProps = {
    tickLine: false,
    axisLine: false,
    fontSize: 11,
    stroke: "hsl(var(--muted-foreground))",
  };

  const emptyState = (
    <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">
      No data for this period
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
          Pay Breakdown by Physician
        </h3>
        {breakdownData.length === 0 ? (
          emptyState
        ) : (
          <ChartContainer config={breakdownConfig} className="aspect-video">
            <BarChart data={breakdownData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="Base" stackId="pay" fill={TEAL_RAMP.darkest} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Own" stackId="pay" fill={TEAL_RAMP.dark} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Referral" stackId="pay" fill={TEAL_RAMP.mid} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Bucket" stackId="pay" fill={TEAL_RAMP.light} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
          Department Revenue vs. Bucket Payout
        </h3>
        {deptData.length === 0 ? (
          emptyState
        ) : (
          <ChartContainer config={deptConfig} className="aspect-video">
            <BarChart data={deptData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="Revenue" fill={GRAPHITE} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Payout" fill={TEAL_RAMP.mid} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
          Own-Service Revenue by Service Type
        </h3>
        {serviceTypeData.length === 0 ? (
          emptyState
        ) : (
          <ChartContainer config={serviceTypeConfig} className="aspect-video">
            <BarChart
              data={serviceTypeData}
              layout="vertical"
              margin={{ top: 8, right: 16, bottom: 8, left: 24 }}
            >
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
              <YAxis type="category" dataKey="name" {...axisProps} width={120} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <Bar dataKey="Revenue" fill={TEAL_RAMP.mid} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </div>

      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
          Payroll Cost Trend (6 Months)
        </h3>
        {trend.length === 0 ? (
          emptyState
        ) : (
          <ChartContainer config={trendConfig} className="aspect-video">
            <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TEAL_RAMP.mid} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={TEAL_RAMP.mid} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke={TEAL_RAMP.mid}
                fill="url(#trendFill)"
                strokeWidth={2}
                dot={{ r: 3, fill: TEAL_RAMP.mid, strokeWidth: 0 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
