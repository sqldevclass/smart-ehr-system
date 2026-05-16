import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWarehouse } from "./useMyWarehouse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { format } from "date-fns";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

interface ItemRow {
  productId: string;
  quantityPackages: string;
  quantityUnits: string;
}

export default function ExpensesView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse } = useMyWarehouse(warehouseTypeCode);

  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([
    { productId: "", quantityPackages: "", quantityUnits: "" },
  ]);

  const { data: types = [] } = useQuery({
    queryKey: ["write-off-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("write_off_types")
        .select("id, code, name_ru, name_en")
        .order("code");
      return data || [];
    },
  });

  const selectedType = types.find((t: any) => t.id === typeId) as any;

  const { data: employees = [] } = useQuery({
    queryKey: ["profiles", user?.hospitalId],
    enabled: !!user?.hospitalId && selectedType?.code === "employee",
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("hospital_id", user!.hospitalId)
        .order("full_name");
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId && selectedType?.code === "return_supplier",
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["writeoffs", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("write_off_records")
        .select(
          "id, written_off_at, notes, write_off_types(name_en, code), profiles!write_off_records_written_off_by_fkey(full_name), write_off_record_items(id)"
        )
        .eq("warehouse_id", warehouse!.id)
        .order("written_off_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const reset = () => {
    setTypeId("");
    setEmployeeId("");
    setSupplierId("");
    setNotes("");
    setItems([{ productId: "", quantityPackages: "", quantityUnits: "" }]);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!warehouse || !user) throw new Error("Warehouse missing");
      if (!typeId) throw new Error("Select write-off type");
      const cleanItems = items
        .filter((i) => i.productId && parseFloat(i.quantityPackages) > 0)
        .map((i) => ({
          product_id: i.productId,
          quantity_packages: parseFloat(i.quantityPackages),
          quantity_units: parseFloat(i.quantityUnits) || 0,
        }));
      if (cleanItems.length === 0) throw new Error("Add at least one item");

      const { error } = await supabase.rpc("perform_writeoff", {
        p_hospital_id: user.hospitalId,
        p_warehouse_id: warehouse.id,
        p_write_off_type_id: typeId,
        p_employee_id: employeeId || null,
        p_supplier_id: supplierId || null,
        p_notes: notes || null,
        p_written_off_by: user.id,
        p_items: cleanItems,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Write-off recorded");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["writeoffs", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button disabled={!warehouse}>New Write-off</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Write-off</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name_en || t.name_ru || t.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType?.code === "employee" && (
                <div className="space-y-1.5">
                  <Label>Employee</Label>
                  <Select value={employeeId} onValueChange={setEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e: any) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedType?.code === "return_supplier" && (
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
              )}

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setItems([...items, { productId: "", quantityPackages: "", quantityUnits: "" }])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add row
                  </Button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_100px_100px_40px] gap-2 items-end">
                    <Select
                      value={item.productId}
                      onValueChange={(v) => {
                        const next = [...items];
                        next[idx].productId = v;
                        setItems(next);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Pkgs"
                      value={item.quantityPackages}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantityPackages = e.target.value;
                        setItems(next);
                      }}
                    />
                    <Input
                      type="number"
                      placeholder="Units"
                      value={item.quantityUnits}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx].quantityUnits = e.target.value;
                        setItems(next);
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Date</th>
              <th className="p-3">Type</th>
              <th className="p-3">Written off by</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Items</th>
            </tr>
          </thead>
          <tbody>
            {history.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">
                  {r.written_off_at ? format(new Date(r.written_off_at), "yyyy-MM-dd HH:mm") : "—"}
                </td>
                <td className="p-3">{r.write_off_types?.name_en || r.write_off_types?.code}</td>
                <td className="p-3">{r.profiles?.full_name || "—"}</td>
                <td className="p-3">{r.notes || "—"}</td>
                <td className="p-3">{r.write_off_record_items?.length ?? 0}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No write-offs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
