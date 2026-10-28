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
import { Pencil } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import HighlightMatch from "@/components/shared/HighlightMatch";
import { applySearch } from "@/lib/search";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface Supplier {
  id?: string;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  is_active: boolean;
}

interface Manufacturer {
  id?: string;
  name: string;
  country?: string | null;
  is_active: boolean;
}

export default function SettingsView({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Товары</TabsTrigger>
          <TabsTrigger value="suppliers">Поставщики</TabsTrigger>
          <TabsTrigger value="manufacturers">Производители</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ТоварыSection />
        </TabsContent>
        <TabsContent value="suppliers">
          <ПоставщикиSection />
        </TabsContent>
        <TabsContent value="manufacturers">
          <ПроизводителиSection />
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
  packaging_type_id?: string | null;
  manufacturer_id?: string | null;
  barcode?: string | null;
  inn: string;
  units_per_package: string;
  min_stock_quantity: string;
  expiry_notify_days: string;
  is_active: boolean;
}

const emptyProduct: Product = {
  name: "",
  product_type_id: "",
  unit_id: "",
  release_form_id: null,
  packaging_type_id: null,
  manufacturer_id: null,
  barcode: "",
  inn: "",
  units_per_package: "1",
  min_stock_quantity: "0",
  expiry_notify_days: "30",
  is_active: true,
};

function ТоварыSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Product>(emptyProduct);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState(true);

  const { data: productTypes = [] } = useQuery({
    queryKey: ["product_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_types").select("id, name_ru").order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ["units_of_measurement", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units_of_measurement")
        .select("id, name_ru, abbreviation")
        .or(`hospital_id.is.null,hospital_id.eq.${user?.hospitalId ?? ""}`)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: releaseForms = [] } = useQuery({
    queryKey: ["release_forms", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("release_forms")
        .select("id, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user?.hospitalId ?? ""}`)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: packagings = [] } = useQuery({
    queryKey: ["packaging_types", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packaging_types")
        .select("id, name_ru")
        .or(`hospital_id.is.null,hospital_id.eq.${user?.hospitalId ?? ""}`)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers-list", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturers")
        .select("id, name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
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
          "id, name, product_type_id, unit_id, release_form_id, packaging_type_id, manufacturer_id, barcode, inn, units_per_package, min_stock_quantity, expiry_notify_days, is_active, product_types(name_ru), units_of_measurement(name_ru), release_forms(name_ru), packaging_types(name_ru), manufacturers(name)"
        )
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      q = applySearch(q, debouncedSearch);
      if (typeFilter !== "all") q = q.eq("product_type_id", typeFilter);
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Не выполнен вход");
      if (!form.name.trim()) throw new Error("Укажите название товара");
      if (!form.product_type_id || !form.unit_id || !form.release_form_id) throw new Error("Выберите тип товара, единицу измерения и форму выпуска");
      const units = Number(form.units_per_package);
      if (!form.units_per_package.trim() || !Number.isInteger(units) || units <= 0) throw new Error("Единиц в упаковке: укажите целое число больше нуля");
      if (!form.min_stock_quantity.trim() || !Number.isFinite(Number(form.min_stock_quantity)) || Number(form.min_stock_quantity) < 0) throw new Error("Мин. остаток должен быть неотрицательным числом");
      if (!form.expiry_notify_days.trim() || !Number.isFinite(Number(form.expiry_notify_days)) || Number(form.expiry_notify_days) < 0) throw new Error("Срок предупреждения должен быть неотрицательным числом");
      const payload = {
        name: form.name.trim(),
        product_type_id: form.product_type_id,
        unit_id: form.unit_id,
        release_form_id: form.release_form_id || null,
        packaging_type_id: form.packaging_type_id || null,
        manufacturer_id: form.manufacturer_id || null,
        barcode: form.barcode || null,
        inn: form.inn.trim() || null,
        units_per_package: Number(form.units_per_package),
        min_stock_quantity: Number(form.min_stock_quantity),
        expiry_notify_days: Number(form.expiry_notify_days),
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
      toast.success("Сохранено");
      setOpen(false);
      setForm(emptyProduct);
      qc.invalidateQueries({ queryKey: ["products", user?.hospitalId] });
    },
    onError: (e: Error & { code?: string }) => toast.error(e.code === "23505" ? "Товар с таким названием и формой выпуска уже существует" : e.message),
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
      packaging_type_id: p.packaging_type_id,
      manufacturer_id: p.manufacturer_id,
      barcode: p.barcode || "",
      inn: p.inn || "",
      units_per_package: String(p.units_per_package ?? 1),
      min_stock_quantity: String(p.min_stock_quantity ?? 0),
      expiry_notify_days: String(p.expiry_notify_days ?? 30),
      is_active: p.is_active,
    });
    setOpen(true);
  };

  const canSave =
    form.name.trim() && form.product_type_id && form.unit_id && form.release_form_id && !saveMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Поиск</Label>
            <SearchInput
              placeholder="Название, МНН или штрихкод"
              value={search}
              onChange={setSearch}
              className="w-64"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Тип товара</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                {productTypes.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name_ru}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={activeOnly} onCheckedChange={setActiveOnly} id="active-only" />
            <Label htmlFor="active-only" className="cursor-pointer">Только активные</Label>
          </div>
        </div>
        <Button onClick={openAdd}>Добавить товар</Button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Название</th>
              <th className="p-3">Тип товара</th>
              <th className="p-3">Единица измерения</th>
              <th className="p-3">Форма выпуска</th>
              <th className="p-3">Производитель</th>
              <th className="p-3">МНН</th>
              <th className="p-3">Упаковка</th>
              <th className="p-3">Единиц в упаковке</th>
              <th className="p-3">Мин. остаток</th>
              <th className="p-3">Предупреждать за (дней)</th>
              <th className="p-3">Штрихкод</th>
              <th className="p-3">Активен</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3"><HighlightMatch text={p.name} term={debouncedSearch} /></td>
                <td className="p-3">{p.product_types?.name_ru || "—"}</td>
                <td className="p-3">{p.units_of_measurement?.name_ru || "—"}</td>
                <td className="p-3">{p.release_forms?.name_ru || "—"}</td>
                <td className="p-3">{p.manufacturers?.name || "—"}</td>
                <td className="p-3">{p.inn || "—"}</td>
                <td className="p-3">{p.packaging_types?.name_ru || "—"}</td>
                <td className="p-3">{p.units_per_package}</td>
                <td className="p-3">{p.min_stock_quantity}</td>
                <td className="p-3">{p.expiry_notify_days}</td>
                <td className="p-3">{p.barcode || "—"}</td>
                <td className="p-3">
                  <Badge variant={p.is_active ? "default" : "secondary"}>
                    {p.is_active ? "Активен" : "Неактивен"}
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
              <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">Нет товаров</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{form.id ? "Редактировать товар" : "Добавить товар"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Тип товара *</Label>
              <Select
                value={form.product_type_id}
                onValueChange={(v) => setForm({ ...form, product_type_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {productTypes.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Единица измерения *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите единицу" /></SelectTrigger>
                <SelectContent>
                  {units.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Форма выпуска *</Label>
              <Select
                value={form.release_form_id || "none"}
                onValueChange={(v) => setForm({ ...form, release_form_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Необязательно" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {releaseForms.map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Упаковка</Label>
              <Select
                value={form.packaging_type_id || "none"}
                onValueChange={(v) => setForm({ ...form, packaging_type_id: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Необязательно" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {packagings.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name_ru}</SelectItem>
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
                <SelectTrigger><SelectValue placeholder="Необязательно" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {manufacturers.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Штрихкод</Label>
              <Input
                value={form.barcode || ""}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>МНН</Label>
              <Input value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
            </div>
            {([
              ["units_per_package", "Единиц в упаковке", 1, 1],
              ["min_stock_quantity", "Мин. остаток", 0, "any"],
              ["expiry_notify_days", "Предупреждать о сроке за (дней)", 0, "any"],
            ] as const).map(([key, label, min, step]) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input type="number" min={min} step={step} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Switch
                id="prod-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="prod-active" className="cursor-pointer">Активен</Label>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>Сохранить</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ПоставщикиSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Supplier>({ name: "", is_active: true });

  const { data: items = [] } = useQuery({
    queryKey: ["suppliers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name, contact, phone, email, address, is_active")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Не выполнен вход");
      if (form.id) {
        const { error } = await supabase
          .from("suppliers")
          .update({
            name: form.name,
            contact: form.contact || null,
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
            is_active: form.is_active,
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
          is_active: form.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      setOpen(false);
      setForm({ name: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["suppliers", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name: "", is_active: true }); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "", is_active: true })}>Добавить поставщика</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Редактировать" : "Добавить"} поставщика</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Контакт</Label>
                <Input value={form.contact || ""} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Телефон</Label>
                <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Эл. почта</Label>
                <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Адрес</Label>
                <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="supplier-active" checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
                <Label htmlFor="supplier-active">Активен</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
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
              <th className="p-3">Название</th>
              <th className="p-3">Контакт</th>
              <th className="p-3">Телефон</th>
              <th className="p-3">Эл. почта</th>
              <th className="p-3">Адрес</th>
              <th className="p-3">Активен</th>
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
                <td className="p-3"><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Активен" : "Неактивен"}</Badge></td>
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
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Нет поставщиков</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ПроизводителиSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Manufacturer>({ name: "", is_active: true });

  const { data: items = [] } = useQuery({
    queryKey: ["manufacturers", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manufacturers")
        .select("id, name, country, is_active")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Не выполнен вход");
      if (form.id) {
        const { error } = await supabase
          .from("manufacturers")
          .update({ name: form.name.trim(), country: form.country || null, is_active: form.is_active })
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manufacturers").insert({
          hospital_id: user.hospitalId,
          name: form.name,
          country: form.country || null,
          is_active: form.is_active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Сохранено");
      setOpen(false);
      setForm({ name: "", is_active: true });
      qc.invalidateQueries({ queryKey: ["manufacturers", user?.hospitalId] });
      qc.invalidateQueries({ queryKey: ["manufacturers-list", user?.hospitalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name: "", is_active: true }); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name: "", is_active: true })}>Добавить производителя</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Редактировать" : "Добавить"} производителя</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Страна</Label>
                <Input value={form.country || ""} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="manufacturer-active" checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />
                <Label htmlFor="manufacturer-active">Активен</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
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
              <th className="p-3">Название</th>
              <th className="p-3">Страна</th>
              <th className="p-3">Активен</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((m: any) => (
              <tr key={m.id} className="border-t">
                <td className="p-3">{m.name}</td>
                <td className="p-3">{m.country || "—"}</td>
                <td className="p-3"><Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Активен" : "Неактивен"}</Badge></td>
                <td className="p-3">
                  <Button size="icon" variant="ghost" onClick={() => { setForm(m); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Нет производителей</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
