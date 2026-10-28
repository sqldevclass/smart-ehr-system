import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

export default function IncomingView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse, isLoading: whLoading, error: warehouseError } = useMyWarehouse(warehouseTypeCode);

  const [productId, setProductId] = useState("");
  const [series, setSeries] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qtyUnits, setQtyUnits] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [markup, setMarkup] = useState("0");
  const [supplierId, setSupplierId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: products = [] } = useQuery({
    queryKey: ["products", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: drugFormulary = [] } = useQuery({
    queryKey: ["drug-formulary-active", user?.hospitalId],
    enabled: !!user?.hospitalId && warehouseTypeCode === "central_pharmacy",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_formulary")
        .select("id, trade_name, inn, release_form_id, packaging_id, manufacturer_id")
        .eq("hospital_id", user?.hospitalId ?? "")
        .eq("is_active", true)
        .order("trade_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["incoming-recent", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_batches")
        .select(
          "id, received_at, series_number, expiry_date, quantity_units, purchase_price, selling_price, products(name), drug_formulary(trade_name), suppliers(name)"
        )
        .eq("warehouse_id", warehouse?.id ?? "")
        .order("received_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const sellingPrice = useMemo(() => {
    const p = parseFloat(purchasePrice) || 0;
    const m = parseFloat(markup) || 0;
    return (p * (1 + m / 100)).toFixed(2);
  }, [purchasePrice, markup]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouse || !user) throw new Error("Склад не настроен");
      const isPharmacy = warehouseTypeCode === "central_pharmacy";
      const validation: Record<string, string> = {};
      if (!productId) validation.productId = "Выберите позицию";
      if (!qtyUnits.trim() || !Number.isFinite(Number(qtyUnits)) || Number(qtyUnits) <= 0) validation.qtyUnits = "Количество должно быть больше нуля";
      if (!purchasePrice.trim() || !Number.isFinite(Number(purchasePrice)) || Number(purchasePrice) <= 0) validation.purchasePrice = "Цена должна быть больше нуля";
      if (!markup.trim() || !Number.isFinite(Number(markup)) || Number(markup) < 0) validation.markup = "Наценка должна быть неотрицательной";
      if (isPharmacy && !expiry) validation.expiry = "Укажите срок годности препарата";
      if (expiry && (Number.isNaN(new Date(expiry).getTime()) || expiry < format(new Date(), "yyyy-MM-dd"))) validation.expiry = "Срок годности не должен быть в прошлом";
      setFieldErrors(validation);
      if (Object.keys(validation).length) throw new Error("Проверьте поля формы");
      const { error } = await supabase.rpc("receive_stock", {
        p_warehouse_id: warehouse.id,
        p_product_id: isPharmacy ? null : productId,
        p_drug_formulary_id: isPharmacy ? productId : null,
        p_supplier_id: supplierId || null,
        p_series_number: series.trim() || null,
        p_expiry_date: expiry || null,
        p_quantity_units: Number(qtyUnits),
        p_purchase_price: Number(purchasePrice),
        p_markup_percent: Number(markup),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Поступление сохранено");
      setFieldErrors({});
      setProductId("");
      setSeries("");
      setExpiry("");
      
      setQtyUnits("");
      setPurchasePrice("");
      setMarkup("0");
      setSupplierId("");
      qc.invalidateQueries({ queryKey: ["incoming-recent", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (whLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  if (warehouseError) return <p role="alert" className="text-sm text-destructive">{warehouseError.message}</p>;
  if (!warehouse) return <p className="text-sm text-destructive">Склад не настроен</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">Склад: {warehouse.name}</p>
      </div>

      <form noValidate
        className="rounded-lg border bg-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Позиция</Label>
          {warehouseTypeCode === "central_pharmacy" ? (
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите препарат" />
              </SelectTrigger>
              <SelectContent>
                {drugFormulary.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.trade_name}{d.inn ? ` (${d.inn})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите товар" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {fieldErrors.productId && <p role="alert" className="text-sm text-destructive">{fieldErrors.productId}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Номер серии</Label>
          <Input value={series} onChange={(e) => setSeries(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Срок годности</Label>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          {fieldErrors.expiry && <p role="alert" className="text-sm text-destructive">{fieldErrors.expiry}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Количество единиц</Label>
          <Input
            type="number"
            step="0.01"
            value={qtyUnits}
            onChange={(e) => setQtyUnits(e.target.value)}
          />
          {fieldErrors.qtyUnits && <p role="alert" className="text-sm text-destructive">{fieldErrors.qtyUnits}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Закупочная цена</Label>
          <Input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
          {fieldErrors.purchasePrice && <p role="alert" className="text-sm text-destructive">{fieldErrors.purchasePrice}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Наценка, %</Label>
          <Input
            type="number"
            step="0.01"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
          {fieldErrors.markup && <p role="alert" className="text-sm text-destructive">{fieldErrors.markup}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Цена продажи</Label>
          <Input value={sellingPrice} readOnly className="bg-muted" />
        </div>
        <div className="space-y-1.5">
          <Label>Поставщик</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите поставщика" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Сохранение…" : "Принять на склад"}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-foreground">Последние поступления</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Дата</th>
                <th className="p-3">Позиция</th>
                <th className="p-3">Серия</th>
                <th className="p-3">Годен до</th>
                
                <th className="p-3">Количество</th>
                <th className="p-3">Закупочная цена</th>
                <th className="p-3">Цена продажи</th>
                <th className="p-3">Поставщик</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.received_at ? format(new Date(r.received_at), "yyyy-MM-dd") : "—"}</td>
                  <td className="p-3">
                    {r.drug_formulary?.trade_name || r.products?.name || "—"}
                  </td>
                  <td className="p-3">{r.series_number || "—"}</td>
                  <td className="p-3">{r.expiry_date || "—"}</td>
                  
                  <td className="p-3">{r.quantity_units}</td>
                  <td className="p-3">{r.purchase_price ?? "—"}</td>
                  <td className="p-3">{r.selling_price ?? "—"}</td>
                  <td className="p-3">{r.suppliers?.name || "—"}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Нет поступлений
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
