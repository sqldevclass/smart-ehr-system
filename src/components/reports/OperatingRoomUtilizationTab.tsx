import { format } from "date-fns";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useOperatingRoomUtilization } from "@/hooks/useOperatingRoomUtilization";
import { formatMinutesRu, type UtilizationAggregate } from "@/lib/operatingRoomUtilization";

function formatPercent(utilization: number | null): string {
  if (utilization === null) return "—";
  return `${(utilization * 100).toFixed(1)} %`;
}

function formatHours(minutes: number): string {
  return `${Math.round(minutes / 60)} ч`;
}

function formatMean(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function AggregateCells({ agg, bold }: { agg: UtilizationAggregate; bold?: boolean }) {
  const cls = bold ? "font-semibold" : undefined;
  return (
    <>
      <TableCell className={cls}>{formatMean(agg.surgeries)}</TableCell>
      <TableCell className={cls}>{formatMinutesRu(agg.minutes)}</TableCell>
      <TableCell className={cls}>{formatHours(agg.capacityMinutes)}</TableCell>
      <TableCell className={cls}>{formatPercent(agg.utilization)}</TableCell>
    </>
  );
}

export default function OperatingRoomUtilizationTab({ from, to }: { from: string; to: string }) {
  const { result, isLoading, error } = useOperatingRoomUtilization(from, to);

  const periodLine = `Период: ${format(new Date(from), "dd.MM.yyyy")} – ${format(new Date(to), "dd.MM.yyyy")} · рабочих дней: ${result?.businessDays ?? 0}`;

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold">Загруженность Операционного блока</h3>
      <p className="text-sm text-muted-foreground">
        Количество и длительность операций по операционным за период относительно доступного рабочего времени.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Не удалось загрузить данные о загруженности операционных.
        </p>
      )}
      {isLoading && !error && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {!isLoading && !error && result && (
        <>
          <p className="text-sm text-muted-foreground">{periodLine}</p>
          {result.rows.length === 0 && !result.unassigned ? (
            <p className="text-sm text-muted-foreground">Операционные не найдены.</p>
          ) : (
            <Table wrapperClassName="rounded-md border">
              <TableHeader>
                <TableRow>
                  <TableHead>Операционный блок</TableHead>
                  <TableHead>Количество операций</TableHead>
                  <TableHead>Длительность операции</TableHead>
                  <TableHead>Мощность</TableHead>
                  <TableHead>% Загруженность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row) => (
                  <TableRow key={row.roomId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.surgeries}</TableCell>
                    <TableCell>{formatMinutesRu(row.minutes)}</TableCell>
                    <TableCell>{formatHours(row.capacityMinutes)}</TableCell>
                    <TableCell>{formatPercent(row.utilization)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-semibold">Среднее</TableCell>
                  <AggregateCells agg={result.average} bold />
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">Итого</TableCell>
                  <AggregateCells agg={result.total} bold />
                </TableRow>
                {result.unassigned && (
                  <TableRow>
                    <TableCell className="italic text-muted-foreground">Помещение не указано</TableCell>
                    <TableCell className="italic text-muted-foreground">{result.unassigned.surgeries}</TableCell>
                    <TableCell className="italic text-muted-foreground">
                      {formatMinutesRu(result.unassigned.minutes)}
                    </TableCell>
                    <TableCell className="italic text-muted-foreground">—</TableCell>
                    <TableCell className="italic text-muted-foreground">—</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Мощность = рабочие дни (пн–пт) × 8 часов.</p>
            <p>% загруженности = длительность операций / мощность.</p>
            {result.withoutDuration > 0 && (
              <p>
                Операций без указанной длительности: {result.withoutDuration} (учтены в количестве, не учтены в
                длительности)
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
