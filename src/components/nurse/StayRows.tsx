import { Fragment, type ReactNode } from "react";
import { useStayRows, type StayTable } from "@/hooks/useStayRows";

interface Props<T> {
  table: StayTable;
  select: string;
  hospitalizationId: string;
  orderBy: string;
  className?: string;
  renderRow: (row: T) => ReactNode;
}

/** A read-only list of one stay's rows from a nursing table, with loading and error states. */
export default function StayRows<T extends { id: string }>({
  table,
  select,
  hospitalizationId,
  orderBy,
  className,
  renderRow,
}: Props<T>) {
  const { data: rows = [], isLoading, error } = useStayRows<T>({ table, select, hospitalizationId, orderBy });

  if (isLoading) return <p className="text-xs text-muted-foreground">Загрузка...</p>;
  if (error) return <p className="text-xs text-destructive">Не удалось загрузить записи</p>;
  return (
    <div className={className}>
      {rows.map((row) => (
        <Fragment key={row.id}>{renderRow(row)}</Fragment>
      ))}
    </div>
  );
}
