import { useFluidBalanceByDay } from "@/hooks/useFluidBalanceByDay";
import { balanceColorClass, fluidTotals, formatSignedMl } from "@/lib/fluidBalance";
import { cn } from "@/lib/utils";

/** A stay's whole-hospitalization fluid balance, shown on its row; nothing if it has no fluid records. */
export default function StayFluidBalanceSummary({ hospitalizationId }: { hospitalizationId: string }) {
  const { data: days = [] } = useFluidBalanceByDay(hospitalizationId);
  if (days.length === 0) return null;
  const { balance } = fluidTotals(days);
  return (
    <span className={cn("font-medium", balanceColorClass(balance))}>
      Баланс: {formatSignedMl(balance)}
    </span>
  );
}
