import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";

const GROWTH = "#3E8793";
const DECLINE = "#C97064";

const chartConfig = {
  "YoY %": { label: "YoY %", color: GROWTH },
};

const gridProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
const axisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
};

export default function DailyReportYoyChart({
  data,
}: {
  data: { name: string; currentRevenue: number; priorYearRevenue: number }[];
}) {
  const chartData = data
    .filter((d) => d.priorYearRevenue > 0)
    .map((d) => ({
      name: d.name,
      "YoY %": Math.round(((d.currentRevenue - d.priorYearRevenue) / d.priorYearRevenue) * 100),
    }))
    .sort((a, b) => b["YoY %"] - a["YoY %"]);

  if (chartData.length === 0) {
    return (
      <div className="rounded-md border bg-card p-4">
        <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
          Year-over-Year Change
        </h3>
        <p className="text-xs text-muted-foreground">
          No data from the same period last year yet to compare against.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
        Year-over-Year Change
      </h3>
      <ChartContainer config={chartConfig} className="aspect-video">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="YoY %" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={d["YoY %"] >= 0 ? GROWTH : DECLINE} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
