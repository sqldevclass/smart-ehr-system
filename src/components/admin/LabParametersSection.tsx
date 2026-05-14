import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function LabParametersSection({ serviceId }: { serviceId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ["lab-parameter-templates", serviceId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_parameter_templates")
        .select("*")
        .eq("service_id", serviceId)
        .eq("hospital_id", user!.hospitalId)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!serviceId,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    unit: "",
    ref_min_male: "",
    ref_max_male: "",
    ref_min_female: "",
    ref_max_female: "",
    ref_min_child: "",
    ref_max_child: "",
    critical_min: "",
    critical_max: "",
    sort_order: "0",
  });

  const reset = () => setForm({
    name: "", unit: "",
    ref_min_male: "", ref_max_male: "",
    ref_min_female: "", ref_max_female: "",
    ref_min_child: "", ref_max_child: "",
    critical_min: "", critical_max: "",
    sort_order: "0",
  });

  const openCreate = () => { setEditing(null); reset(); setOpen(true); };
  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name || "",
      unit: t.unit || "",
      ref_min_male: t.ref_min_male?.toString() ?? "",
      ref_max_male: t.ref_max_male?.toString() ?? "",
      ref_min_female: t.ref_min_female?.toString() ?? "",
      ref_max_female: t.ref_max_female?.toString() ?? "",
      ref_min_child: t.ref_min_child?.toString() ?? "",
      ref_max_child: t.ref_max_child?.toString() ?? "",
      critical_min: t.critical_min?.toString() ?? "",
      critical_max: t.critical_max?.toString() ?? "",
      sort_order: (t.sort_order ?? 0).toString(),
    });
    setOpen(true);
  };

  const num = (v: string) => v.trim() === "" ? null : Number(v);

  const save = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Parameter name required."); return; }
    const payload = {
      name: form.name.trim(),
      unit: form.unit.trim() || null,
      ref_min_male: num(form.ref_min_male),
      ref_max_male: num(form.ref_max_male),
      ref_min_female: num(form.ref_min_female),
      ref_max_female: num(form.ref_max_female),
      ref_min_child: num(form.ref_min_child),
      ref_max_child: num(form.ref_max_child),
      critical_min: num(form.critical_min),
      critical_max: num(form.critical_max),
      sort_order: Number(form.sort_order) || 0,
    };
    try {
      if (editing) {
        const { error } = await supabase.from("lab_parameter_templates").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Parameter updated.");
      } else {
        const { error } = await supabase.from("lab_parameter_templates").insert({
          ...payload,
          service_id: serviceId,
          hospital_id: user.hospitalId,
        });
        if (error) throw error;
        toast.success("Parameter added.");
      }
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["lab-parameter-templates", serviceId] });
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (t: any) => {
    try {
      const { error } = await supabase.from("lab_parameter_templates").delete().eq("id", t.id);
      if (error) throw error;
      toast.success("Parameter deleted.");
      qc.invalidateQueries({ queryKey: ["lab-parameter-templates", serviceId] });
    } catch (e: any) { toast.error(e.message); }
  };

  const range = (mn: any, mx: any) => (mn != null || mx != null) ? `${mn ?? "—"} – ${mx ?? "—"}` : "—";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-semibold">Lab Parameters</h3>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Parameter
        </Button>
      </div>
      <div className="overflow-x-auto">
        {templates.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No parameters defined.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Male</TableHead>
                <TableHead>Female</TableHead>
                <TableHead>Child</TableHead>
                <TableHead>Crit Min</TableHead>
                <TableHead>Crit Max</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.unit || "—"}</TableCell>
                  <TableCell className="text-xs">{range(t.ref_min_male, t.ref_max_male)}</TableCell>
                  <TableCell className="text-xs">{range(t.ref_min_female, t.ref_max_female)}</TableCell>
                  <TableCell className="text-xs">{range(t.ref_min_child, t.ref_max_child)}</TableCell>
                  <TableCell className="text-xs">{t.critical_min ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.critical_max ?? "—"}</TableCell>
                  <TableCell>{t.sort_order ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete parameter?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{t.name}" will be removed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(t)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Parameter" : "Add Parameter"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="g/dL" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Male Min</Label>
                <Input type="number" step="0.01" value={form.ref_min_male} onChange={(e) => setForm({ ...form, ref_min_male: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Male Max</Label>
                <Input type="number" step="0.01" value={form.ref_max_male} onChange={(e) => setForm({ ...form, ref_max_male: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Female Min</Label>
                <Input type="number" step="0.01" value={form.ref_min_female} onChange={(e) => setForm({ ...form, ref_min_female: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Female Max</Label>
                <Input type="number" step="0.01" value={form.ref_max_female} onChange={(e) => setForm({ ...form, ref_max_female: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Child Min</Label>
                <Input type="number" step="0.01" value={form.ref_min_child} onChange={(e) => setForm({ ...form, ref_min_child: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Child Max</Label>
                <Input type="number" step="0.01" value={form.ref_max_child} onChange={(e) => setForm({ ...form, ref_max_child: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Critical Min</Label>
                <Input type="number" step="0.01" value={form.critical_min} onChange={(e) => setForm({ ...form, critical_min: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Critical Max</Label>
                <Input type="number" step="0.01" value={form.critical_max} onChange={(e) => setForm({ ...form, critical_max: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
