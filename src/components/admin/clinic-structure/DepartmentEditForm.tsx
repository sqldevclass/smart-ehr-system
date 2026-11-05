import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { BlockFloorSelect } from "./BlockFloorSelect";
import { StructureDepartment } from "./useClinicStructureData";

interface Props {
  department?: StructureDepartment | null;
  onSaved: () => void;
  onCancel?: () => void;
}

export function DepartmentEditForm({ department, onSaved, onCancel }: Props) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(department?.name ?? "");
  const [code, setCode] = useState(department?.code ?? "");
  const [floorId, setFloorId] = useState<string | null>(department?.floor_id ?? null);
  const [isActive, setIsActive] = useState(department?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      if (department) {
        const { error } = await supabase
          .from("departments")
          .update({
            name: name.trim(),
            code: code.trim() || null,
            is_active: isActive,
            floor_id: floorId,
          })
          .eq("id", department.id);
        if (error) throw error;
        toast.success("Department updated.");
      } else {
        const { error } = await supabase.from("departments").insert({
          name: name.trim(),
          code: code.trim() || null,
          hospital_id: user.hospitalId,
          floor_id: floorId,
        });
        if (error) throw error;
        toast.success("Department created.");
      }
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["departments-active"] });
      queryClient.invalidateQueries({ queryKey: ["clinic-structure"] });
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cardiology" />
      </div>
      <div className="space-y-1.5">
        <Label>Code</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CARD" />
      </div>
      <div className="space-y-1.5">
        <Label>Основной этаж</Label>
        <BlockFloorSelect value={floorId} onChange={setFloorId} disabled={saving || !hasPermission("system.manage_settings")} />
      </div>
      {department && (
        <div className="flex items-center justify-between">
          <Label>Active</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
