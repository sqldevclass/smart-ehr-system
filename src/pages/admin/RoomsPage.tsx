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
import { Plus, Edit, Settings } from "lucide-react";
import { toast } from "sonner";

const NEW_ROOM_TYPE_VALUE = "__new__";

interface Department {
  id: string;
  name: string;
}

interface RoomType {
  id: string;
  name: string;
  is_active?: boolean;
}

interface Room {
  id: string;
  name: string;
  room_type_id: string | null;
  capacity: number;
  is_active: boolean;
  department_id: string;
  room_types?: { name: string } | null;
}

export default function RoomsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [name, setName] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [newRoomTypeName, setNewRoomTypeName] = useState("");
  const [creatingRoomType, setCreatingRoomType] = useState(false);
  const [showNewRoomTypeInput, setShowNewRoomTypeInput] = useState(false);
  const [capacity, setCapacity] = useState<number>(1);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);

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

  const { data: roomTypes = [] } = useQuery({
    queryKey: ["room-types", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name, is_active")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as RoomType[];
    },
    enabled: !!user,
  });

  const { data: allRoomTypes = [] } = useQuery({
    queryKey: ["room-types-all", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name, is_active")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as RoomType[];
    },
    enabled: !!user,
  });

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_type_id, capacity, is_active, department_id, room_types(name)")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Room[];
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
    setRoomTypeId("");
    setShowNewRoomTypeInput(false);
    setNewRoomTypeName("");
    setCapacity(1);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (r: Room) => {
    setEditing(r);
    setDepartmentId(r.department_id);
    setName(r.name);
    setRoomTypeId(r.room_type_id || "");
    setShowNewRoomTypeInput(false);
    setNewRoomTypeName("");
    setCapacity(r.capacity);
    setIsActive(r.is_active);
    setDialogOpen(true);
  };

  const handleRoomTypeChange = (val: string) => {
    if (val === NEW_ROOM_TYPE_VALUE) {
      setShowNewRoomTypeInput(true);
      setRoomTypeId("");
    } else {
      setShowNewRoomTypeInput(false);
      setRoomTypeId(val);
    }
  };

  const handleCreateRoomType = async () => {
    if (!user || !newRoomTypeName.trim()) {
      toast.error("Enter a room type name.");
      return;
    }
    setCreatingRoomType(true);
    try {
      const { data, error } = await supabase
        .from("room_types")
        .insert({ hospital_id: user.hospitalId, name: newRoomTypeName.trim() })
        .select("id, name")
        .single();
      if (error) throw error;
      toast.success("Room type created.");
      await queryClient.invalidateQueries({ queryKey: ["room-types"] });
      await queryClient.invalidateQueries({ queryKey: ["room-types-all"] });
      setRoomTypeId(data.id);
      setShowNewRoomTypeInput(false);
      setNewRoomTypeName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create room type.");
    } finally {
      setCreatingRoomType(false);
    }
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
    if (!roomTypeId) {
      toast.error("Room type is required.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("rooms")
          .update({
            name: name.trim(),
            room_type_id: roomTypeId,
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
          room_type_id: roomTypeId,
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
              <TableCell>{r.room_types?.name || "—"}</TableCell>
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setManageOpen(true)} className="gap-2">
            <Settings className="h-4 w-4" /> Manage Room Types
          </Button>
          <Button onClick={openCreate} className="gap-2" disabled={departments.length === 0}>
            <Plus className="h-4 w-4" /> Add Room
          </Button>
        </div>
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
              <Select value={roomTypeId} onValueChange={handleRoomTypeChange}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                  <SelectItem value={NEW_ROOM_TYPE_VALUE}>+ New Room Type</SelectItem>
                </SelectContent>
              </Select>
              {showNewRoomTypeInput && (
                <div className="flex gap-2 pt-2">
                  <Input
                    value={newRoomTypeName}
                    onChange={(e) => setNewRoomTypeName(e.target.value)}
                    placeholder="New room type name"
                  />
                  <Button onClick={handleCreateRoomType} disabled={creatingRoomType} size="sm">
                    {creatingRoomType ? "Saving…" : "Add"}
                  </Button>
                </div>
              )}
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

      <ManageRoomTypesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        roomTypes={allRoomTypes}
        hospitalId={user?.hospitalId}
      />
    </div>
  );
}

function ManageRoomTypesDialog({
  open,
  onOpenChange,
  roomTypes,
  hospitalId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomTypes: RoomType[];
  hospitalId?: string;
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["room-types"] });
    queryClient.invalidateQueries({ queryKey: ["room-types-all"] });
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
  };

  const handleAdd = async () => {
    if (!hospitalId || !newName.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("room_types")
        .insert({ hospital_id: hospitalId, name: newName.trim() });
      if (error) throw error;
      toast.success("Room type added.");
      setNewName("");
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = async (id: string) => {
    if (!editingName.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("room_types")
        .update({ name: editingName.trim() })
        .eq("id", id);
      if (error) throw error;
      toast.success("Updated.");
      setEditingId(null);
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (rt: RoomType) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("room_types")
        .update({ is_active: !rt.is_active })
        .eq("id", rt.id);
      if (error) throw error;
      refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Room Types</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New room type name"
            />
            <Button onClick={handleAdd} disabled={busy || !newName.trim()}>Add</Button>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Active</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomTypes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      No room types yet.
                    </TableCell>
                  </TableRow>
                )}
                {roomTypes.map((rt) => (
                  <TableRow key={rt.id}>
                    <TableCell>
                      {editingId === rt.id ? (
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                        />
                      ) : (
                        rt.name
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!rt.is_active}
                        onCheckedChange={() => handleToggle(rt)}
                        disabled={busy}
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === rt.id ? (
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => handleSaveName(rt.id)} disabled={busy}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingId(rt.id);
                            setEditingName(rt.name);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
