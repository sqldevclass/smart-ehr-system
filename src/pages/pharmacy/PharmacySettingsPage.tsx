import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

export default function PharmacySettingsPage() {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">Settings</h2>
      <Tabs defaultValue="suppliers">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="suppliers">Поставщики</TabsTrigger>
          <TabsTrigger value="manufacturers">Производители</TabsTrigger>
          <TabsTrigger value="units">Единицы измерения</TabsTrigger>
          <TabsTrigger value="release_forms">Форма выпуска</TabsTrigger>
          <TabsTrigger value="packaging">Упаковка</TabsTrigger>
          <TabsTrigger value="product_types">Вид товара</TabsTrigger>
          
          <TabsTrigger value="formulary">Лекарственный формуляр</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><SuppliersSection /></TabsContent>
        <TabsContent value="manufacturers"><ManufacturersSection /></TabsContent>
        <TabsContent value="units">
          <LookupSection
            table="units_of_measurement"
            label="Единица измерения"
            hasAbbr
            hasHospitalId={false}
          />
        </TabsContent>
        <TabsContent value="release_forms">
          <LookupSection table="release_forms" label="Форма выпуска" hasHospitalId />
        </TabsContent>
        <TabsContent value="packaging">
          <LookupSection table="packaging_types" label="Упаковка" showCode hasHospitalId />
        </TabsContent>
        <TabsContent value="product_types">
          <LookupSection table="product_types" label="Вид товара" hasHospitalId />
        </TabsContent>
        
        <TabsContent value="formulary"><FormularySection /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────── Suppliers ───────────────────── */
interface Supplier {
  id?: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

function SuppliersSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Supplier>({ name: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, contact, phone, email, address, is_active")
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
        contact: form.contact || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
      };
      if (form.id) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("suppliers")
          .insert({ hospital_id: user.hospitalId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm({ name: "" });
      qc.invalidateQueries({ queryKey: ["suppliers", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name: "" }); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "" })}>Add Supplier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Add"} Supplier</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Contact</Label><Input value={form.contact || ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th><th className="p-3">Contact</th><th className="p-3">Phone</th>
              <th className="p-3">Email</th><th className="p-3">Address</th><th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{s.name}</td><td className="p-3">{s.contact || "—"}</td>
                <td className="p-3">{s.phone || "—"}</td><td className="p-3">{s.email || "—"}</td>
                <td className="p-3">{s.address || "—"}</td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => { setForm(s); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No suppliers.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────── Manufacturers ───────────────────── */
function ManufacturersSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; country?: string | null }>({ name: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["manufacturers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("manufacturers")
        .select("id, name, country, is_active")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (form.id) {
        const { error } = await supabase
          .from("manufacturers")
          .update({ name: form.name, country: form.country || null })
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manufacturers").insert({
          hospital_id: user.hospitalId,
          name: form.name,
          country: form.country || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm({ name: "" });
      qc.invalidateQueries({ queryKey: ["manufacturers", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name: "" }); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "" })}>Add Manufacturer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Add"} Manufacturer</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Country</Label><Input value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name.trim()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th><th className="p-3">Country</th><th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m: any) => (
              <tr key={m.id} className="border-t">
                <td className="p-3">{m.name}</td>
                <td className="p-3">{m.country || "—"}</td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => { setForm(m); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No manufacturers.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────── Lookup (units / release_forms / packaging / product_types) ───────────────────── */
function LookupSection({
  table,
  label,
  hasAbbr,
  showCode,
  hasHospitalId = true,
}: {
  table: "units_of_measurement" | "release_forms" | "packaging_types" | "product_types";
  label: string;
  hasAbbr?: boolean;
  showCode?: boolean;
  hasHospitalId?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    id?: string;
    name_ru: string;
    abbreviation?: string | null;
    hospital_id?: string | null;
  }>({ name_ru: "", abbreviation: "" });

  const queryKey = [table, user?.hospitalId];
  const baseCols = ["id", "name_ru", "sort_order"];
  if (hasAbbr) baseCols.push("abbreviation");
  if (showCode) baseCols.push("code");
  if (hasHospitalId) baseCols.push("hospital_id");
  const selectCols = baseCols.join(", ");

  const { data: items = [] } = useQuery({
    queryKey,
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      let q = supabase
        .from(table)
        .select(selectCols)
        .order("sort_order")
        .order("name_ru");
      if (hasHospitalId) {
        q = q.or(`hospital_id.is.null,hospital_id.eq.${user!.hospitalId}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const payload: any = { name_ru: form.name_ru };
      if (hasAbbr) payload.abbreviation = form.abbreviation || null;
      if (form.id) {
        const { error } = await supabase.from(table).update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const code = user.hospitalId.slice(0, 8) + "_" + Date.now();
        const insertPayload: any = {
          ...payload,
          code,
          name_en: form.name_ru,
        };
        if (hasHospitalId) insertPayload.hospital_id = user.hospitalId;
        const { error } = await supabase.from(table).insert(insertPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm({ name_ru: "", abbreviation: "" });
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const colCount = 3 + (hasAbbr ? 1 : 0) + (showCode ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name_ru: "", abbreviation: "" }); }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name_ru: "", abbreviation: "" })}>Add {label}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Add"} {label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input value={form.name_ru} onChange={(e) => setForm({ ...form, name_ru: e.target.value })} />
              </div>
              {hasAbbr && (
                <div className="space-y-1.5">
                  <Label>Сокращенно</Label>
                  <Input
                    value={form.abbreviation || ""}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name_ru.trim()}>
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
              <th className="p-3">Название</th>
              {hasAbbr && <th className="p-3">Сокращенно</th>}
              {showCode && <th className="p-3">Код</th>}
              <th className="p-3">Source</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r: any) => {
              const isPlatform = !hasHospitalId || r.hospital_id == null;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.name_ru}</td>
                  {hasAbbr && <td className="p-3">{r.abbreviation || "—"}</td>}
                  {showCode && <td className="p-3">{r.code || "—"}</td>}
                  <td className="p-3">
                    {isPlatform ? <Badge variant="secondary">Platform</Badge> : <Badge>Hospital</Badge>}
                  </td>
                  <td className="p-3">
                    {!isPlatform && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setForm({
                              id: r.id,
                              name_ru: r.name_ru,
                              abbreviation: r.abbreviation ?? "",
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this row?")) deleteMutation.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-6 text-center text-muted-foreground">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



/* ───────────────────── Drug Formulary ───────────────────── */
interface DrugForm {
  id?: string;
  trade_name: string;
  inn: string;
  packaging_id: string | null;
  release_form_id: string | null;
  manufacturer_id: string | null;
  dose: string;
  unit_id: string | null;
  min_write_off_qty: string;
  min_quantity: string;
  shelf_life_days: string;
  expiry_notify_days: string;
  notify_below_min_qty: string;
  is_active: boolean;
}

const emptyDrug: DrugForm = {
  trade_name: "",
  inn: "",
  packaging_id: null,
  release_form_id: null,
  manufacturer_id: null,
  dose: "",
  unit_id: null,
  min_write_off_qty: "",
  min_quantity: "",
  shelf_life_days: "",
  expiry_notify_days: "30",
  notify_below_min_qty: "",
  is_active: true,
};

function FormularySection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DrugForm>(emptyDrug);

  const { data: drugs = [] } = useQuery({
    queryKey: ["drug_formulary", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("drug_formulary")
        .select(
          "id, trade_name, inn, dose, unit_id, is_active, packaging_id, release_form_id, manufacturer_id, min_write_off_qty, min_quantity, shelf_life_days, expiry_notify_days, notify_below_min_qty, release_forms(name_ru), manufacturers(name), units_of_measurement(id, name_ru)"
        )
        .eq("hospital_id", user!.hospitalId)
        .order("trade_name");
      return data || [];
    },
  });

  const { data: packagings = [] } = useQuery({
    queryKey: ["packaging_types-pick", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("packaging_types")
        .select("id, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user!.hospitalId}`)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: releaseForms = [] } = useQuery({
    queryKey: ["release_forms-pick", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("release_forms")
        .select("id, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user!.hospitalId}`)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers-pick", user?.hospitalId],
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

  const { data: units = [] } = useQuery({
    queryKey: ["units_of_measurement", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("units_of_measurement")
        .select("id, name_ru, abbreviation")
        .or(`hospital_id.is.null,hospital_id.eq.${user!.hospitalId}`)
        .order("sort_order")
        .order("name_ru");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      const intOrNull = (v: string) => (v.trim() === "" ? null : parseInt(v, 10));
      const payload: any = {
        trade_name: form.trade_name,
        inn: form.inn,
        packaging_id: form.packaging_id,
        release_form_id: form.release_form_id,
        manufacturer_id: form.manufacturer_id,
        dose: form.dose || null,
        unit_id: form.unit_id || null,
        min_write_off_qty: numOrNull(form.min_write_off_qty),
        min_quantity: numOrNull(form.min_quantity),
        shelf_life_days: intOrNull(form.shelf_life_days),
        expiry_notify_days: intOrNull(form.expiry_notify_days) ?? 30,
        notify_below_min_qty: numOrNull(form.notify_below_min_qty),
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from("drug_formulary").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("drug_formulary")
          .insert({ ...payload, hospital_id: user.hospitalId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm(emptyDrug);
      qc.invalidateQueries({ queryKey: ["drug_formulary", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (d: any) => {
    setForm({
      id: d.id,
      trade_name: d.trade_name,
      inn: d.inn,
      packaging_id: d.packaging_id,
      release_form_id: d.release_form_id,
      manufacturer_id: d.manufacturer_id,
      dose: d.dose || "",
      unit_id: d.unit_id ?? null,
      min_write_off_qty: d.min_write_off_qty?.toString() ?? "",
      min_quantity: d.min_quantity?.toString() ?? "",
      shelf_life_days: d.shelf_life_days?.toString() ?? "",
      expiry_notify_days: d.expiry_notify_days?.toString() ?? "30",
      notify_below_min_qty: d.notify_below_min_qty?.toString() ?? "",
      is_active: d.is_active,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setForm(emptyDrug); setOpen(true); }}>Add Drug</Button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Торговое название</th><th className="p-3">МНН</th>
              <th className="p-3">Форма выпуска</th><th className="p-3">Производитель</th>
              <th className="p-3">Доза</th><th className="p-3">Активен</th><th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {drugs.map((d: any) => (
              <tr key={d.id} className="border-t">
                <td className="p-3">{d.trade_name}</td>
                <td className="p-3">{d.inn}</td>
                <td className="p-3">{d.release_forms?.name_ru || "—"}</td>
                <td className="p-3">{d.manufacturers?.name || "—"}</td>
                <td className="p-3">{d.dose || "—"}</td>
                <td className="p-3">
                  <Badge variant={d.is_active ? "default" : "secondary"}>
                    {d.is_active ? "Активен" : "Неактивен"}
                  </Badge>
                </td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {drugs.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No drugs.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-2xl w-full">
          <SheetHeader>
            <SheetTitle>{form.id ? "Edit Drug" : "Add Drug"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Торговое название *</Label>
                <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>МНН *</Label>
                <Input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Упаковка</Label>
                <Select
                  value={form.packaging_id || "none"}
                  onValueChange={(v) => setForm({ ...form, packaging_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {packagings.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name_ru}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Форма выпуска</Label>
                <Select
                  value={form.release_form_id || "none"}
                  onValueChange={(v) => setForm({ ...form, release_form_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {releaseForms.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name_ru}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Производитель</Label>
                <Select
                  value={form.manufacturer_id || "none"}
                  onValueChange={(v) => setForm({ ...form, manufacturer_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {manufacturers.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Доза</Label>
                <Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Единица измерения</Label>
                <Select
                  value={form.unit_id ?? "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, unit_id: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {units.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name_ru}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Минимальное списание</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" step="0.001"
                    value={form.min_write_off_qty}
                    onChange={(e) =>
                      setForm({ ...form, min_write_off_qty: e.target.value })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground min-w-[60px]">
                    {units.find((u: any) => u.id === form.unit_id)?.name_ru ?? ""}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Минимальное количество</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" step="0.001"
                    value={form.min_quantity}
                    onChange={(e) =>
                      setForm({ ...form, min_quantity: e.target.value })
                    }
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground min-w-[60px]">
                    {releaseForms.find((r: any) => r.id === form.release_form_id)?.name_ru ?? ""}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Уведомить о сроке за (дней)</Label>
                <Input
                  type="number"
                  value={form.expiry_notify_days}
                  onChange={(e) => setForm({ ...form, expiry_notify_days: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Уведомить за минимальное количество</Label>
                <Input
                  type="number" step="0.001"
                  value={form.notify_below_min_qty}
                  onChange={(e) => setForm({ ...form, notify_below_min_qty: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="drug-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="drug-active" className="cursor-pointer">Активен</Label>
            </div>

            {form.id && <InteractionsBlock drugId={form.id} />}
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.trade_name.trim() || !form.inn.trim()}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ───────────────────── Drug Interactions sub-block ───────────────────── */
function InteractionsBlock({ drugId }: { drugId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string>("");
  const [eff, setEff] = useState("");
  const [sig, setSig] = useState("");
  const [act, setAct] = useState("");

  const { data: interactions = [] } = useQuery({
    queryKey: ["drug_interactions", drugId],
    queryFn: async () => {
      const { data } = await supabase
        .from("drug_interactions")
        .select(
          "id, drug_a_id, drug_b_id, clinical_effect, clinical_significance, actions_recommendations, drug_a:drug_formulary!drug_interactions_drug_a_id_fkey(id, trade_name), drug_b:drug_formulary!drug_interactions_drug_b_id_fkey(id, trade_name)"
        )
        .or(`drug_a_id.eq.${drugId},drug_b_id.eq.${drugId}`);
      return data || [];
    },
  });

  const { data: drugOptions = [] } = useQuery({
    queryKey: ["drug_formulary-pick", user?.hospitalId, drugId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("drug_formulary")
        .select("id, trade_name")
        .eq("hospital_id", user!.hospitalId)
        .neq("id", drugId)
        .order("trade_name");
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!picked) throw new Error("Pick a drug");
      const a = drugId < picked ? drugId : picked;
      const b = drugId < picked ? picked : drugId;
      const { error } = await supabase.from("drug_interactions").insert({
        hospital_id: user.hospitalId,
        drug_a_id: a,
        drug_b_id: b,
        clinical_effect: eff || null,
        clinical_significance: sig || null,
        actions_recommendations: act || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added");
      setAdding(false);
      setPicked(""); setEff(""); setSig(""); setAct("");
      qc.invalidateQueries({ queryKey: ["drug_interactions", drugId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drug_interactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["drug_interactions", drugId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 pt-4 border-t">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Взаимодействия с другими препаратами</h3>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Добавить взаимодействие
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Препарат</th>
              <th className="p-2">Клинический эффект</th>
              <th className="p-2">Значимость</th>
              <th className="p-2">Действия</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {interactions.map((i: any) => {
              const other = i.drug_a_id === drugId ? i.drug_b : i.drug_a;
              return (
                <tr key={i.id} className="border-t">
                  <td className="p-2">{other?.trade_name || "—"}</td>
                  <td className="p-2">{i.clinical_effect || "—"}</td>
                  <td className="p-2">{i.clinical_significance || "—"}</td>
                  <td className="p-2">{i.actions_recommendations || "—"}</td>
                  <td className="p-2">
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(i.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {interactions.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-center text-muted-foreground">
                  Нет взаимодействий.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <div className="space-y-1.5">
            <Label>Препарат</Label>
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger><SelectValue placeholder="Выбрать препарат" /></SelectTrigger>
              <SelectContent>
                {drugOptions.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.trade_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Клинический эффект</Label>
            <Input value={eff} onChange={(e) => setEff(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Клиническая значимость</Label>
            <Input value={sig} onChange={(e) => setSig(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Действия/рекомендации</Label>
            <Input value={act} onChange={(e) => setAct(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!picked || addMutation.isPending}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
