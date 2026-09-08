import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// Same palette as FinancePayrollCharts.tsx - grounded in this app's
// own --primary/--accent tokens, not arbitrary colors.
const TEAL_MID = "#3E8793";

const chartConfig = {
  Revenue: { label: "Revenue", color: TEAL_MID },
};

const gridProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
const axisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
};

export default function DailyReportSummaryChart({
  data,
}: {
  data: { name: string; revenue: number }[];
}) {
  const chartData = [...data]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map((d) => ({ name: d.name, Revenue: d.revenue }));

  if (chartData.length === 0) return null;

  return (
    <div className="mb-6 rounded-md border bg-card p-4">
      <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
        Revenue by Service Category
      </h3>
      <ChartContainer config={chartConfig} className="aspect-video">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <Bar dataKey="Revenue" fill={TEAL_MID} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
