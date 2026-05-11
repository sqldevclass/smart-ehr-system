import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
} from "date-fns";

export type Period = "today" | "week" | "month" | "custom";

export interface PeriodState {
  period: Period;
  customFrom?: string;
  customTo?: string;
}

export function getDateBounds(state: PeriodState): { from: string; to: string } {
  const now = new Date();
  const { period, customFrom, customTo } = state;
  if (period === "week") {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      to: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
    };
  }
  if (period === "month") {
    return {
      from: startOfMonth(now).toISOString(),
      to: endOfMonth(now).toISOString(),
    };
  }
  if (period === "custom" && customFrom && customTo) {
    return {
      from: startOfDay(new Date(customFrom)).toISOString(),
      to: endOfDay(new Date(customTo)).toISOString(),
    };
  }
  return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
}

export function getTodayBounds(): { from: string; to: string } {
  const now = new Date();
  return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
}

interface Props {
  value: PeriodState;
  onChange: (s: PeriodState) => void;
}

export function PeriodFilter({ value, onChange }: Props) {
  const opts: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "This Week" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border bg-background p-0.5">
        {opts.map((o) => (
          <Button
            key={o.key}
            size="sm"
            variant={value.period === o.key ? "default" : "ghost"}
            className="h-8"
            onClick={() => onChange({ ...value, period: o.key })}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {value.period === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-8 w-auto"
            value={value.customFrom || ""}
            onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            className="h-8 w-auto"
            value={value.customTo || ""}
            onChange={(e) => onChange({ ...value, customTo: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

interface MetricTileProps {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export function MetricTile({ label, value, highlight }: MetricTileProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className={`text-2xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function SummaryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}
