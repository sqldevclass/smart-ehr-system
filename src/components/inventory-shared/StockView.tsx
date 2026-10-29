import { toast } from "sonner";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/components/reports/reportTotals";
import { ScreenHeader } from "./ScreenHeader";
import { TableTotalsFooter } from "./TableTotalsFooter";
import { addDays, parseISO, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { staleLabel } from "./StaleThresholdSelect";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

type Filter = "all" | "expiring" | "low" | "stale";

interface StaleRow {
  item_kind: string; item_id: string; item_name: string; unit_name: string | null;
  quantity: number; last_movement_at: string | null; last_movement_type: string | null;
  days_idle: number; stale_after_days: number | null; sell_value: number;
}

const movementLabels: Record<string, string> = {
  transfer_out: "Перемещение",
  writeoff: "Списание",
  consumable: "Расход",
  incoming: "Приход (движения не было)",
};

function StaleItemsTable({ rows }: { rows: StaleRow[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-3">Наименование</th>
            <th className="p-3">Количество</th>
            <th className="p-3">Последнее движение</th>
            <th className="p-3">Тип</th>
            <th className="p-3">Дней без движения</th>
            <th className="p-3">Порог</th>
            <th className="p-3">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.item_kind}-${r.item_id}`} className="border-t">
              <td className="p-3">
                {r.item_name || "—"}{" "}
                <span className="text-xs text-muted-foreground">{r.item_kind === "drug" ? "Препарат" : "Товар"}</span>
              </td>
              <td className="p-3">{r.quantity}{r.unit_name ? ` ${r.unit_name}` : ""}</td>
              <td className="p-3">{r.last_movement_at ? format(new Date(r.last_movement_at), "dd.MM.yyyy") : "—"}</td>
              <td className="p-3">{(r.last_movement_type && movementLabels[r.last_movement_type]) || r.last_movement_type || "—"}</td>
              <td className="p-3">{r.days_idle}</td>
              <td className="p-3">{staleLabel(r.stale_after_days)}</td>
              <td className="p-3">{fmtMoney(r.sell_value)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Неликвидных позиций нет</td></tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <TableTotalsFooter cells={[
            {},
            { colSpan: 5, content: `Позиций: ${rows.length}` },
            { content: fmtMoney(rows.reduce((sum, r) => sum + r.sell_value, 0)) },
          ]} />
        )}
      </table>
    </div>
  );
}

export default function StockView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const { data: warehouse, isLoading: whLoading, error: warehouseError } = useMyWarehouse(warehouseTypeCode);
  const [filter, setFilter] = useState<Filter>("all");

  const { data: stock = [], error: stockError } = useQuery({
    queryKey: ["stock", warehouse?.id],
    enabled: !!warehouse?.id && !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(
          "id, product_id, drug_formulary_id, series_number, expiry_date, quantity_units, selling_price, products(name, min_stock_quantity, expiry_notify_days), drug_formulary(trade_name, min_quantity, expiry_notify_days)"
        )
        .eq("hospital_id", user?.hospitalId ?? "")
        .eq("warehouse_id", warehouse?.id ?? "")
        .gt("quantity_units", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: staleRows = [], error: staleError } = useQuery({
    queryKey: ["stale-items", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async (): Promise<StaleRow[]> => {
      const { data, error } = await supabase.rpc("get_warehouse_stale_items", { p_warehouse_id: warehouse!.id });
      if (error) { toast.error(error.message); throw error; }
      return ((data as any[]) || []).map((r) => ({
        ...r,
        quantity: Number(r.quantity),
        days_idle: Number(r.days_idle),
        stale_after_days: r.stale_after_days == null ? null : Number(r.stale_after_days),
        sell_value: Number(r.sell_value ?? 0),
      }));
    },
  });

  const today = useMemo(() => new Date(), []);

  const rows = stock.map((r: any) => {
    const isPharmacy = !!r.drug_formulary_id;
    const name = isPharmacy
      ? r.drug_formulary?.trade_name
      : r.products?.name;
    const notifyDays = isPharmacy
      ? (r.drug_formulary?.expiry_notify_days ?? 30)
      : (r.products?.expiry_notify_days ?? 30);
    const minQty = isPharmacy
      ? r.drug_formulary?.min_quantity
      : r.products?.min_stock_quantity;
    const expiring =
      r.expiry_date &&
      parseISO(r.expiry_date) <= addDays(today, notifyDays);
    const low = minQty != null && r.quantity_units <= minQty;
    return { ...r, _name: name, _expiring: expiring, _low: low };
  });

  const filtered = rows.filter((r) => {
    if (filter === "expiring") return r._expiring;
    if (filter === "low") return r._low;
    return true;
  });

  if (whLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  if (warehouseError) return <p className="text-sm text-destructive">{warehouseError.message}</p>;
  if (!warehouse)
    return <p className="text-sm text-destructive">Склад не настроен</p>;

  return (
    <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="space-y-4">
      <ScreenHeader title={title} subtitle={warehouse.name} right={
        <TabsList>
          <TabsTrigger value="all">Все</TabsTrigger>
          <TabsTrigger value="expiring">Истекает срок</TabsTrigger>
          <TabsTrigger value="low">Низкий остаток</TabsTrigger>
          <TabsTrigger value="stale" className="gap-1.5">
            Неликвид
            {staleRows.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-xs">{staleRows.length}</Badge>}
          </TabsTrigger>
        </TabsList>
      } />

      {stockError && <p role="alert" className="text-sm text-destructive">{stockError.message}</p>}

      {filter === "stale" && staleError && <p role="alert" className="text-sm text-destructive">{staleError.message}</p>}

      {filter === "stale" ? <StaleItemsTable rows={staleRows} /> : (
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Наименование</th>
              <th className="p-3">Серия</th>
              <th className="p-3">Годен до</th>
              <th className="p-3">Количество</th>
              <th className="p-3">Цена</th>
              <th className="p-3">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: any) => (
              <tr
                key={r.id}
                className={cn(
                  "border-t",
                  r._low && "bg-destructive/15",
                  !r._low && r._expiring && "bg-orange-500/15"
                )}
              >
                <td className="p-3">{r._name || "—"}</td>
                <td className="p-3">{r.series_number || "—"}</td>
                <td className="p-3">{r.expiry_date || "—"}</td>
                <td className="p-3">{r.quantity_units}</td>
                <td className="p-3">{r.selling_price ?? "—"}</td>
                <td className="p-3">{r.selling_price == null ? "—" : fmtMoney(r.quantity_units * r.selling_price)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Нет позиций
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <TableTotalsFooter cells={[
              {},
              { colSpan: 3, content: `Партий: ${filtered.length} · Наименований: ${new Set(filtered.map((r: any) => r.product_id ?? r.drug_formulary_id)).size}` },
              {},
              { content: fmtMoney(filtered.reduce((sum: number, r: any) => sum + (r.selling_price == null ? 0 : Number(r.quantity_units) * Number(r.selling_price)), 0)) },
            ]} />
          )}
        </table>
      </div>
      )}
    </Tabs>
  );
}
