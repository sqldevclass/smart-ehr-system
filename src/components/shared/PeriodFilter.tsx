import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
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

export function matchesRange(iso: string | null | undefined, state: PeriodState): boolean {
  if (state.period !== "custom" || (!state.customFrom && !state.customTo)) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (state.customFrom && t < startOfDay(new Date(state.customFrom)).getTime()) return false;
  if (state.customTo && t > endOfDay(new Date(state.customTo)).getTime()) return false;
  return true;
}

export function rangeBounds(state: PeriodState): { from?: string; to?: string } {
  if (state.period !== "custom") return {};
  return {
    from: state.customFrom ? startOfDay(new Date(state.customFrom)).toISOString() : undefined,
    to: state.customTo ? endOfDay(new Date(state.customTo)).toISOString() : undefined,
  };
}

interface Props {
  value: PeriodState;
  onChange: (s: PeriodState) => void;
  clearable?: boolean;
}

export function PeriodFilter({ value, onChange, clearable }: Props) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  const fromDate = value.customFrom ? new Date(value.customFrom) : undefined;
  const toDate = value.customTo ? new Date(value.customTo) : undefined;

  const handleFromSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange({ period: "custom", customFrom: format(date, "yyyy-MM-dd"), customTo: value.customTo });
    setOpenFrom(false);
  };

  const handleToSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange({ period: "custom", customFrom: value.customFrom, customTo: format(date, "yyyy-MM-dd") });
    setOpenTo(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={openFrom} onOpenChange={setOpenFrom}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2">
            <CalendarIcon className="h-4 w-4" />
            {fromDate ? format(fromDate, "dd.MM.yyyy") : "От"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={fromDate} onSelect={handleFromSelect} initialFocus />
        </PopoverContent>
      </Popover>
      <span className="text-xs text-muted-foreground">—</span>
      <Popover open={openTo} onOpenChange={setOpenTo}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2">
            <CalendarIcon className="h-4 w-4" />
            {toDate ? format(toDate, "dd.MM.yyyy") : "До"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={toDate} onSelect={handleToSelect} initialFocus />
        </PopoverContent>
      </Popover>
      {clearable && (value.customFrom || value.customTo) && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Сбросить даты"
          onClick={() => onChange({ period: "custom" })}
        >
          <X className="h-4 w-4" />
        </Button>
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
