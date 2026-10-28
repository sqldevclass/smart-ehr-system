import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FilterSelect } from "@/components/reports/FilterSelect";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { fmtMoney, totalsFooter } from "@/components/reports/reportTotals";
import { cn } from "@/lib/utils";

type WarehouseTypeCode = "central_pharmacy" | "general" | "department";

export interface WarehouseStockWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  type_code: WarehouseTypeCode;
  type_name: string;
  department_name: string | null;
  is_active: boolean;
  in_transit_cost: number;
  in_transit_positions: number;
}

export interface WarehouseStockItem {
  warehouse_id: string;
  item_kind: "drug" | "product";
  item_id: string;
  item_name: string;
  unit_name: string | null;
  min_quantity: number | null;
  quantity: number;
  batches: number;
  nearest_expiry: string | null;
  cost_value: number;
  sell_value: number;
  expired_qty: number;
  expired_cost: number;
  expiring_qty: number;
  expiring_cost: number;
  is_low: boolean;
}

export interface WarehouseStockReport {
  generated_at: string | null;
  warehouses: WarehouseStockWarehouse[];
  items: WarehouseStockItem[];
}

const TYPE_ORDER: WarehouseTypeCode[] = ["central_pharmacy", "general", "department"];
const SECTION_TITLES: Record<WarehouseTypeCode, string> = {
  central_pharmacy: "Центральная аптека",
  general: "Общий склад",
  department: "Склады отделений",
};
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => (v == null ? null : String(v));

function parseReport(raw: unknown): WarehouseStockReport {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  return {
    generated_at: str(obj.generated_at),
    warehouses: arr(obj.warehouses).map((w) => ({
      warehouse_id: String(w.warehouse_id),
      warehouse_name: String(w.warehouse_name ?? "—"),
      type_code: (TYPE_ORDER.includes(w.type_code as WarehouseTypeCode) ? w.type_code : "general") as WarehouseTypeCode,
      type_name: String(w.type_name ?? ""),
      department_name: str(w.department_name),
      is_active: w.is_active !== false,
      in_transit_cost: num(w.in_transit_cost),
      in_transit_positions: num(w.in_transit_positions),
    })),
    items: arr(obj.items).map((i) => ({
      warehouse_id: String(i.warehouse_id),
      item_kind: i.item_kind === "drug" ? "drug" : "product",
      item_id: String(i.item_id),
      item_name: String(i.item_name ?? "—"),
      unit_name: str(i.unit_name),
      min_quantity: i.min_quantity == null ? null : num(i.min_quantity),
      quantity: num(i.quantity),
      batches: num(i.batches),
      nearest_expiry: str(i.nearest_expiry),
      cost_value: num(i.cost_value),
      sell_value: num(i.sell_value),
      expired_qty: num(i.expired_qty),
      expired_cost: num(i.expired_cost),
      expiring_qty: num(i.expiring_qty),
      expiring_cost: num(i.expiring_cost),
      is_low: i.is_low === true,
    })),
  };
}

const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const isExpired = (i: WarehouseStockItem) => i.expired_qty > 0;
const isExpiring = (i: WarehouseStockItem) => i.expiring_qty > 0;

function matchesStatus(i: WarehouseStockItem, status: string) {
  if (status === "expired") return isExpired(i);
  if (status === "expiring") return isExpiring(i);
  if (status === "low") return i.is_low;
  return true;
}

function summarize(warehouses: WarehouseStockWarehouse[], items: WarehouseStockItem[]) {
  return {
    cost: sum(items, (i) => i.cost_value),
    sell: sum(items, (i) => i.sell_value),
    expiredCost: sum(items, (i) => i.expired_cost),
    expiredCount: items.filter(isExpired).length,
    expiringCost: sum(items, (i) => i.expiring_cost),
    expiringCount: items.filter(isExpiring).length,
    lowCount: items.filter((i) => i.is_low).length,
    transit: sum(warehouses, (w) => w.in_transit_cost),
  };
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd.MM.yyyy");
};
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

function StatusBadges({ item }: { item: WarehouseStockItem }) {
  if (!isExpired(item) && !isExpiring(item) && !item.is_low) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {isExpired(item) && <Badge variant="destructive">Просрочено</Badge>}
      {isExpiring(item) && <Badge variant="outline" className="border-transparent bg-orange-500/15">Истекает</Badge>}
      {item.is_low && <Badge variant="secondary" className="bg-warning/15">Мало</Badge>}
    </div>
  );
}

