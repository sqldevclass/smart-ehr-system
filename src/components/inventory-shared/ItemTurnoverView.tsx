import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, AlertTriangle, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { fmtMoney, totalsFooter } from "@/components/reports/reportTotals";
import { ScreenHeader } from "./ScreenHeader";
import { TurnoverItemPicker } from "./TurnoverItemPicker";
import { TurnoverDiagram, TurnoverDiagramSkeleton } from "./TurnoverDiagram";
import { TurnoverMovements } from "./TurnoverMovements";
import { fmtUnits, normalizeLifecycle, sumBuckets, type TurnoverKind } from "./turnoverTypes";

const TYPE_LABELS: Record<string, string> = { central_pharmacy: "Центральная аптека", general: "Общий склад", department: "Отделение" };

interface WhereRow { id: string; name: string; type: string; department: string; units: number; value: number }

export default function ItemTurnoverView({ defaultKind }: { defaultKind: TurnoverKind }) {
  const { user, hasPermission } = useAuth();
  const allowed = hasPermission("warehouse.view_all");
  const [kind, setKind] = useState<TurnoverKind>(defaultKind);
  const [itemId, setItemId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["item-lifecycle", kind, itemId, user?.hospitalId],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_item_lifecycle", { p_kind: kind, p_item_id: itemId });
      if (error) throw error;
      return normalizeLifecycle(data);
    },
  });
  const data = q.data;
  const unit = data?.unit_name ?? "";

  const whereRows = useMemo<WhereRow[]>(() => {
    if (!data) return [];
    const rows: WhereRow[] = data.warehouses.filter((w) => w.units > 0).map((w) => ({
      id: w.warehouse_id, name: w.name, type: TYPE_LABELS[w.type_code] ?? w.type_code, department: w.department_name ?? "—", units: w.units, value: w.value,
    }));
    if (data.in_transit.units > 0) rows.push({ id: "transit", name: "В пути", type: "—", department: "—", units: data.in_transit.units, value: data.in_transit.value });
    return rows;
  }, [data]);

  const whereCols = useMemo<ColumnDef<WhereRow, any>[]>(() => [
    { id: "name", header: "Склад", accessorKey: "name" },
    { id: "type", header: "Тип", accessorKey: "type" },
    { id: "department", header: "Отделение", accessorKey: "department" },
    { id: "units", header: "Количество", accessorKey: "units", cell: ({ row }) => `${fmtUnits(row.original.units)} ${unit}` },
    { id: "value", header: "Стоимость", accessorKey: "value", cell: ({ row }) => fmtMoney(row.original.value) },
  ], [unit]);

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
        <ShieldOff className="h-10 w-10" />
        <p>Нет доступа к отчёту «Товарооборот»</p>
      </div>
    );
  }

  let banner = null;
  if (data) {
    const stock = sumBuckets(data.warehouses).units;
    const right = stock + data.in_transit.units + data.patient.units + data.written_off.units;
    const diff = data.received.units - right;
    const ok = Math.abs(diff) < 0.001;
    banner = (
      <div className={`rounded-md border px-3 py-2 ${ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
        <div className={`flex items-center gap-2 text-sm font-medium ${ok ? "text-success" : "text-destructive"}`}>
          {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {ok ? "Баланс сходится" : `Расхождение: ${fmtUnits(diff)}`}
        </div>
        <p className="text-xs text-muted-foreground">
          получено {fmtUnits(data.received.units)} {ok ? "=" : "≠"} на складах {fmtUnits(stock)} + в пути {fmtUnits(data.in_transit.units)} + пациентам {fmtUnits(data.patient.units)} + списано {fmtUnits(data.written_off.units)}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <ScreenHeader
        title="Товарооборот"
        right={<>
          <ToggleGroup type="single" variant="outline" value={kind} onValueChange={(v) => { if (v) { setKind(v as TurnoverKind); setItemId(null); } }}>
            <ToggleGroupItem value="drug">Препараты</ToggleGroupItem>
            <ToggleGroupItem value="product">Товары</ToggleGroupItem>
          </ToggleGroup>
          <TurnoverItemPicker kind={kind} value={itemId} onChange={setItemId} />
        </>}
      />

      {q.isLoading && <TurnoverDiagramSkeleton />}
      {q.isError && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Не удалось загрузить данные: {(q.error as Error)?.message}
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Повторить</Button>
        </div>
      )}
      {data && <>
        {banner}
        <TurnoverDiagram data={data} kind={kind} />
        {itemId && <>
          <div className="space-y-3">
            <h3 className="font-heading text-lg font-semibold text-foreground">Где сейчас</h3>
            <DataTable
              columns={whereCols}
              data={whereRows}
              emptyMessage="Нет остатков (позиция полностью израсходована или списана)"
              renderFooter={whereRows.length ? (t) => totalsFooter(t, "Итого", {
                units: `${fmtUnits(whereRows.reduce((s, r) => s + r.units, 0))} ${unit}`,
                value: fmtMoney(whereRows.reduce((s, r) => s + r.value, 0)),
              }) : undefined}
            />
          </div>
          <TurnoverMovements kind={kind} itemId={itemId} unit={unit} />
        </>}
      </>}
    </div>
  );
}
