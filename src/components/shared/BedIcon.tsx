import { differenceInDays } from "date-fns";
import { BedDouble } from "lucide-react";
import type { BedRow } from "@/hooks/useBedOccupancy";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function BedIcon({ bed, bedNumber, now = new Date() }: { bed?: BedRow; bedNumber?: string | number; now?: Date }) {
  const number = bed?.bed_number ?? bedNumber;
  const assigned = bed?.assigned_at ? new Date(bed.assigned_at) : null;
  const days = assigned && !Number.isNaN(assigned.getTime()) ? Math.max(0, differenceInDays(now, assigned)) : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`Койка ${number}${bed ? ` — ${bed.is_occupied ? "занята" : "свободна"}` : ""}`}
          className={cn("flex w-14 flex-col items-center gap-1 rounded-md p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            bed?.is_occupied ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40 text-muted-foreground",
            bed?.is_occupied && days !== null && days > 7 && "ring-2 ring-primary/30 ring-offset-2 ring-offset-card")}>
          <BedDouble className="h-6 w-6" />
          <span className="text-xs">{number}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {bed?.is_occupied ? (
          <div className="space-y-1">
            <p className="font-medium">{[bed.last_name, bed.first_name].filter(Boolean).join(" ") || "—"}</p>
            <p>ID пациента: {bed.patient_number ?? "—"}</p>
            <p>№ истории: {bed.hospitalization_number ?? "—"}</p>
            <p>Дней пребывания: {days ?? "—"}</p>
          </div>
        ) : `Койка ${number}${bed ? " — свободна" : ""}`}
      </TooltipContent>
    </Tooltip>
  );
}