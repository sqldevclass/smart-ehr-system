import { format, parseISO } from "date-fns";
import { useFluidBalanceByDay } from "@/hooks/useFluidBalanceByDay";
import { balanceColorClass, dayBalance, fluidTotals, formatSignedMl } from "@/lib/fluidBalance";
import { cn } from "@/lib/utils";

/** One hospitalization's fluid balance, a row per day plus the total. Read-only. */
export default function StayFluidHistory({ hospitalizationId }: { hospitalizationId: string }) {
  const { data: days = [], isLoading, error } = useFluidBalanceByDay(hospitalizationId);

  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  if (error) return <p className="text-xs text-destructive">Не удалось загрузить баланс жидкости</p>;

  const totals = fluidTotals(days);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pb-1 text-left font-normal">Дата</th>
          <th className="pb-1 text-right font-normal">Введено</th>
          <th className="pb-1 text-right font-normal">Выделено</th>
          <th className="pb-1 text-right font-normal">Баланс</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.day}>
            <td className="py-0.5">{format(parseISO(day.day), "dd.MM.yyyy")}</td>
            <td className="py-0.5 text-right text-blue-700">{day.intake_ml} мл</td>
            <td className="py-0.5 text-right text-orange-700">{day.output_ml} мл</td>
            <td className={cn("py-0.5 text-right font-medium", balanceColorClass(dayBalance(day)))}>
              {formatSignedMl(dayBalance(day))}
            </td>
          </tr>
        ))}
        <tr className="border-t font-semibold">
          <td className="pt-1">Всего</td>
          <td className="pt-1 text-right text-blue-700">{totals.intake} мл</td>
          <td className="pt-1 text-right text-orange-700">{totals.output} мл</td>
          <td className={cn("pt-1 text-right", balanceColorClass(totals.balance))}>
            {formatSignedMl(totals.balance)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
