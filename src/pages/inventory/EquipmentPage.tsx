import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Pencil, Plus, Power } from "lucide-react";
import { addDays, parseISO, format } from "date-fns";

interface EquipmentForm {
  id?: string;
  name: string;
  model?: string | null;
  serial_number?: string | null;
  department_id?: string | null;
  manufacturer_id?: string | null;
  purchase_date?: string | null;
  purchase_price?: string | null;
  warranty_expiry_date?: string | null;
  next_service_date?: string | null;
  service_interval_days?: string | null;
  notes?: string | null;
}

interface ServiceForm {
  serviced_at: string;
  serviced_by: string;
  notes: string;
  cost: string;
  next_service_date: string;
}

export default function EquipmentPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EquipmentForm>({ name: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [svcOpen, setSvcOpen] = useState<string | null>(null);
  const [svcForm, setSvcForm] = useState<ServiceForm>({
    serviced_at: "",
    serviced_by: "",
    notes: "",
    cost: "",
    next_service_date: "",
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment")
        .select(
          "id, name, model, serial_number, purchase_date, purchase_price, warranty_expiry_date, next_service_date, service_interval_days, notes, is_active, department_id, manufacturer_id, departments(name), manufacturers(name)"
        )
        .eq("hospital_id", user!.hospitalId)
        .order("next_service_date", { ascending: true, nullsFirst: false });
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("manufacturers")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        name: form.name,
        model: form.model || null,
        serial_number: form.serial_number || null,
        department_id: form.department_id || null,
        manufacturer_id: form.manufacturer_id || null,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        warranty_expiry_date: form.warranty_expiry_date || null,
        next_service_date: form.next_service_date || null,
        service_interval_days: form.service_interval_days
          ? parseInt(form.service_interval_days)
          : null,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("equipment").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("equipment")
          .insert({ ...payload, hospital_id: user.hospitalId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm({ name: "" });
      qc.invalidateQueries({ queryKey: ["equipment", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("equipment")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deactivated");
      qc.invalidateQueries({ queryKey: ["equipment", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date();

  const openEdit = (e: any) => {
    setForm({
      id: e.id,
      name: e.name,
      model: e.model,
      serial_number: e.serial_number,
      department_id: e.department_id,
      manufacturer_id: e.manufacturer_id,
      purchase_date: e.purchase_date,
      purchase_price: e.purchase_price?.toString() || "",
      warranty_expiry_date: e.warranty_expiry_date,
      next_service_date: e.next_service_date,
      service_interval_days: e.service_interval_days?.toString() || "",
      notes: e.notes,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">Equipment</h2>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name: "" }); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "" })}>
              <Plus className="mr-1 h-4 w-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Add"} Equipment</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model || ""} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Serial #</Label>
                <Input value={form.serial_number || ""} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department_id || ""} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Manufacturer</Label>
                <Select value={form.manufacturer_id || ""} onValueChange={(v) => setForm({ ...form, manufacturer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Purchase date</Label>
                <Input type="date" value={form.purchase_date || ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase price</Label>
                <Input type="number" step="0.01" value={form.purchase_price || ""} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Warranty expiry</Label>
                <Input type="date" value={form.warranty_expiry_date || ""} onChange={(e) => setForm({ ...form, warranty_expiry_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Next service date</Label>
                <Input type="date" value={form.next_service_date || ""} onChange={(e) => setForm({ ...form, next_service_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Service interval (days)</Label>
                <Input type="number" value={form.service_interval_days || ""} onChange={(e) => setForm({ ...form, service_interval_days: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 w-8"></th>
              <th className="p-3">Name</th>
              <th className="p-3">Model</th>
              <th className="p-3">Serial #</th>
              <th className="p-3">Department</th>
              <th className="p-3">Manufacturer</th>
              <th className="p-3">Purchase Date</th>
              <th className="p-3">Next Service</th>
              <th className="p-3">Status</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e: any) => {
              const due = e.next_service_date && parseISO(e.next_service_date) <= addDays(today, 30);
              const isOpen = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={cn("border-t", due && "bg-orange-500/15", !e.is_active && "opacity-50")}>
                    <td className="p-3">
                      <Button size="icon" variant="ghost" onClick={() => setExpanded(isOpen ? null : e.id)}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </td>
                    <td className="p-3">{e.name}</td>
                    <td className="p-3">{e.model || "—"}</td>
                    <td className="p-3">{e.serial_number || "—"}</td>
                    <td className="p-3">{e.departments?.name || "—"}</td>
                    <td className="p-3">{e.manufacturers?.name || "—"}</td>
                    <td className="p-3">{e.purchase_date || "—"}</td>
                    <td className="p-3">{e.next_service_date || "—"}</td>
                    <td className="p-3">{e.is_active ? "Active" : "Inactive"}</td>
                    <td className="p-3 flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(e)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {e.is_active && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deactivateMutation.mutate(e.id)}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t bg-muted/20">
                      <td colSpan={10} className="p-4">
                        <ServiceHistory
                          equipmentId={e.id}
                          onAddOpen={() => {
                            setSvcForm({
                              serviced_at: format(new Date(), "yyyy-MM-dd"),
                              serviced_by: "",
                              notes: "",
                              cost: "",
                              next_service_date: "",
                            });
                            setSvcOpen(e.id);
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {equipment.length === 0 && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No equipment.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!svcOpen} onOpenChange={(o) => !o && setSvcOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service Record</DialogTitle>
          </DialogHeader>
          <ServiceForm
            value={svcForm}
            onChange={setSvcForm}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSvcOpen(null)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!user || !svcOpen) return;
                const { error } = await supabase.from("equipment_service_records").insert({
                  hospital_id: user.hospitalId,
                  equipment_id: svcOpen,
                  serviced_at: svcForm.serviced_at,
                  serviced_by: svcForm.serviced_by || null,
                  notes: svcForm.notes || null,
                  cost: svcForm.cost ? parseFloat(svcForm.cost) : null,
                  next_service_date: svcForm.next_service_date || null,
                  created_by: user.id,
                });
                if (error) { toast.error(error.message); return; }
                toast.success("Service record added");
                setSvcOpen(null);
                qc.invalidateQueries({ queryKey: ["equipment", user.hospitalId] });
                qc.invalidateQueries({ queryKey: ["equipment-service", svcOpen] });
              }}
              disabled={!svcForm.serviced_at}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceHistory({ equipmentId, onAddOpen }: { equipmentId: string; onAddOpen: () => void }) {
  const { user } = useAuth();
  const { data: records = [] } = useQuery({
    queryKey: ["equipment-service", equipmentId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment_service_records")
        .select("id, serviced_at, serviced_by, notes, cost, next_service_date")
        .eq("equipment_id", equipmentId)
        .order("serviced_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Service History</h4>
        <Button size="sm" variant="outline" onClick={onAddOpen}>
          <Plus className="mr-1 h-3 w-3" /> Add Service Record
        </Button>
      </div>
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">No records.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Date</th>
              <th className="py-1">By</th>
              <th className="py-1">Notes</th>
              <th className="py-1">Cost</th>
              <th className="py-1">Next service</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.serviced_at}</td>
                <td className="py-1">{r.serviced_by || "—"}</td>
                <td className="py-1">{r.notes || "—"}</td>
                <td className="py-1">{r.cost ?? "—"}</td>
                <td className="py-1">{r.next_service_date || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ServiceForm({ value, onChange }: { value: ServiceForm; onChange: (v: ServiceForm) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Serviced at</Label>
        <Input type="date" value={value.serviced_at} onChange={(e) => onChange({ ...value, serviced_at: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Serviced by</Label>
        <Input value={value.serviced_by} onChange={(e) => onChange({ ...value, serviced_by: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Cost</Label>
        <Input type="number" step="0.01" value={value.cost} onChange={(e) => onChange({ ...value, cost: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Next service date</Label>
        <Input type="date" value={value.next_service_date} onChange={(e) => onChange({ ...value, next_service_date: e.target.value })} />
      </div>
    </div>
  );
}
