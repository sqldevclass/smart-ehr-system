import type { ReactNode } from "react";
import type { Table } from "@tanstack/react-table";
import { TableCell, TableRow } from "@/components/ui/table";

export const fmtMoney = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function totalsFooter<TData>(table: Table<TData>, label: string, totals: Record<string, ReactNode>) {
  return (
    <TableRow>
      <TableCell className="font-semibold">{label}</TableCell>
      {table.getVisibleLeafColumns().map((column) => (
        <TableCell key={column.id} className="text-right font-semibold">
          {totals[column.id] ?? ""}
        </TableCell>
      ))}
    </TableRow>
  );
}