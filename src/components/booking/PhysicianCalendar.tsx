import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek, endOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { localDayBoundsUTC, toLocal } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { SlotPanel } from "./SlotPanel";
import { QueuePanel } from "./QueuePanel";
import type { PhysicianResult, SlotRow } from "./types";

interface Props {
  physician: PhysicianResult;
  hospitalId: string;
  timezone: string;
  onSlotSelect: (slot: SlotRow) => void;
  onQueueSelect: (date: Date) => void;
  selectedSlotId?: string | null;
  mode: "registrar" | "inpatient";
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PhysicianCalendar({
  physician, hospitalId, timezone, onSlotSelect, onQueueSelect, selectedSlotId,
}: Props) {
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const isQueue = physician.scheduleType === "queue";

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const { start: rangeStart } = localDayBoundsUTC(gridStart, timezone);
  const { end: rangeEnd } = localDayBoundsUTC(gridEnd, timezone);

  const { data: slotSummary = [] } = useQuery({
    queryKey: ["booking-month-slots", physician.id, hospitalId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("slot_datetime, booking_count, is_blocked")
        .eq("physician_id", physician.id)
        .eq("hospital_id", hospitalId)
        .gte("slot_datetime", rangeStart)
        .lte("slot_datetime", rangeEnd);
      if (error) throw error;
      return data || [];
    },
    enabled: !isQueue,
  });

  const dotMap = useMemo(() => {
    const map = new Map<string, "green" | "orange">();
    if (isQueue) return map;
    const counts = new Map<string, { available: number; waitlist: number; total: number }>();
    for (const s of slotSummary as any[]) {
      const key = toLocal(s.slot_datetime, timezone, "yyyy-MM-dd");
      const c = counts.get(key) || { available: 0, waitlist: 0, total: 0 };
      c.total++;
      if (s.is_blocked) { /* ignore */ }
      else if ((s.booking_count ?? 0) === 0) c.available++;
      else if ((s.booking_count ?? 0) === 1) c.waitlist++;
      counts.set(key, c);
    }
    counts.forEach((c, k) => {
      if (c.available > 0) map.set(k, "green");
      else if (c.waitlist > 0) map.set(k, "orange");
    });
    return map;
  }, [slotSummary, timezone, isQueue]);

  const handlePickDay = (d: Date) => {
    setSelectedDate(d);
    if (isQueue) onQueueSelect(d);
  };

  // Ensure queueDate is set as soon as a queue physician is opened
  useEffect(() => {
    if (isQueue) onQueueSelect(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueue]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Calendar */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Button size="icon" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">{format(month, "MMMM yyyy")}</div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => { const t = new Date(); setMonth(startOfMonth(t)); setSelectedDate(t); }}>
              Today
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {DAY_LABELS.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const dot = dotMap.get(key);
            const inMonth = isSameMonth(d, month);
            const isSelected = isSameDay(d, selectedDate);
            return (
              <button
                key={key}
                type="button"
                onClick={() => handlePickDay(d)}
                className={cn(
                  "relative flex h-10 flex-col items-center justify-center rounded text-xs transition",
                  !inMonth && "text-muted-foreground/40",
                  isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <span>{format(d, "d")}</span>
                {dot && (
                  <span
                    className={cn(
                      "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                      dot === "green" ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{physician.fullName}</div>
            <div className="text-xs text-muted-foreground truncate">{physician.specialization || "—"}</div>
          </div>
          <Badge variant={isQueue ? "secondary" : "default"} className="capitalize shrink-0">
            {physician.scheduleType || "—"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">{format(selectedDate, "EEEE, MMM d, yyyy")}</div>
        {isQueue ? (
          <QueuePanel
            physicianId={physician.id}
            hospitalId={hospitalId}
            selectedDate={selectedDate}
            timezone={timezone}
            onQueueSelect={onQueueSelect}
          />
        ) : (
          <SlotPanel
            physicianId={physician.id}
            hospitalId={hospitalId}
            selectedDate={selectedDate}
            onSlotSelect={onSlotSelect}
            selectedSlotId={selectedSlotId}
            timezone={timezone}
          />
        )}
      </div>
    </div>
  );
}
