import { useEffect, useMemo, useRef, useState } from "react";
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
import { STOCK_ORDER_LINE_SELECT, effectiveStatus, lineItemName, StockOrderStatusBadge, fmtOrderDate, type StockOrderLine } from "@/components/inventory-shared/stockOrderStatus";

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

function OrderQtyInput({ initial, max, onCommit, onDraftChange }: {
  initial: number; max: number; onCommit: (value: number | null) => void; onDraftChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(String(initial));
  const callbacks = useRef({ onCommit, onDraftChange });
  callbacks.current = { onCommit, onDraftChange };
  useEffect(() => { setValue(String(initial)); }, [initial]);
  const commit = () => {
    const qty = Number(value.replace(",", "."));
    if (!value.trim() || !validQty(qty, max)) {
      setValue(String(initial));
      callbacks.current.onCommit(null);
      return;
    }
    callbacks.current.onCommit(qty);
  };
  return <Input type="text" inputMode="decimal" aria-label="Количество" className="w-24 h-8" value={value}
    onChange={(event) => { setValue(event.target.value); callbacks.current.onDraftChange?.(event.target.value); }}
    onBlur={() => { if (!callbacks.current.onDraftChange) commit(); }}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />;
}

function MyStockOrders({ sourceId, deptWarehouseId }: { sourceId: string; deptWarehouseId: string }) {
  const qc = useQueryClient();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["nurse-stock-orders", deptWarehouseId, sourceId],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await sb.from("stock_order_items").select(STOCK_ORDER_LINE_SELECT)
        .eq("stock_orders.to_warehouse_id", deptWarehouseId).eq("stock_orders.from_warehouse_id", sourceId).limit(100);
      if (error) { toast.error(error.message); throw error; }
      return ((data || []) as StockOrderLine[]).sort((a, b) => b.stock_orders.ordered_at.localeCompare(a.stock_orders.ordered_at));
    },
  });
  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      const { error } = await sb.rpc("cancel_stock_order_item", { p_item_id: id });
      if (error) throw error;
      toast.success("Позиция отменена");
      for (const key of ["nurse-stock-orders", "stock-orders", "stock-orders-pending-count"]) qc.invalidateQueries({ queryKey: [key] });
    } catch (error: any) { toast.error(error.message || "Не удалось отменить позицию"); }
    finally { setCancelling((current) => current === id ? null : current); }
  };
  const columns = useMemo<ColumnDef<StockOrderLine>[]>(() => [
    { id: "date", header: "Дата", enableColumnFilter: false, accessorFn: (r) => fmtOrderDate(r.stock_orders.ordered_at) },
    { id: "item", header: "Препарат / Товар", accessorFn: lineItemName },
    { id: "quantity", header: "Количество", enableColumnFilter: false, accessorFn: (r) => Number(r.quantity_units) },
    { id: "status", header: "Статус", accessorFn: effectiveStatus, cell: ({ row }) => <StockOrderStatusBadge status={effectiveStatus(row.original)} /> },
    { id: "reason", header: "Причина", enableColumnFilter: false, accessorFn: (r) => r.status === "rejected" ? r.reject_reason || "—" : "—" },
    { id: "actions", header: "", enableColumnFilter: false, enableHiding: false, cell: ({ row }) => row.original.status === "pending"
      ? <Button size="sm" variant="outline" disabled={cancelling === row.original.id} onClick={() => cancel(row.original.id)}>{cancelling === row.original.id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Отменить</Button> : null },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [cancelling]);
  return <div className="space-y-2"><h3 className="font-semibold">Мои заказы</h3>
    <DataTable columns={columns} data={orders} isLoading={isLoading} getRowId={(r) => r.id} emptyMessage="Заказов пока нет" />
  </div>;
}

function SourceTab({ source, deptWarehouseId, cart, setCart }: {
  source: { id: string; name: string } | null | undefined;
  deptWarehouseId: string;
  cart: CartItem[];
  setCart: (c: CartItem[]) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const qtys = useRef<Record<string, string>>({});
  const cartRef = useRef(cart);
  const setCartRef = useRef(setCart);
  cartRef.current = cart;
  setCartRef.current = setCart;
  const [ordering, setOrdering] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["orderable-items", source?.id],
    enabled: !!source?.id,
    queryFn: async () => {
      if (!source) return [];
      const { data, error } = await sb.rpc("list_orderable_items", { p_from_warehouse_id: source.id });
      if (error) { toast.error(error.message); throw error; }
      return ((data || []) as any[]).map((r) => ({ ...r, available: Number(r.available) })) as OrderableItem[];
    },
  });

  const results = useMemo(() => !search.trim() ? [] :
    items.filter((i) => matchesSearch([i.name, i.inn, i.dose], search)).slice(0, 50), [items, search]);

  const addToCart = (item: OrderableItem) => {
    const qty = Number((qtys.current[item.item_id] ?? String(item.available)).replace(",", "."));
    if (!validQty(qty, item.available)) return;
    const entry: CartItem = { item_kind: item.item_kind, item_id: item.item_id, name: item.name, unit_name: item.unit_name, quantity: qty, available: item.available };
    const currentCart = cartRef.current;
    const exists = currentCart.some((c) => c.item_id === item.item_id);
    setCartRef.current(exists ? currentCart.map((c) => (c.item_id === item.item_id ? entry : c)) : [...currentCart, entry]);
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
    qc.invalidateQueries({ queryKey: ["stock-orders-pending-count"] });
  };

  const resultColumns = useMemo<ColumnDef<OrderableItem>[]>(() => [
    { id: "name", header: "Название", enableColumnFilter: false, accessorFn: (r) => r.name, cell: ({ row }) => <HighlightMatch text={row.original.name} term={search} /> },
    { id: "inn", header: "МНН", enableColumnFilter: false, accessorFn: (r) => r.inn || "—", cell: ({ row }) => <HighlightMatch text={row.original.inn || "—"} term={search} /> },
    { id: "dose", header: "Доза", enableColumnFilter: false, accessorFn: (r) => r.dose || "—" },
    { id: "unit", header: "Ед. изм.", enableColumnFilter: false, accessorFn: (r) => r.unit_name || "—" },
    { id: "expiry", header: "Годен до", enableColumnFilter: false, accessorFn: (r) => (r.nearest_expiry ? format(new Date(r.nearest_expiry), "dd.MM.yyyy") : "—") },
    {
      id: "qty", header: "Количество", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => <OrderQtyInput initial={row.original.available} max={row.original.available} onCommit={() => {}}
        onDraftChange={(value) => { qtys.current[row.original.item_id] = value; }} />,
    },
    { id: "add", header: "", enableColumnFilter: false, enableHiding: false, cell: ({ row }) => <Button size="sm" variant="outline" onClick={() => addToCart(row.original)}>В корзину</Button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [search]);

  const cartColumns = useMemo<ColumnDef<CartItem>[]>(() => [
    { id: "name", header: "Название", enableColumnFilter: false, accessorFn: (r) => r.name },
    {
      id: "qty", header: "Количество", enableColumnFilter: false, enableHiding: false,
      cell: ({ row }) => <OrderQtyInput initial={row.original.quantity} max={row.original.available}
        onCommit={(qty) => { if (qty !== null) setCartRef.current(cartRef.current.map((c) => c.item_id === row.original.item_id ? { ...c, quantity: qty } : c)); }} />,
    },
    { id: "unit", header: "Ед.", enableColumnFilter: false, accessorFn: (r) => r.unit_name || "—" },
    { id: "remove", header: "", enableColumnFilter: false, enableHiding: false, cell: ({ row }) => <Button size="icon" variant="ghost" aria-label="Удалить" onClick={() => setCartRef.current(cartRef.current.filter((c) => c.item_id !== row.original.item_id))}><Trash2 className="h-4 w-4" /></Button> },
  ], []);

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
    <MyStockOrders sourceId={source.id} deptWarehouseId={deptWarehouseId} />
  </div>;
}

export default function NurseStockOrdersPanel({ deptWarehouse }: Props) {
  const { data: general } = useMyWarehouse("general");
  const { data: pharmacy } = useMyWarehouse("central_pharmacy");
  const [carts, setCarts] = useState<Record<SourceKey, CartItem[]>>({ general: [], central_pharmacy: [] });

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

  </div>;
}
