import { format } from "date-fns";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRiskLevel } from "@/lib/assessmentRisk";
import { cn } from "@/lib/utils";

interface Props {
  assessment: {
    total_score: number;
    assessed_at: string;
    profiles?: { full_name?: string | null } | null;
  };
  scaleCode: string;
}

/** One past assessment: "score — risk label" on a risk-colored chip, with the date (author on hover). */
export default function AssessmentHistoryRow({ assessment, scaleCode }: Props) {
  const risk = getRiskLevel(assessment.total_score, scaleCode);
  return (
    <div className={cn("flex items-center justify-between px-3 py-1.5 rounded border text-xs", risk.color)}>
      <span className="font-medium">
        {assessment.total_score} — {risk.label}
      </span>
      <span className="opacity-75">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{format(new Date(assessment.assessed_at), "dd.MM.yyyy HH:mm")}</span>
            </TooltipTrigger>
            <TooltipContent>Внесено: {assessment.profiles?.full_name ?? "—"}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </span>
    </div>
  );
}
