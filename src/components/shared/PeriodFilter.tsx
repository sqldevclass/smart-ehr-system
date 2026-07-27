import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

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
  const [open, setOpen] = useState(false);

  const selectedRange = {
    from: value.customFrom ? new Date(value.customFrom) : new Date(),
    to: value.customTo ? new Date(value.customTo) : new Date(),
  };

  const label = value.customFrom && value.customTo
    ? value.customFrom === value.customTo
      ? format(selectedRange.from, "dd.MM.yyyy")
      : `${format(selectedRange.from, "dd.MM.yyyy")} – ${format(selectedRange.to, "dd.MM.yyyy")}`
    : "Сегодня";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <CalendarIcon className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={
            value.customFrom
              ? { from: new Date(value.customFrom), to: value.customTo ? new Date(value.customTo) : undefined }
              : { from: new Date(), to: new Date() }
          }
          onSelect={(range: any) => {
            if (!range?.from) return;
            const from = format(range.from, "yyyy-MM-dd");
            const to = format(range.to || range.from, "yyyy-MM-dd");
            onChange({ period: "custom", customFrom: from, customTo: to });
            if (range.to) setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
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
