import type { ReactNode } from "react";
import { AlertTriangle, Activity, Brain, Frown } from "lucide-react";
import AssessmentIndicator from "@/components/assessments/AssessmentIndicator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { buildAssessmentCell, type AssessmentSummary, type BadgeTone } from "@/lib/assessmentCell";
import { cn } from "@/lib/utils";

const TONES: Record<BadgeTone, { bg: string; border: string; icon: string }> = {
  red: { bg: "#FEE2E2", border: "#FCA5A5", icon: "#B91C1C" },
  orange: { bg: "#FFEDD5", border: "#FDBA74", icon: "#C2410C" },
  yellow: { bg: "#FEF9C3", border: "#FDE047", icon: "#A16207" },
};

const SEVERITY_RU: Record<string, string> = {
  mild: "лёгкая",
  moderate: "умеренная",
  severe: "тяжёлая",
  life_threatening: "угроза жизни",
};

const EXTRA_ICONS = { gcs: Brain, cpot: Activity, pain: Frown } as const;

function SquareBadge({ tone, tooltip, children }: { tone: BadgeTone; tooltip: string; children: ReactNode }) {
  const c = TONES[tone];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 5,
              background: c.bg,
              border: `1px solid ${c.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface Props {
  summary: AssessmentSummary | undefined;
  dob?: string | null;
  now: Date;
  tz: string;
  compact?: boolean;
}

export default function AssessmentsCell({ summary, dob, now, tz, compact = false }: Props) {
  if (!summary) return null;
  const m = buildAssessmentCell(summary, dob, now, tz);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {m.pending.length > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="relative inline-flex shrink-0 cursor-default">
                <span
                  className={cn(
                    "absolute inset-0 rounded-full animate-ping opacity-60",
                    compact ? "bg-amber-400" : "bg-orange-400",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex items-center justify-center rounded-full text-white",
                    compact
                      ? "min-w-[18px] h-[18px] px-1 bg-amber-500 text-[10px] font-semibold"
                      : "w-5 h-5 bg-orange-500 text-xs font-bold",
                  )}
                >
                  {m.pending.length}
                </span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Необходимо заполнить: {m.pending.join(", ")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {m.allergies.length > 0 && (
        <SquareBadge
          tone="red"
          tooltip={`Аллергия: ${m.allergies
            .map((a) => `${a.description}${a.severity ? ` (${SEVERITY_RU[a.severity] ?? a.severity})` : ""}`)
            .join(", ")}`}
        >
          <AlertTriangle size={13} color={TONES.red.icon} />
        </SquareBadge>
      )}
      <AssessmentIndicator
        bradenScore={m.bradenScore}
        fallRiskScore={m.fallRiskScore}
        fallRiskScale={m.fallRiskScale}
      />
      {m.extraBadges.map((b) => {
        const Icon = EXTRA_ICONS[b.key];
        return (
          <SquareBadge key={b.key} tone={b.tone} tooltip={b.tooltip}>
            <Icon size={13} color={TONES[b.tone].icon} />
          </SquareBadge>
        );
      })}
    </div>
  );
}