const columns: ColumnDef<WarehouseStockItem, any>[] = [
  {
    id: "name", accessorKey: "item_name", header: "Наименование",
    cell: ({ row }) => (
      <span className="whitespace-nowrap">
        {row.original.item_name}{" "}
        <span className="text-xs text-muted-foreground">{row.original.item_kind === "drug" ? "Препарат" : "Товар"}</span>
      </span>
    ),
  },
  {
    id: "quantity", accessorKey: "quantity", header: "Количество", meta: { align: "right" },
    cell: ({ row }) => `${fmtQty(row.original.quantity)}${row.original.unit_name ? ` ${row.original.unit_name}` : ""}`,
  },
  { id: "batches", accessorKey: "batches", header: "Партий", meta: { align: "right" } },
  { id: "nearest_expiry", accessorKey: "nearest_expiry", header: "Ближайший срок", cell: ({ getValue }) => fmtDate(getValue()) },
  { id: "cost_value", accessorKey: "cost_value", header: "Стоимость (закупка)", meta: { align: "right" }, cell: ({ getValue }) => fmtMoney(getValue()) },
  { id: "sell_value", accessorKey: "sell_value", header: "Сумма (по цене продажи)", meta: { align: "right" }, cell: ({ getValue }) => fmtMoney(getValue()) },
  { id: "status", header: "Статус", cell: ({ row }) => <StatusBadges item={row.original} /> },
];

