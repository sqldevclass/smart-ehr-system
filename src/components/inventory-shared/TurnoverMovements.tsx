import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PeriodFilter, rangeBounds } from "@/components/shared/PeriodFilter";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { fmtUnits, type TurnoverKind } from "./turnoverTypes";

const PAGE = 200;
const EVENTS: Record<string, string> = {
  incoming: "Приход", transfer_out: "Отправлено", transfer_in: "Принято",
  transfer_return: "Возврат (принят)", writeoff: "Списание", consumable: "Введено пациенту / расход",
};

interface Movement {
  performed_at: string; source_type: string; warehouse_name: string | null; department_name: string | null;
  quantity: number; series_number: string | null; performed_by_name: string | null; detail: string | null;
}

export function TurnoverMovements({ kind, itemId, unit }: { kind: TurnoverKind; itemId: string; unit: string }) {
  const [period, setPeriod] = usePeriodFilter(false);
  const bounds = rangeBounds(period);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Movement[]>([]);

  useEffect(() => { setOffset(0); setRows([]); }, [kind, itemId, bounds.from, bounds.to]);

  const q = useQuery({
    queryKey: ["item-movements", kind, itemId, bounds.from ?? null, bounds.to ?? null, offset],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_item_movements", {
        p_kind: kind, p_item_id: itemId, p_from: bounds.from ?? null, p_to: bounds.to ?? null, p_limit: PAGE, p_offset: offset,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, quantity: Number(r.quantity ?? 0) })) as Movement[];
    },
  });

  useEffect(() => {
    if (!q.data) return;
    setRows((prev) => (offset === 0 ? q.data : [...prev.slice(0, offset), ...q.data]));
  }, [q.data, offset]);

  const columns = useMemo<ColumnDef<Movement, any>[]>(() => [
    { id: "date", header: "Дата", accessorFn: (r) => r.performed_at, cell: ({ row }) => format(new Date(row.original.performed_at), "dd.MM.yyyy HH:mm") },
    { id: "event", header: "Событие", accessorFn: (r) => EVENTS[r.source_type] ?? r.source_type },
    { id: "warehouse", header: "Склад", accessorFn: (r) => r.warehouse_name ?? "—" },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department_name ?? "—" },
    { id: "qty", header: "Количество", accessorFn: (r) => r.quantity, cell: ({ row }) => {
      const v = row.original.quantity;
      return <span className={v >= 0 ? "text-success font-medium" : "text-destructive font-medium"}>{v > 0 ? "+" : ""}{fmtUnits(v)} {unit}</span>;
    } },
    { id: "series", header: "Серия", accessorFn: (r) => r.series_number ?? "—" },
    { id: "by", header: "Кто", accessorFn: (r) => r.performed_by_name ?? "—" },
    { id: "detail", header: "Примечание", accessorFn: (r) => r.detail ?? "" },
  ], [unit]);

  const hasMore = q.data?.length === PAGE;

  return (
    <div className="space-y-3">
      <h3 className="font-heading text-lg font-semibold text-foreground">История движения</h3>
      {q.isError && <p className="text-sm text-destructive">Не удалось загрузить историю. <button className="underline" onClick={() => q.refetch()}>Повторить</button></p>}
      <DataTable
        columns={columns}
        data={rows}
        isLoading={q.isLoading && offset === 0}
        emptyMessage="Движений нет"
        leftSlot={<PeriodFilter clearable value={period} onChange={setPeriod} />}
      />
      {hasMore && (
        <Button variant="outline" disabled={q.isFetching} onClick={() => setOffset((o) => o + PAGE)}>Показать ещё</Button>
      )}
    </div>
  );
}
