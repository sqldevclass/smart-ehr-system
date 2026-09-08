import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// Same teal ramp as FinancePayrollCharts.tsx's physician breakdown chart -
// consistent "parts of one whole" composition treatment across the app.
const TEAL_RAMP = {
  darkest: "#1F4A52",
  dark: "#2E6570",
  mid: "#3E8793",
};

const chartConfig = {
  Outpatient: { label: "Outpatient", color: TEAL_RAMP.darkest },
  Inpatient: { label: "Inpatient", color: TEAL_RAMP.dark },
  "Operating Room": { label: "Operating Room", color: TEAL_RAMP.mid },
};

const gridProps = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };
const axisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
};

export default function DailyReportDepartmentChart({
  data,
}: {
  data: { name: string; outpatient: number; inpatient: number; operatingRoom: number }[];
}) {
  const chartData = data.map((d) => ({
    name: d.name,
    Outpatient: d.outpatient,
    Inpatient: d.inpatient,
    "Operating Room": d.operatingRoom,
  }));

  if (chartData.length === 0) return null;

  return (
    <div className="mb-6 rounded-md border bg-card p-4">
      <h3 className="mb-4 font-heading text-sm font-semibold text-foreground">
        Revenue by Department
      </h3>
      <ChartContainer config={chartConfig} className="aspect-video">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => Number(v).toLocaleString()} />
          <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="Outpatient" stackId="dept" fill={TEAL_RAMP.darkest} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Inpatient" stackId="dept" fill={TEAL_RAMP.dark} radius={[0, 0, 0, 0]} />
          <Bar dataKey="Operating Room" stackId="dept" fill={TEAL_RAMP.mid} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
