import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { ComposedChart, Bar, Scatter, XAxis, YAxis, CartesianGrid } from "recharts";

const TEAL_MID = "#3E8793";
const TARGET_MARK = "#1F2937";

const chartConfig = {
  Revenue: { label: "Revenue", color: TEAL_MID },
  Plan: { label: "Plan", color: TARGET_MARK },
};

const gridProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
const axisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
};

// Custom tick mark for the target value -- a short vertical bar
// crossing the revenue bar at the target's x-position, the standard
// "bullet chart" convention (thick bar = actual, tick = target).
function TargetTick(props: any) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <line
      x1={cx - 14}
      x2={cx + 14}
      y1={cy}
      y2={cy}
      stroke={TARGET_MARK}
      strokeWidth={3}
    />
  );
}

export default function DailyReportBulletChart({
  data,
}: {
  data: { name: string; revenue: number; target: number }[];
}) {
  const chartData = [...data]
    .filter((d) => d.revenue > 0 || d.target > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12)
    .map((d) => ({ name: d.name, Revenue: d.revenue, Plan: d.target || null }));

  if (chartData.length === 0) return null;

  const hasAnyTarget = chartData.some((d) => (d.Plan ?? 0) > 0);

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          Revenue vs. Plan
        </h3>
        {hasAnyTarget && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TEAL_MID }} />
              Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: TARGET_MARK }} />
              Plan
            </span>
          </div>
        )}
      </div>
      {!hasAnyTarget && (
        <p className="mb-3 text-xs text-muted-foreground">No plan set for this period yet.</p>
      )}
      <ChartContainer config={chartConfig} className="aspect-video">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="Revenue" fill={TEAL_MID} radius={[4, 4, 0, 0]} />
          <Scatter dataKey="Plan" shape={<TargetTick />} legendType="none" />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
