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

export default function AssessmentIndicator({
  bradenScore,
  fallRiskScore,
  fallRiskScale,
}: {
  bradenScore: number | null;
  fallRiskScore: number | null;
  fallRiskScale: "morse" | "humpty_dumpty";
}) {
  const braden = bradenColors(bradenScore);

  const isFallRiskHigh =
    fallRiskScale === "humpty_dumpty"
      ? (fallRiskScore ?? 0) >= 12
      : (fallRiskScore ?? 0) >= 51;
  const isFallRiskLow =
    fallRiskScale === "humpty_dumpty"
      ? (fallRiskScore ?? 0) >= 7 && (fallRiskScore ?? 0) < 12
      : (fallRiskScore ?? 0) >= 25 && (fallRiskScore ?? 0) < 51;

  const fallRiskBg = isFallRiskHigh ? "#FEE2E2" : isFallRiskLow ? "#FEF9C3" : null;
  const fallRiskBorder = isFallRiskHigh ? "#FCA5A5" : isFallRiskLow ? "#FDE047" : null;
  const fallRiskIconColor = isFallRiskHigh ? "#B91C1C" : "#A16207";
  const fallRiskLabel = isFallRiskHigh ? "Высокий риск падения" : "Низкий риск падения";
  const showFallRisk = fallRiskScore !== null && fallRiskBg !== null;

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
      {showFallRisk && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  background: fallRiskBg!,
                  border: `1px solid ${fallRiskBorder!}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FallingPersonIcon color={fallRiskIconColor} size={14} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {fallRiskScale === "humpty_dumpty" ? "Хамти Дамти" : "Морзе"}: {fallRiskScore} — {fallRiskLabel}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
