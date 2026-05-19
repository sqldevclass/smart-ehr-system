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
  const { data: warehouse, isLoading: whLoading } = useMyWarehouse(warehouseTypeCode);

  const [productId, setProductId] = useState("");
  const [series, setSeries] = useState("");
  const [expiry, setExpiry] = useState("");
  const [qtyPackages, setQtyPackages] = useState("");
  const [qtyUnits, setQtyUnits] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [markup, setMarkup] = useState("0");
  const [supplierId, setSupplierId] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const { data: drugFormulary = [] } = useQuery({
    queryKey: ["drug-formulary-active", user?.hospitalId],
    enabled: !!user?.hospitalId && warehouseTypeCode === "central_pharmacy",
    queryFn: async () => {
      const { data } = await supabase
        .from("drug_formulary")
        .select("id, trade_name, inn, release_form_id, packaging_id, manufacturer_id")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("trade_name");
      return data || [];
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["incoming-recent", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_batches")
        .select(
          "id, received_at, series_number, expiry_date, quantity_packages, quantity_units, purchase_price, selling_price, products(name), suppliers(name)"
        )
        .eq("warehouse_id", warehouse!.id)
        .order("received_at", { ascending: false })
        .limit(20);
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
      if (!warehouse || !user) throw new Error("Warehouse not configured");
      if (!productId) throw new Error("Pick a product");

      let resolvedProductId = productId;
      if (warehouseTypeCode === "central_pharmacy") {
        const selectedDrug = drugFormulary.find((d: any) => d.id === productId);
        if (selectedDrug) {
          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("hospital_id", user!.hospitalId)
            .eq("name", selectedDrug.trade_name)
            .maybeSingle();
          if (existingProduct) {
            resolvedProductId = existingProduct.id;
          } else {
            const { data: medType } = await supabase
              .from("product_types")
              .select("id")
              .eq("code", "medications")
              .maybeSingle();
            const { data: newProduct, error: prodErr } = await supabase
              .from("products")
              .insert({
                hospital_id: user!.hospitalId,
                name: selectedDrug.trade_name,
                inn: selectedDrug.inn ?? null,
                product_type_id: medType!.id,
                manufacturer_id: selectedDrug.manufacturer_id ?? null,
                release_form_id: selectedDrug.release_form_id ?? null,
                packaging_type_id: selectedDrug.packaging_id ?? null,
              })
              .select("id")
              .single();
            if (prodErr) throw prodErr;
            resolvedProductId = newProduct!.id;
          }
        }
      }

      const { data: batch, error } = await supabase
        .from("inventory_batches")
        .insert({
          hospital_id: user.hospitalId,
          warehouse_id: warehouse.id,
          product_id: resolvedProductId,
          supplier_id: supplierId || null,
          series_number: series || null,
          expiry_date: expiry || null,
          quantity_packages: parseFloat(qtyPackages) || 0,
          quantity_units: parseFloat(qtyUnits) || 0,
          purchase_price: parseFloat(purchasePrice) || 0,
          markup_percent: parseFloat(markup) || 0,
          received_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: txErr } = await supabase.from("inventory_transactions").insert({
        hospital_id: user.hospitalId,
        warehouse_id: warehouse.id,
        inventory_batch_id: batch!.id,
        product_id: resolvedProductId,
        source_type: "incoming",
        quantity_packages: parseFloat(qtyPackages) || 0,
        quantity_units: parseFloat(qtyUnits) || 0,
        performed_by: user.id,
      });
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      toast.success("Stock received");
      setProductId("");
      setSeries("");
      setExpiry("");
      setQtyPackages("");
      setQtyUnits("");
      setPurchasePrice("");
      setMarkup("0");
      setSupplierId("");
      qc.invalidateQueries({ queryKey: ["incoming-recent", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (whLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!warehouse)
    return (
      <p className="text-sm text-destructive">
        No {warehouseTypeCode === "central_pharmacy" ? "Central Pharmacy" : "General Warehouse"} configured for this hospital.
      </p>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">Receiving to: {warehouse.name}</p>
      </div>

      <form
        className="rounded-lg border bg-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Series #</Label>
          <Input value={series} onChange={(e) => setSeries(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Expiry date</Label>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Qty packages</Label>
          <Input
            type="number"
            step="0.01"
            value={qtyPackages}
            onChange={(e) => setQtyPackages(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Qty units</Label>
          <Input
            type="number"
            step="0.01"
            value={qtyUnits}
            onChange={(e) => setQtyUnits(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Purchase price</Label>
          <Input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Markup %</Label>
          <Input
            type="number"
            step="0.01"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Selling price</Label>
          <Input value={sellingPrice} readOnly className="bg-muted" />
        </div>
        <div className="space-y-1.5">
          <Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
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
            {mutation.isPending ? "Receiving…" : "Receive Stock"}
          </Button>
        </div>
      </form>

      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-foreground">Recent receipts</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Product</th>
                <th className="p-3">Series</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Pkgs</th>
                <th className="p-3">Units</th>
                <th className="p-3">Purchase</th>
                <th className="p-3">Selling</th>
                <th className="p-3">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.received_at ? format(new Date(r.received_at), "yyyy-MM-dd") : "—"}</td>
                  <td className="p-3">{r.products?.name}</td>
                  <td className="p-3">{r.series_number || "—"}</td>
                  <td className="p-3">{r.expiry_date || "—"}</td>
                  <td className="p-3">{r.quantity_packages}</td>
                  <td className="p-3">{r.quantity_units}</td>
                  <td className="p-3">{r.purchase_price ?? "—"}</td>
                  <td className="p-3">{r.selling_price ?? "—"}</td>
                  <td className="p-3">{r.suppliers?.name || "—"}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No receipts yet.
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
