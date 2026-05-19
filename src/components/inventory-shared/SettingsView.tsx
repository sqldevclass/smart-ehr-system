import { useState, useEffect } from "react";
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
import { Pencil } from "lucide-react";

interface Supplier {
  id?: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface Manufacturer {
  id?: string;
  name: string;
  country?: string | null;
}

export default function SettingsView({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="manufacturers">Manufacturers</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsSection />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersSection />
        </TabsContent>
        <TabsContent value="manufacturers">
          <ManufacturersSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface Product {
  id?: string;
  name: string;
  product_type_id: string;
  unit_id: string;
  release_form_id?: string | null;
  packaging_id?: string | null;
  manufacturer_id?: string | null;
  barcode?: string | null;
  is_active: boolean;
}

const emptyProduct: Product = {
  name: "",
  product_type_id: "",
  unit_id: "",
  release_form_id: null,
  packaging_id: null,
  manufacturer_id: null,
  barcode: "",
  is_active: true,
};

function ProductsSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Product>(emptyProduct);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: productTypes = [] } = useQuery({
    queryKey: ["product_types"],
    queryFn: async () => {
      const { data } = await supabase.from("product_types").select("id, name_ru").order("sort_order");
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
        .order("sort_order");
      return data || [];
    },
  });

  const { data: releaseForms = [] } = useQuery({
    queryKey: ["release_forms", user?.hospitalId],
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

  const { data: packagings = [] } = useQuery({
    queryKey: ["packaging_types", user?.hospitalId],
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

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers-list", user?.hospitalId],
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

  const { data: products = [] } = useQuery({
    queryKey: ["products", user?.hospitalId, debouncedSearch, typeFilter, activeOnly],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(
          "id, name, product_type_id, unit_id, release_form_id, packaging_id, manufacturer_id, barcode, is_active, product_types(name), units_of_measurement(name), release_forms(name), manufacturers(name)"
        )
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      if (debouncedSearch.trim()) q = q.ilike("name", `%${debouncedSearch.trim()}%`);
      if (typeFilter !== "all") q = q.eq("product_type_id", typeFilter);
      if (activeOnly) q = q.eq("is_active", true);
      const { data } = await q;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        name: form.name,
        product_type_id: form.product_type_id,
        unit_id: form.unit_id,
        release_form_id: form.release_form_id || null,
        packaging_id: form.packaging_id || null,
        manufacturer_id: form.manufacturer_id || null,
        barcode: form.barcode || null,
        is_active: form.is_active,
      };
      if (form.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({ ...payload, hospital_id: user.hospitalId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm(emptyProduct);
      qc.invalidateQueries({ queryKey: ["products", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setForm(emptyProduct);
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      name: p.name,
      product_type_id: p.product_type_id,
      unit_id: p.unit_id,
      release_form_id: p.release_form_id,
      packaging_id: p.packaging_id,
      manufacturer_id: p.manufacturer_id,
      barcode: p.barcode || "",
      is_active: p.is_active,
    });
    setOpen(true);
  };

  const canSave =
    form.name.trim() && form.product_type_id && form.unit_id && !saveMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Search</Label>
            <Input
              placeholder="Search by name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Product type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {productTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name_ru}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
            <Label htmlFor="active-only" className="cursor-pointer">Active only</Label>
          </div>
        </div>
        <Button onClick={openAdd}>Add Product</Button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Product type</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Release form</th>
              <th className="p-3">Manufacturer</th>
              <th className="p-3">Barcode</th>
              <th className="p-3">Active</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.product_types?.name || "—"}</td>
                <td className="p-3">{p.units_of_measurement?.name || "—"}</td>
                <td className="p-3">{p.release_forms?.name || "—"}</td>
                <td className="p-3">{p.manufacturers?.name || "—"}</td>
                <td className="p-3">{p.barcode || "—"}</td>
                <td className="p-3">
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No products.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{form.id ? "Edit Product" : "Add Product"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Product type *</Label>
              <Select
                value={form.product_type_id}
                onValueChange={(v) => setForm({ ...form, product_type_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {productTypes.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Release form</Label>
              <Select
                value={form.release_form_id || "none"}
                onValueChange={(v) => setForm({ ...form, release_form_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {releaseForms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Packaging</Label>
              <Select
                value={form.packaging_id || "none"}
                onValueChange={(v) => setForm({ ...form, packaging_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {packagings.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Manufacturer</Label>
              <Select
                value={form.manufacturer_id || "none"}
                onValueChange={(v) => setForm({ ...form, manufacturer_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {manufacturers.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input
                value={form.barcode || ""}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="prod-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="prod-active" className="cursor-pointer">Active</Label>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
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
      if (form.id) {
        const { error } = await supabase
          .from("suppliers")
          .update({
            name: form.name,
            contact: form.contact || null,
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
          })
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert({
          hospital_id: user.hospitalId,
          name: form.name,
          contact: form.contact || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
        });
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
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact</Label>
                <Input value={form.contact || ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
              <th className="p-3">Name</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Phone</th>
              <th className="p-3">Email</th>
              <th className="p-3">Address</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{s.name}</td>
                <td className="p-3">{s.contact || "—"}</td>
                <td className="p-3">{s.phone || "—"}</td>
                <td className="p-3">{s.email || "—"}</td>
                <td className="p-3">{s.address || "—"}</td>
                <td className="p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => { setForm(s); setOpen(true); }}
                  >
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

function ManufacturersSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Manufacturer>({ name: "" });

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
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
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
              <th className="p-3">Name</th>
              <th className="p-3">Country</th>
              <th className="p-3 w-12"></th>
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
