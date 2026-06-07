import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { addDays, parseISO } from "date-fns";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

type Filter = "all" | "expiring" | "low";

export default function StockView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const { data: warehouse, isLoading: whLoading } = useMyWarehouse(warehouseTypeCode);
  const [filter, setFilter] = useState<Filter>("all");

  const { data: stock = [] } = useQuery({
    queryKey: ["stock", warehouse?.id],
    enabled: !!warehouse?.id && !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_batches")
        .select(
          "id, product_id, drug_formulary_id, series_number, expiry_date, quantity_packages, quantity_units, selling_price, products(name, min_stock_quantity, expiry_notify_days), drug_formulary(trade_name, min_quantity, expiry_notify_days)"
        )
        .eq("hospital_id", user!.hospitalId)
        .eq("warehouse_id", warehouse!.id)
        .gt("quantity_units", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      return data || [];
    },
  });

  const today = useMemo(() => new Date(), []);

  const rows = stock.map((r: any) => {
    const product = r.products;
    const expiring =
      r.expiry_date &&
      parseISO(r.expiry_date) <= addDays(today, product?.expiry_notify_days ?? 30);
    const low =
      product?.min_stock_quantity != null &&
      r.quantity_packages <= product.min_stock_quantity;
    return { ...r, _expiring: expiring, _low: low };
  });

  const filtered = rows.filter((r) => {
    if (filter === "expiring") return r._expiring;
    if (filter === "low") return r._low;
    return true;
  });

  if (whLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!warehouse)
    return <p className="text-sm text-destructive">No warehouse configured.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{warehouse.name}</p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          <TabsTrigger value="low">Low Stock</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Product</th>
              <th className="p-3">Type</th>
              <th className="p-3">Series</th>
              <th className="p-3">Expiry</th>
              <th className="p-3">Pkgs</th>
              <th className="p-3">Units</th>
              <th className="p-3">Selling Price</th>
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
                <td className="p-3">{r.products?.name}</td>
                <td className="p-3">{r.products?.product_types?.code || "—"}</td>
                <td className="p-3">{r.series_number || "—"}</td>
                <td className="p-3">{r.expiry_date || "—"}</td>
                <td className="p-3">{r.quantity_packages}</td>
                <td className="p-3">{r.quantity_units}</td>
                <td className="p-3">{r.selling_price ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
