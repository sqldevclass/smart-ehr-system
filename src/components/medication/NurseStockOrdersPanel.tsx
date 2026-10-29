import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TableCell, TableRow } from "@/components/ui/table";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/reports/data-table/DataTable";
import HighlightMatch from "@/components/shared/HighlightMatch";
import { matchesSearch } from "@/lib/search";
import { useMyWarehouse } from "@/components/inventory-shared/useMyWarehouse";
import { STOCK_ORDER_SELECT, StockOrderItemsCell, StockOrderStatusBadge, fmtOrderDate } from "@/components/inventory-shared/stockOrderStatus";

const sb = supabase as any;

type SourceKey = "general" | "central_pharmacy";
interface OrderableItem { item_kind: "drug" | "product"; item_id: string; name: string; inn: string | null; dose: string | null; unit_name: string | null; available: number; nearest_expiry: string | null }
interface CartItem { item_kind: "drug" | "product"; item_id: string; name: string; unit_name: string | null; quantity: number; available: number }

interface Props { deptWarehouse: { id: string; name: string } | null | undefined; hospitalId: string }

function validQty(qty: number, available: number) {
  if (!Number.isFinite(qty) || qty <= 0 || qty > available) {
    toast.error(`Недостаточно на складе: доступно ${available}`);
    return false;
  }
  return true;
}

