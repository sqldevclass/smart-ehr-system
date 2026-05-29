import { BedDouble } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import FallingPersonIcon from "./FallingPersonIcon";

type BadgeColors = {
  bg: string;
  border: string;
  iconColor: string;
  label: string;
} | null;

function bradenColors(score: number | null): BadgeColors {
  if (score === null) return null;
  if (score <= 9) return { bg: "#FEE2E2", border: "#FCA5A5", iconColor: "#B91C1C", label: "Очень высокий риск" };
  if (score <= 12) return { bg: "#FFEDD5", border: "#FDBA74", iconColor: "#C2410C", label: "Высокий риск" };
  if (score <= 14) return { bg: "#FEF9C3", border: "#FDE047", iconColor: "#A16207", label: "Умеренный риск" };
  if (score <= 18) return { bg: "#FEFCE8", border: "#FEF08A", iconColor: "#CA8A04", label: "Лёгкий риск" };
  return null;
}

function morseColors(score: number | null): BadgeColors {
  if (score === null) return null;
  if (score >= 51) return { bg: "#FEE2E2", border: "#FCA5A5", iconColor: "#B91C1C", label: "Высокий риск" };
  if (score >= 25) return { bg: "#FEF9C3", border: "#FDE047", iconColor: "#A16207", label: "Низкий риск" };
  return null;
}

export default function AssessmentIndicator({
  bradenScore,
  morseScore,
}: {
  bradenScore: number | null;
  morseScore: number | null;
}) {
  const braden = bradenColors(bradenScore);
  const morse = morseColors(morseScore);

  return (
    <div className="flex items-center gap-1">
      {braden && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: braden.bg,
                  border: `1px solid ${braden.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BedDouble size={13} color={braden.iconColor} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Брадена: {bradenScore} — {braden.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {morse && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: morse.bg,
                  border: `1px solid ${morse.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FallingPersonIcon color={morse.iconColor} size={14} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Морзе: {morseScore} — {morse.label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
