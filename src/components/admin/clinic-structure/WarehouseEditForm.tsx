import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BlockFloorSelect } from "./BlockFloorSelect";
import { StructureWarehouse } from "./useClinicStructureData";

interface WarehouseType { id: string; name_ru: string; code: string }

interface Props {
  warehouse?: StructureWarehouse | null;
  onSaved: () => void;
  onCancel?: () => void;
}

export function WarehouseEditForm({ warehouse, onSaved, onCancel }: Props) {
  const { user, hasPermission } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(warehouse?.name ?? "");
  const [typeId, setTypeId] = useState(warehouse?.warehouse_type_id ?? "");
  const [departmentId, setDepartmentId] = useState<string | null>(warehouse?.department_id ?? null);
  const [floorId, setFloorId] = useState<string | null>(warehouse?.floor_id ?? null);
  const [isActive, setIsActive] = useState(warehouse?.is_active ?? true);
  const [movementHint, setMovementHint] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ["warehouse_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_types").select("id, name_ru, code").order("sort_order");
      if (error) { toast.error(error.message); throw error; }
      return (data || []) as WarehouseType[];
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
      return (data || []) as { id: string; name: string }[];
    },
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, department_id")
        .eq("hospital_id", user?.hospitalId ?? "");
      if (error) { toast.error(error.message); throw error; }
      return (data || []) as { id: string; department_id: string | null }[];
    },
  });

  const isDepartment = types.find((t) => t.id === typeId)?.code === "department";
  const availableDepartments = departments.filter((d) => !warehouses.some((w) => w.department_id === d.id && w.id !== warehouse?.id));

  const save = async () => {
    if (!user) return;
    if (!name.trim() || !typeId) { toast.error("Укажите название и тип склада"); return; }
    if (isDepartment && !departmentId) { toast.error("Выберите отделение"); return; }
    const payload = {
      floor_id: floorId,
      name: name.trim(),
      warehouse_type_id: typeId,
      department_id: isDepartment ? departmentId : null,
      is_active: isActive,
    };
    setSaving(true);
    try {
      const { error } = warehouse
        ? await supabase.from("warehouses").update(payload).eq("id", warehouse.id)
        : await supabase.from("warehouses").insert({ ...payload, hospital_id: user.hospitalId });
      if (error) {
        if (/movement|движен|cannot.*(type|department)|нельзя.*(тип|отделен)/i.test(error.message)) setMovementHint(true);
        throw error;
      }
      toast.success("Сохранено");
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["clinic-structure"] });
      qc.invalidateQueries({ queryKey: ["my-warehouse", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["transfer-destinations", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["all-dept-warehouses", user.hospitalId] });
      qc.invalidateQueries({ queryKey: ["dept-warehouse"] });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Название *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Тип склада *</Label>
        <Select
          value={typeId}
          disabled={!!warehouse}
          onValueChange={(v) => {
            setTypeId(v);
            if (types.find((t) => t.id === v)?.code !== "department") setDepartmentId(null);
          }}
        >
          <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
          <SelectContent>
            {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name_ru}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isDepartment && (
        <div className="space-y-1.5">
          <Label>Отделение *</Label>
          <Select
            disabled={!!warehouse}
            value={departmentId || ""}
            onValueChange={(v) => setDepartmentId(v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Выберите отделение" /></SelectTrigger>
            <SelectContent>
              {availableDepartments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Блок / Этаж</Label>
        <BlockFloorSelect value={floorId} onChange={setFloorId} disabled={saving || !hasPermission("system.manage_settings")} />
      </div>
      {movementHint && <p className="text-sm text-muted-foreground">Нельзя менять после первых движений</p>}
      <div className="flex items-center gap-2">
        <Switch id="wh-form-active" checked={isActive} onCheckedChange={setIsActive} />
        <Label htmlFor="wh-form-active" className="cursor-pointer">Активен</Label>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel}>Отмена</Button>}
        <Button onClick={save} disabled={saving || !name.trim() || !typeId || (isDepartment && !departmentId)}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}
