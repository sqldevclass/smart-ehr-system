import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BlockFloorSelect } from "./BlockFloorSelect";
import { StructureRoom } from "./useClinicStructureData";
import { useUpdateRoom } from "./useUpdateRoom";
import { RoomServicesSection } from "./RoomServicesSection";

interface RoomType { id: string; name: string; is_active?: boolean; is_office_room?: boolean }
interface DepartmentLite { id: string; name: string; is_active?: boolean }

interface Props {
  room: StructureRoom;
  onSaved: () => void;
  onCancel?: () => void;
}

export function RoomEditForm({ room, onSaved, onCancel }: Props) {
  const { user, hasPermission } = useAuth();
  const canWrite = hasPermission("system.manage_settings");
  const updateRoom = useUpdateRoom();
  const [name, setName] = useState(room.name);
  const [typeId, setTypeId] = useState(room.room_type_id ?? "");
  const [deptId, setDeptId] = useState(room.department_id ?? "");
  const [beds, setBeds] = useState(room.capacity);
  const [floorId, setFloorId] = useState<string | null>(room.floor_id);
  const [isActive, setIsActive] = useState(room.is_active);
  const [saving, setSaving] = useState(false);

  const { data: roomTypes = [] } = useQuery({
    queryKey: ["room-types-all", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name, is_active, is_office_room")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
      return (data || []) as RoomType[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, is_active")
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) throw error;
      return (data || []) as DepartmentLite[];
    },
  });

  const visibleTypes = roomTypes.filter(t => t.is_active || t.id === typeId);
  const selectedType = roomTypes.find(t => t.id === typeId);
  const isOffice = !!selectedType?.is_office_room;
  const visibleDepartments = departments.filter(d => d.is_active || d.id === deptId);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required.");
    if (!typeId) return toast.error("Room type is required.");
    if (!isOffice && !deptId) return toast.error("Department is required.");
    if (!isOffice && (beds < 1 || beds > 100)) return toast.error("Коек: от 1 до 100");
    setSaving(true);
    const ok = await updateRoom(room.id, {
      name: name.trim(),
      room_type_id: typeId,
      department_id: isOffice ? null : deptId,
      capacity: isOffice ? 0 : beds,
      floor_id: floorId,
      is_active: isActive,
    });
    setSaving(false);
    if (ok) {
      toast.success("Сохранено");
      onSaved();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
      </div>
      <div className="space-y-1.5">
        <Label>Type *</Label>
        <Select value={typeId} onValueChange={(v) => setTypeId(v)} disabled={saving}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {visibleTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{!t.is_active ? " (неактивен)" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {!isOffice && (
        <div className="space-y-1.5">
          <Label>Department *</Label>
          <Select value={deptId} onValueChange={setDeptId} disabled={saving}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {visibleDepartments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{!d.is_active ? " (неактивно)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {!isOffice && (
        <div className="space-y-1.5">
          <Label>Number of Beds (1–100)</Label>
          <Input type="number" min={1} max={100} value={beds} onChange={(e) => setBeds(Number(e.target.value))} disabled={saving} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Блок / Этаж</Label>
        <BlockFloorSelect value={floorId} onChange={setFloorId} disabled={saving || !canWrite} />
        <p className="text-xs text-muted-foreground">Пусто — этаж берётся из отделения</p>
      </div>
      <div className="flex items-center justify-between">
        <Label>Active</Label>
        <Switch checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={saving}>Отмена</Button>}
        <Button onClick={handleSave} disabled={saving || !canWrite}>
          {saving ? "Сохранение…" : "Сохранить"}
        </Button>
      </div>
      {room.id && room.capacity > 0 && room.room_types && !room.room_types.is_office_room && !isOffice && beds > 0 && canWrite && <RoomServicesSection roomId={room.id} />}
    </div>
  );
}
