import type { ReactNode } from "react";

export interface TotalsCell { colSpan?: number; content?: ReactNode; align?: "left" | "right" }

interface Props { label?: string; cells: TotalsCell[]; cellClassName?: string }

export function TableTotalsFooter({ label = "Итого", cells, cellClassName = "p-3" }: Props) {
  const [first, ...rest] = cells;
  const merged = first && first.content == null;
  const cls = (c: TotalsCell) => `${cellClassName} ${c.align === "right" ? "text-right" : "text-left"}`;
  return <tfoot className="sticky bottom-0 bg-muted/50 font-semibold border-t">
    <tr>
      {merged
        ? <td colSpan={first.colSpan} className={cls(first)}>{label}</td>
        : <td className={cellClassName}>{label}</td>}
      {(merged ? rest : cells).map((c, i) => <td key={i} colSpan={c.colSpan} className={cls(c)}>{c.content}</td>)}
    </tr>
  </tfoot>;
}