function WarehouseCard({ warehouse, items, totalCost }: { warehouse: WarehouseStockWarehouse; items: WarehouseStockItem[]; totalCost: number }) {
  const [open, setOpen] = useState(false);
  const s = summarize([warehouse], items);
  const share = totalCost > 0 ? Math.round(s.cost / totalCost * 100) : 0;
  const positions = new Set(items.map((i) => `${i.item_kind}:${i.item_id}`)).size;
  return (
    <div className="min-w-0 rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium break-words">{warehouse.warehouse_name}</h3>
          {warehouse.department_name && <p className="text-sm text-muted-foreground">{warehouse.department_name}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {warehouse.type_name && <Badge variant="outline">{warehouse.type_name}</Badge>}
          {!warehouse.is_active && <Badge variant="secondary">Неактивен</Badge>}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{fmtMoney(s.cost)}</span>
          <span className="text-sm text-muted-foreground">по закупке</span>
        </div>
        <div className="flex items-center gap-3">
          <progress value={s.cost} max={totalCost || 1} aria-label={`Доля: ${warehouse.warehouse_name}`}
            className="h-1.5 w-32 overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary" />
          <span className="text-sm text-muted-foreground">{share}%</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>Позиций: {positions}</span>
        <span>По цене продажи: {fmtMoney(s.sell)}</span>
        {warehouse.in_transit_positions > 0 && (
          <span>В пути: {fmtMoney(warehouse.in_transit_cost)} ({warehouse.in_transit_positions} поз.)</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {s.expiredCount > 0 && <Badge variant="destructive">Просрочено: {s.expiredCount}</Badge>}
        {s.expiringCount > 0 && <Badge variant="outline" className="border-transparent bg-orange-500/15">Истекает: {s.expiringCount}</Badge>}
        {s.lowCount > 0 && <Badge variant="secondary" className="bg-warning/15">Мало: {s.lowCount}</Badge>}
        {!s.expiredCount && !s.expiringCount && !s.lowCount && <span className="text-sm text-muted-foreground">Без замечаний</span>}
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">Нет остатков</p> : (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">{open ? "Скрыть позиции" : "Показать позиции"}</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <DataTable
              columns={columns}
              data={items}
              emptyMessage="Нет остатков"
              getRowId={(row) => `${row.item_kind}:${row.item_id}`}
              renderFooter={(table) => {
                const rows = table.getFilteredRowModel().rows.map((r) => r.original);
                return totalsFooter(table, "Итого", {
                  name: `Позиций: ${rows.length}`,
                  cost_value: fmtMoney(sum(rows, (r) => r.cost_value)),
                  sell_value: fmtMoney(sum(rows, (r) => r.sell_value)),
                });
              }}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

export default function WarehouseStockTab() {
  const { user } = useAuth();
  const [type, setType] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["warehouse-stock-report", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_warehouse_stock_report");
      if (error) throw error;
      return parseReport(data as unknown);
    },
  });

  const view = useMemo(() => {
    const warehouses = (data?.warehouses ?? [])
      .filter((w) => (type === "all" || w.type_code === type) && (warehouseId === "all" || w.warehouse_id === warehouseId));
    const q = search.trim().toLocaleLowerCase("ru");
    const ids = new Set(warehouses.map((w) => w.warehouse_id));
    const items = (data?.items ?? []).filter((i) => ids.has(i.warehouse_id) && matchesStatus(i, status)
      && (!q || i.item_name.toLocaleLowerCase("ru").includes(q)));
    const byWarehouse = new Map<string, WarehouseStockItem[]>();
    for (const i of items) byWarehouse.set(i.warehouse_id, [...(byWarehouse.get(i.warehouse_id) ?? []), i]);
    const hideEmpty = status !== "all" || !!q;
    const shown = warehouses.filter((w) => !hideEmpty || byWarehouse.has(w.warehouse_id));
    return { warehouses: shown, items, byWarehouse };
  }, [data, type, warehouseId, status, search]);

  const totals = summarize(view.warehouses, view.items);
  const warehouseOptions = (data?.warehouses ?? []).filter((w) => type === "all" || w.type_code === type)
    .sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name, "ru"))
    .map((w) => ({ value: w.warehouse_id, label: w.warehouse_name }));
  const generated = data?.generated_at ? new Date(data.generated_at) : dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Стоимость запасов (закупка)" value={fmtMoney(totals.cost)} />
        <MetricTile label="Стоимость по цене продажи" value={fmtMoney(totals.sell)} />
        <MetricTile label={`Просрочено (позиций: ${totals.expiredCount})`} value={fmtMoney(totals.expiredCost)} highlight={totals.expiredCost > 0} />
        <MetricTile label={`Истекает скоро (позиций: ${totals.expiringCount})`} value={fmtMoney(totals.expiringCost)} highlight={totals.expiringCost > 0} />
        <MetricTile label="Низкий остаток (позиций)" value={totals.lowCount} highlight={totals.lowCount > 0} />
        <MetricTile label="В пути (товары между складами)" value={fmtMoney(totals.transit)} />
      </SummaryCard>
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect label="Тип склада" value={type} onChange={(v) => { setType(v); setWarehouseId("all"); }} options={[
          { value: "all", label: "Все" }, { value: "central_pharmacy", label: "Аптека" },
          { value: "general", label: "Общий склад" }, { value: "department", label: "Склады отделений" },
        ]} />
        <FilterSelect label="Склад" value={warehouseId} onChange={setWarehouseId} options={[{ value: "all", label: "Все склады" }, ...warehouseOptions]} />
        <FilterSelect label="Статус" value={status} onChange={setStatus} options={[
          { value: "all", label: "Все" }, { value: "expired", label: "Просрочено" },
          { value: "expiring", label: "Истекает скоро" }, { value: "low", label: "Низкий остаток" },
        ]} />
        <SearchInput value={search} onChange={setSearch} placeholder="Препарат или товар" className="w-full sm:w-60" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-muted-foreground">Данные на {generated && !Number.isNaN(generated.getTime()) ? format(generated, "HH:mm") : "—"}</span>
          <Button variant="outline" size="icon" aria-label="Обновить" title="Обновить" disabled={isFetching || !user?.hospitalId} onClick={() => void refetch()}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin motion-reduce:animate-none")} />
          </Button>
        </div>
      </div>
      {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground" role="status">Загрузка…</p>
        : error ? <p className="py-8 text-center text-sm text-destructive" role="alert">Не удалось загрузить данные по складам.</p>
        : !view.warehouses.length ? <p className="py-8 text-center text-sm text-muted-foreground">Нет складов, соответствующих выбранным фильтрам.</p>
        : <div className="space-y-6">
          {TYPE_ORDER.map((code) => {
            const list = view.warehouses.filter((w) => w.type_code === code)
              .sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name, "ru"));
            if (!list.length) return null;
            return (
              <section key={code} className="space-y-3">
                <h2 className="border-b pb-3 font-semibold">{list[0].type_name || SECTION_TITLES[code]}</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {list.map((w) => <WarehouseCard key={w.warehouse_id} warehouse={w} items={view.byWarehouse.get(w.warehouse_id) ?? []} totalCost={totals.cost} />)}
                </div>
              </section>
            );
          })}
        </div>}
    </div>
  );
}
