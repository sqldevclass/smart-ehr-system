import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { localDayBoundsUTC, toLocal } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SlotRow } from "./types";

interface Props {
  physicianId: string;
  hospitalId: string;
  selectedDate: Date;
  onSlotSelect: (slot: SlotRow) => void;
  selectedSlotId?: string | null;
  timezone: string;
}

export function SlotPanel({ physicianId, hospitalId, selectedDate, onSlotSelect, selectedSlotId, timezone }: Props) {
  const { start, end } = localDayBoundsUTC(selectedDate, timezone);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["booking-slots", physicianId, hospitalId, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, is_blocked, block_reason")
        .eq("physician_id", physicianId)
        .eq("hospital_id", hospitalId)
        .gte("slot_datetime", start)
        .lte("slot_datetime", end)
        .order("slot_datetime");
      if (error) throw error;
      return (data || []) as SlotRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading slots…</p>;
  if (slots.length === 0) return <p className="text-sm text-muted-foreground">No slots available for this day</p>;

  return (
    <TooltipProvider>
      <div className="grid max-h-[400px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {slots.map((slot) => {
          const time = toLocal(slot.slot_datetime, timezone, "HH:mm");
          const isSelected = slot.id === selectedSlotId;
          if (slot.is_blocked) {
            return (
              <Tooltip key={slot.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="inline-flex cursor-not-allowed items-center justify-center gap-1 rounded-md border bg-muted px-2 py-2 text-xs text-muted-foreground"
                  >
                    <Lock className="h-3 w-3" />
                    {time}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{slot.block_reason || "Blocked"}</TooltipContent>
              </Tooltip>
            );
          }
          if (slot.booking_count >= 2) {
            return (
              <button
                key={slot.id}
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border bg-muted px-2 py-2 text-xs text-muted-foreground"
              >
                {time} — Full
              </button>
            );
          }
          if (slot.booking_count === 1) {
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onSlotSelect(slot)}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-medium transition",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
                )}
              >
                {time} — 1 booked • +Waitlist
              </button>
            );
          }
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSlotSelect(slot)}
              className={cn(
                "rounded-md border px-2 py-2 text-xs font-medium transition",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
            >
              {time} — Available
            </button>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