function SourceTab({ source, deptWarehouseId, cart, setCart }: {
  source: { id: string; name: string } | null | undefined;
  deptWarehouseId: string;
  cart: CartItem[];
  setCart: (c: CartItem[]) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [ordering, setOrdering] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["orderable-items", source?.id],
    enabled: !!source?.id,
    queryFn: async () => {
      const { data, error } = await sb.rpc("list_orderable_items", { p_from_warehouse_id: source!.id });
      if (error) { toast.error(error.message); throw error; }
      return ((data || []) as any[]).map((r) => ({ ...r, available: Number(r.available) })) as OrderableItem[];
    },
  });

  const results = useMemo(() => !search.trim() ? [] :
    items.filter((i) => matchesSearch([i.name, i.inn, i.dose], search)).slice(0, 50), [items, search]);

  const addToCart = (item: OrderableItem) => {
    const qty = Number(qtys[item.item_id] ?? item.available);
    if (!validQty(qty, item.available)) return;
    const entry: CartItem = { item_kind: item.item_kind, item_id: item.item_id, name: item.name, unit_name: item.unit_name, quantity: qty, available: item.available };
    const exists = cart.some((c) => c.item_id === item.item_id);
    setCart(exists ? cart.map((c) => (c.item_id === item.item_id ? entry : c)) : [...cart, entry]);
  };

  const order = async () => {
    if (!source || !cart.length) return;
    setOrdering(true);
    const { error } = await sb.rpc("create_stock_order", {
      p_from_warehouse_id: source.id, p_to_warehouse_id: deptWarehouseId,
      p_items: cart.map((c) => ({ item_kind: c.item_kind, item_id: c.item_id, quantity_units: c.quantity })),
    });
    setOrdering(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Заказ отправлен");
    setCart([]);
    qc.invalidateQueries({ queryKey: ["nurse-stock-orders", deptWarehouseId] });
    qc.invalidateQueries({ queryKey: ["orderable-items", source.id] });
    qc.invalidateQueries({ queryKey: ["stock-orders"] });
  };

  const resultColumns = useMemo<ColumnDef<OrderableItem>[]>(() => [
    { id: "name", header: "Название", enableColumnFilter: false, accessorFn: (r) => r.name, cell: ({ row }) => <HighlightMatch text={row.original.name} term={search} /> },
    { id: "inn", header: "МНН", enableColumnFilter: false, accessorFn: (r) => r.inn || "—", cell: ({ row }) => <HighlightMatch text={row.original.inn || "—"} term={search} /> },
    { id: "dose", header: "Доза", enableColumnFilter: false, accessorFn: (r) => r.dose || "—" },
    { id: "unit", header: "Ед. изм.", enableColumnFilter: false, accessorFn: (r) => r.unit_name || "—" },
    { id: "expiry", header: "Годен до", enableColumnFilter: false, accessorFn: (r) => (r.nearest_expiry ? format(new Date(r.nearest_expiry), "dd.MM.yyyy") : "—") },
    {
      id: "qty", header: "Количество", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => <Input type="number" min={0} className="w-24 h-8" value={qtys[row.original.item_id] ?? String(row.original.available)}
        onChange={(e) => setQtys((p) => ({ ...p, [row.original.item_id]: e.target.value }))} />,
    },
    { id: "add", header: "", enableColumnFilter: false, enableHiding: false, cell: ({ row }) => <Button size="sm" variant="outline" onClick={() => addToCart(row.original)}>В корзину</Button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [search, qtys, cart]);

  const cartColumns = useMemo<ColumnDef<CartItem>[]>(() => [
    { id: "name", header: "Название", enableColumnFilter: false, accessorFn: (r) => r.name },
    {
      id: "qty", header: "Количество", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => <Input type="number" min={0} className="w-24 h-8" defaultValue={row.original.quantity}
        onBlur={(e) => {
          const qty = Number(e.target.value);
          if (!validQty(qty, row.original.available)) { e.target.value = String(row.original.quantity); return; }
          setCart(cart.map((c) => (c.item_id === row.original.item_id ? { ...c, quantity: qty } : c)));
        }} />,
    },
    { id: "unit", header: "Ед.", enableColumnFilter: false, accessorFn: (r) => r.unit_name || "—" },
    { id: "remove", header: "", enableColumnFilter: false, enableHiding: false, cell: ({ row }) => <Button size="icon" variant="ghost" aria-label="Удалить" onClick={() => setCart(cart.filter((c) => c.item_id !== row.original.item_id))}><Trash2 className="h-4 w-4" /></Button> },
  ], [cart, setCart]);

  if (!source) return <p className="text-center text-muted-foreground py-6">Склад не настроен</p>;

  return <div className="space-y-4">
    <Input placeholder="Поиск препарата / товара" value={search} onChange={(e) => setSearch(e.target.value)} />
    {isLoading ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      : !search.trim() ? <p className="text-sm text-muted-foreground">Начните вводить название</p>
      : <DataTable columns={resultColumns} data={results} getRowId={(r) => r.item_id} emptyMessage="Ничего не найдено" />}
    <div className="space-y-2">
      <h3 className="font-semibold">Корзина</h3>
      <DataTable columns={cartColumns} data={cart} getRowId={(r) => r.item_id} emptyMessage="Корзина пуста"
        renderFooter={(table) => <TableRow><TableCell colSpan={table.getVisibleLeafColumns().length} className="font-semibold">Итого позиций: {cart.length}</TableCell></TableRow>} />
      <div className="flex justify-end">
        <Button onClick={order} disabled={!cart.length || ordering}>{ordering && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Заказать</Button>
      </div>
    </div>
  </div>;
}

export default function NurseStockOrdersPanel({ deptWarehouse }: Props) {
  const qc = useQueryClient();
  const { data: general } = useMyWarehouse("general");
  const { data: pharmacy } = useMyWarehouse("central_pharmacy");
  const [carts, setCarts] = useState<Record<SourceKey, CartItem[]>>({ general: [], central_pharmacy: [] });
  const [cancelling, setCancelling] = useState<string | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["nurse-stock-orders", deptWarehouse?.id],
    enabled: !!deptWarehouse?.id,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await sb.from("stock_orders").select(STOCK_ORDER_SELECT)
        .eq("to_warehouse_id", deptWarehouse!.id).order("ordered_at", { ascending: false }).limit(100);
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const cancel = async (id: string) => {
    setCancelling(id);
    const { error } = await sb.rpc("cancel_stock_order", { p_order_id: id });
    setCancelling(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Заказ отменён");
    qc.invalidateQueries({ queryKey: ["nurse-stock-orders", deptWarehouse?.id] });
    qc.invalidateQueries({ queryKey: ["stock-orders"] });
  };

  const orderColumns = useMemo<ColumnDef<any>[]>(() => [
    { id: "date", header: "Дата", enableColumnFilter: false, accessorFn: (r) => fmtOrderDate(r.ordered_at) },
    { id: "from", header: "Откуда", accessorFn: (r) => r.from_warehouse?.name || "—" },
    { id: "items", header: "Позиции", enableColumnFilter: false, accessorFn: (r) => (r.stock_order_items || []).length, cell: ({ row }) => <StockOrderItemsCell order={row.original} /> },
    { id: "status", header: "Статус", accessorFn: (r) => r.status, cell: ({ row }) => <StockOrderStatusBadge status={row.original.status} /> },
    { id: "reason", header: "Причина", enableColumnFilter: false, accessorFn: (r) => (r.status === "rejected" && r.reject_reason) || "—" },
    {
      id: "actions", header: "", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => row.original.status === "pending"
        ? <Button size="sm" variant="outline" disabled={!!cancelling} onClick={() => cancel(row.original.id)}>{cancelling === row.original.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Отменить</Button>
        : null,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cancelling]);

  if (!deptWarehouse) return <p className="text-center text-muted-foreground py-6">Склад отделения не настроен</p>;

  return <div className="space-y-6">
    <Tabs defaultValue="general" className="space-y-3">
      <TabsList><TabsTrigger value="general">Склад</TabsTrigger><TabsTrigger value="central_pharmacy">Аптека</TabsTrigger></TabsList>
      <TabsContent value="general">
        <SourceTab source={general} deptWarehouseId={deptWarehouse.id} cart={carts.general} setCart={(c) => setCarts((p) => ({ ...p, general: c }))} />
      </TabsContent>
      <TabsContent value="central_pharmacy">
        <SourceTab source={pharmacy} deptWarehouseId={deptWarehouse.id} cart={carts.central_pharmacy} setCart={(c) => setCarts((p) => ({ ...p, central_pharmacy: c }))} />
      </TabsContent>
    </Tabs>
    <div className="space-y-2">
      <h3 className="font-semibold">Мои заказы</h3>
      <DataTable columns={orderColumns} data={orders} isLoading={isLoading} getRowId={(r: any) => r.id} emptyMessage="Заказов пока нет" />
    </div>
  </div>;
}
