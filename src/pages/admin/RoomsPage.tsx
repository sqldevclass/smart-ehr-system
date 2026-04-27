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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit } from "lucide-react";
import { toast } from "sonner";

const ROOM_TYPES = ["ward", "procedure", "lab", "imaging", "icu", "other"] as const;
type RoomType = typeof ROOM_TYPES[number];

interface Department {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
  room_type: RoomType;
  capacity: number;
  is_active: boolean;
  department_id: string;
}

export default function RoomsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("ward");
  const [capacity, setCapacity] = useState<number>(1);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as Department[];
    },
    enabled: !!user,
  });

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_type, capacity, is_active, department_id")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as Room[];
    },
    enabled: !!user,
  });

  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || "—";

  const grouped = departments.map((d) => ({
    department: d,
    rooms: rooms.filter((r) => r.department_id === d.id),
  }));
  const orphanRooms = rooms.filter((r) => !departments.some((d) => d.id === r.department_id));

  const openCreate = () => {
    setEditing(null);
    setDepartmentId("");
    setName("");
    setRoomType("ward");
    setCapacity(1);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (r: Room) => {
    setEditing(r);
    setDepartmentId(r.department_id);
    setName(r.name);
    setRoomType(r.room_type);
    setCapacity(r.capacity);
    setIsActive(r.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!editing && !departmentId) {
      toast.error("Department is required.");
      return;
    }
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("rooms")
          .update({
            name: name.trim(),
            room_type: roomType,
            capacity,
            is_active: isActive,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Room updated.");
      } else {
        const { error } = await supabase.from("rooms").insert({
          hospital_id: user.hospitalId,
          department_id: departmentId,
          name: name.trim(),
          room_type: roomType,
          capacity,
        });
        if (error) throw error;
        toast.success("Room created.");
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const renderTable = (list: Room[]) => (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="capitalize">{r.room_type}</TableCell>
              <TableCell>{r.capacity}</TableCell>
              <TableCell>{deptName(r.department_id)}</TableCell>
              <TableCell>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Rooms</h1>
        <Button onClick={openCreate} className="gap-2" disabled={departments.length === 0}>
          <Plus className="h-4 w-4" /> Add Room
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a department first.</p>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms yet.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ department, rooms: deptRooms }) => (
            <div key={department.id} className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {department.name}
              </h2>
              {deptRooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rooms in this department.</p>
              ) : (
                renderTable(deptRooms)
              )}
            </div>
          ))}
          {orphanRooms.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Other
              </h2>
              {renderTable(orphanRooms)}
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Room" : "Add Room"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Department *</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Room 101" />
            </div>
            <div className="space-y-1.5">
              <Label>Room Type *</Label>
              <Select value={roomType} onValueChange={(v) => setRoomType(v as RoomType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
            {editing && (
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
