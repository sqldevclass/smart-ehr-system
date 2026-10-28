import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

export default function WarehousesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [movementHint, setMovementHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    warehouse_type_id: string;
    department_id: string | null;
    is_active: boolean;
  }>({ name: "", warehouse_type_id: "", department_id: null, is_active: true });

  const { data: types = [] } = useQuery({
    queryKey: ["warehouse_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_types")
        .select("id, name_ru, code")
        .order("sort_order");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-for-wh", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select(
          "id, name, is_active, warehouse_type_id, department_id, warehouse_types(name_ru), departments(name)"
        )
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) { toast.error(error.message); throw error; }
      return data || [];
    },
  });

  const isDepartment = types.find((t: any) => t.id === form.warehouse_type_id)?.code === "department";
  const availableDepartments = departments.filter((d: any) => !warehouses.some((w: any) => w.department_id === d.id && w.id !== form.id));
  const save = async () => {
    if (!user) return;
    if (!form.name.trim() || !form.warehouse_type_id) { toast.error("Укажите название и тип склада"); return; }
    if (isDepartment && !form.department_id) { toast.error("Выберите отделение"); return; }
    const payload = {
      name: form.name.trim(), warehouse_type_id: form.warehouse_type_id,
      department_id: isDepartment ? form.department_id : null, is_active: form.is_active,
    };
    setSaving(true);
    try {
      const { error } = form.id
        ? await supabase.from("warehouses").update(payload).eq("id", form.id)
        : await supabase.from("warehouses").insert({ ...payload, hospital_id: user.hospitalId });
      if (error) {
        if (/movement|движен|cannot.*(type|department)|нельзя.*(тип|отделен)/i.test(error.message)) setMovementHint(true);
        throw error;
      }
      toast.success("Сохранено");
      setOpen(false);
      setForm({ name: "", warehouse_type_id: "", department_id: null, is_active: true });
      qc.invalidateQueries({ queryKey: ["warehouses", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["my-warehouse", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["transfer-destinations", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["all-dept-warehouses", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["dept-warehouse"] });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">Склады</h2>
        <Button
          onClick={() => {
            setForm({ name: "", warehouse_type_id: "", department_id: null, is_active: true });
            setMovementHint(false);
            setOpen(true);
          }}
        >
          + Добавить склад
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Название</th>
              <th className="p-3">Тип</th>
              <th className="p-3">Отделение</th>
              <th className="p-3">Активен</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w: any) => (
              <tr key={w.id} className="border-t">
                <td className="p-3">{w.name}</td>
                <td className="p-3">{w.warehouse_types?.name_ru || "—"}</td>
                <td className="p-3">{w.departments?.name || "—"}</td>
                <td className="p-3">
                  <Badge variant={w.is_active ? "default" : "secondary"}>
                    {w.is_active ? "Да" : "Нет"}
                  </Badge>
                </td>
                <td className="p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setForm({
                        id: w.id,
                        name: w.name,
                        warehouse_type_id: w.warehouse_type_id,
                        department_id: w.department_id,
                        is_active: w.is_active,
                      });
                      setMovementHint(false);
            setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {warehouses.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Нет складов
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Редактировать склад" : "Добавить склад"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Название *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Тип склада *</Label>
              <Select
                value={form.warehouse_type_id}
                disabled={!!form.id}
                onValueChange={(v) => setForm({ ...form, warehouse_type_id: v, department_id: types.find((t: any) => t.id === v)?.code === "department" ? form.department_id : null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isDepartment && <div className="space-y-1.5">
              <Label>Отделение *</Label>
              <Select
                disabled={!!form.id}
                value={form.department_id || ""}
                onValueChange={(v) =>
                  setForm({ ...form, department_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите отделение" />
                </SelectTrigger>
                <SelectContent>
                  {availableDepartments.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>}
            {movementHint && <p className="text-sm text-muted-foreground">Нельзя менять после первых движений</p>}
            <div className="flex items-center gap-2">
              <Switch
                id="wh-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label htmlFor="wh-active" className="cursor-pointer">
                Активен
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={save}
              disabled={saving || !form.name.trim() || !form.warehouse_type_id || (isDepartment && !form.department_id)}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
