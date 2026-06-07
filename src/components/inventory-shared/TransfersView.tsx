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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { format } from "date-fns";

interface Props {
  warehouseTypeCode: "central_pharmacy" | "general";
  title: string;
}

interface LineItem {
  batchId: string;
  productId: string | null;
  drugFormularyId: string | null;
  quantityUnits: string;
}

export default function TransfersView({ warehouseTypeCode, title }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: warehouse } = useMyWarehouse(warehouseTypeCode);

  const [open, setOpen] = useState(false);
  const [destId, setDestId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { batchId: "", productId: null, drugFormularyId: null, quantityUnits: "" },
  ]);

  // Destinations: department warehouses (department_id IS NOT NULL) or all other warehouses
  const { data: destinations = [] } = useQuery({
    queryKey: ["transfer-destinations", user?.hospitalId, warehouse?.id],
    enabled: !!user?.hospitalId && !!warehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name, warehouse_types(code)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .neq("id", warehouse!.id)
        .order("name");
      return data || [];
    },
  });

  const { data: myBatches = [] } = useQuery({
    queryKey: ["my-batches", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_batches")
        .select("id, product_id, drug_formulary_id, series_number, expiry_date, quantity_units, products(name), drug_formulary(trade_name)")
        .eq("warehouse_id", warehouse!.id)
        .gt("quantity_units", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      return data || [];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers", warehouse?.id],
    enabled: !!warehouse?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("transfer_records")
        .select(
          `id, status, sent_at, accepted_at, notes,
           from_warehouse_id, to_warehouse_id,
           from_warehouse:warehouses!transfer_records_from_warehouse_id_fkey(name),
           to_warehouse:warehouses!transfer_records_to_warehouse_id_fkey(name),
           sent_by_profile:profiles!transfer_records_sent_by_fkey(full_name),
           accepted_by_profile:profiles!transfer_records_accepted_by_fkey(full_name),
           transfer_record_items(id)`
        )
        .or(`from_warehouse_id.eq.${warehouse!.id},to_warehouse_id.eq.${warehouse!.id}`)
        .order("sent_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const incomingPending = transfers.filter(
    (t: any) => t.to_warehouse_id === warehouse?.id && t.status === "pending_acceptance"
  );

  const reset = () => {
    setDestId("");
    setNotes("");
    setItems([{ batchId: "", productId: null, drugFormularyId: null, quantityUnits: "" }]);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!warehouse || !user) throw new Error("Warehouse missing");
      if (!destId) throw new Error("Pick destination");
      const cleanItems = items.filter(
        (i) => i.batchId && parseFloat(i.quantityUnits) > 0
      );
      if (cleanItems.length === 0) throw new Error("Add at least one item");

      const { data: record, error } = await supabase
        .from("transfer_records")
        .insert({
          hospital_id: user.hospitalId,
          from_warehouse_id: warehouse.id,
          to_warehouse_id: destId,
          notes: notes || null,
          sent_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const itemsToInsert = cleanItems.map((i) => ({
        transfer_record_id: record!.id,
        hospital_id: user.hospitalId,
        inventory_batch_id: i.batchId,
        product_id: i.productId || null,
        drug_formulary_id: i.drugFormularyId || null,
        quantity_packages: 0,
        quantity_units: parseFloat(i.quantityUnits),
      }));
      const { error: itemsErr } = await supabase
        .from("transfer_record_items")
        .insert(itemsToInsert);
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => {
      toast.success("Transfer sent");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["transfers", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await supabase.rpc("accept_transfer", {
        p_transfer_record_id: transferId,
        p_hospital_id: user!.hospitalId,
        p_accepted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer accepted");
      qc.invalidateQueries({ queryKey: ["transfers", warehouse?.id] });
      qc.invalidateQueries({ queryKey: ["stock", warehouse?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>

      <Tabs defaultValue="outgoing">
        <TabsList>
          <TabsTrigger value="outgoing">Outgoing</TabsTrigger>
          <TabsTrigger value="incoming">
            Incoming {incomingPending.length > 0 && `(${incomingPending.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outgoing" className="space-y-4">
          <div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild>
                <Button disabled={!warehouse}>New Transfer</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>New Transfer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Destination warehouse</Label>
                    <Select value={destId} onValueChange={setDestId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination" />
                      </SelectTrigger>
                      <SelectContent>
                        {destinations.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                          setItems([
                            ...items,
                            { batchId: "", productId: "", quantityPackages: "", quantityUnits: "" },
                          ])
                        }
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add row
                      </Button>
                    </div>
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_100px_100px_40px] gap-2 items-end"
                      >
                        <Select
                          value={item.batchId}
                          onValueChange={(v) => {
                            const batch = myBatches.find((b: any) => b.id === v) as any;
                            const next = [...items];
                            next[idx].batchId = v;
                            next[idx].productId = batch?.product_id || "";
                            setItems(next);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Batch" />
                          </SelectTrigger>
                          <SelectContent>
                            {myBatches.map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.products?.name} — {b.series_number || "—"} (
                                {b.quantity_packages} pkg)
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
                  <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                    {sendMutation.isPending ? "Sending…" : "Send Transfer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="incoming" className="space-y-4">
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">From</th>
                  <th className="p-3">Items</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {incomingPending.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-3">
                      {t.sent_at ? format(new Date(t.sent_at), "yyyy-MM-dd HH:mm") : "—"}
                    </td>
                    <td className="p-3">{t.from_warehouse?.name}</td>
                    <td className="p-3">{t.transfer_record_items?.length ?? 0}</td>
                    <td className="p-3">{t.notes || "—"}</td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        onClick={() => acceptMutation.mutate(t.id)}
                        disabled={acceptMutation.isPending}
                      >
                        Accept
                      </Button>
                    </td>
                  </tr>
                ))}
                {incomingPending.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No pending transfers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-foreground">All transfers</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Date</th>
              <th className="p-3">From</th>
              <th className="p-3">To</th>
              <th className="p-3">Status</th>
              <th className="p-3">Items</th>
              <th className="p-3">Sent by</th>
              <th className="p-3">Accepted by</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t: any) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">
                  {t.sent_at ? format(new Date(t.sent_at), "yyyy-MM-dd HH:mm") : "—"}
                </td>
                <td className="p-3">{t.from_warehouse?.name}</td>
                <td className="p-3">{t.to_warehouse?.name}</td>
                <td className="p-3">{t.status}</td>
                <td className="p-3">{t.transfer_record_items?.length ?? 0}</td>
                <td className="p-3">{t.sent_by_profile?.full_name || "—"}</td>
                <td className="p-3">{t.accepted_by_profile?.full_name || "—"}</td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No transfers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
