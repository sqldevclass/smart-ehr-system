import type { ReactNode } from "react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/formatDateTime";
import { painCharacterOptions, painColor } from "@/lib/painScale";
import { cn } from "@/lib/utils";

export interface PainReading {
  id: string;
  score: number;
  recorded_at: string;
  pain_character: string[] | null;
  pain_location: string | null;
  profiles?: { full_name?: string | null } | null;
}

interface Props {
  reading: PainReading;
  /** Extra lines under the reading, e.g. the next-due line on the latest one. */
  children?: ReactNode;
}

/** One pain reading: score, date (author on hover), character tags and location. */
export default function PainReadingCell({ reading, children }: Props) {
  return (
    <div className="shrink-0 text-left">
      <div className={cn("text-sm font-semibold", painColor(reading.score))}>
        {reading.score}
        <span className="text-xs font-normal text-muted-foreground ml-1">/10</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">{formatDateTime(new Date(reading.recorded_at))}</span>
            </TooltipTrigger>
            <TooltipContent>Внесено: {reading.profiles?.full_name ?? "—"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {reading.pain_character?.length > 0 && (
        <div className="text-xs text-muted-foreground mt-0.5">
          {reading.pain_character
            .map((code: string) =>
              painCharacterOptions.find((o) => o.code === code)?.label ?? code
            )
            .join(", ")}
        </div>
      )}
      {reading.pain_location && (
        <div className="text-xs text-muted-foreground">{reading.pain_location}</div>
      )}
      {children}
    </div>
  );
}
