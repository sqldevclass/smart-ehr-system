import { useState, useMemo } from "react";
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
import { Minus, Plus, Edit, Settings, Layers } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
}

interface RoomType {
  id: string;
  name: string;
  is_active?: boolean;
  is_office_room?: boolean;
}

interface ServiceLite {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
  room_type_id: string | null;
  capacity: number;
  is_active: boolean;
  department_id: string | null;
  room_types?: { name: string; is_office_room?: boolean } | null;
}

export default function RoomsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [manageOpen, setManageOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Add row state
  const [addName, setAddName] = useState("");
  const [addTypeId, setAddTypeId] = useState("");
  const [addBeds, setAddBeds] = useState(1);
  const [addDeptId, setAddDeptId] = useState("");
  const [addServiceIds, setAddServiceIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Inline editing
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

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
        .select("id, name, is_active, is_office_room")
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
        .select("id, name, is_active, is_office_room")
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
        .select("id, name, room_type_id, capacity, is_active, department_id, room_types(name, is_office_room)")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as Room[];
    },
    enabled: !!user,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-active-lite", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as ServiceLite[];
    },
    enabled: !!user,
  });

  const { data: officeRoomServiceLinks = [] } = useQuery({
    queryKey: ["office-room-services", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("office_room_services")
        .select("room_id, services(name)")
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return (data || []) as unknown as { room_id: string; services: { name: string } | null }[];
    },
    enabled: !!user,
  });

  const officeRoomServiceMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of officeRoomServiceLinks) {
      if (!m.has(l.room_id)) m.set(l.room_id, []);
      if (l.services?.name) m.get(l.room_id)!.push(l.services.name);
    }
    return m;
  }, [officeRoomServiceLinks]);

  const officeRooms = rooms.filter((r) => r.room_types?.is_office_room);
  const nonOfficeRooms = rooms.filter((r) => !r.room_types?.is_office_room);

  const grouped = departments.map((d) => ({
    department: d,
    rooms: nonOfficeRooms.filter((r) => r.department_id === d.id),
  }));
  const orphanRooms = nonOfficeRooms.filter((r) => !r.department_id || !departments.some((d) => d.id === r.department_id));

  const refreshRooms = () => {
    queryClient.invalidateQueries({ queryKey: ["rooms"] });
    queryClient.invalidateQueries({ queryKey: ["office-room-services"] });
  };

  const selectedAddType = roomTypes.find((rt) => rt.id === addTypeId);
  const addIsOffice = !!selectedAddType?.is_office_room;

  const toggleAddService = (id: string) => {
    setAddServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddRoom = async () => {
    if (!user) return;
    if (!addName.trim()) return toast.error("Name is required.");
    if (!addTypeId) return toast.error("Room type is required.");
    if (!addIsOffice && !addDeptId) return toast.error("Department is required.");
    setAdding(true);
    try {
      const { data: inserted, error } = await supabase.from("rooms").insert({
        hospital_id: user.hospitalId,
        department_id: addIsOffice ? null : addDeptId,
        name: addName.trim(),
        room_type_id: addTypeId,
        capacity: addIsOffice ? 0 : addBeds,
      }).select("id").single();
      if (error) throw error;
      if (addIsOffice && addServiceIds.size > 0 && inserted?.id) {
        const rows = Array.from(addServiceIds).map((sid) => ({
          hospital_id: user.hospitalId,
          room_id: inserted.id,
          service_id: sid,
        }));
        const { error: linkErr } = await supabase.from("office_room_services").insert(rows);
        if (linkErr) throw linkErr;
      }
      toast.success("Room created.");
      setAddName("");
      setAddBeds(1);
      setAddServiceIds(new Set());
      refreshRooms();
    } catch (err: any) {
      toast.error(err.message || "Failed to add room.");
    } finally {
      setAdding(false);
    }
  };

  const updateRoom = async (id: string, patch: Partial<Room>) => {
    try {
      const { error } = await supabase.from("rooms").update(patch).eq("id", id);
      if (error) throw error;
      refreshRooms();
    } catch (err: any) {
      toast.error(err.message || "Update failed.");
    }
  };

  const handleSaveName = async (r: Room) => {
    const v = editingNameValue.trim();
    setEditingNameId(null);
    if (!v || v === r.name) return;
    await updateRoom(r.id, { name: v });
  };

  const handleBeds = async (r: Room, delta: number) => {
    const next = Math.max(1, Math.min(100, r.capacity + delta));
    if (next === r.capacity) return;
    await updateRoom(r.id, { capacity: next });
  };

  const renderTable = (list: Room[]) => (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="w-40">Number of Beds</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {editingNameId === r.id ? (
                  <Input
                    autoFocus
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value)}
                    onBlur={() => handleSaveName(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName(r);
                      if (e.key === "Escape") setEditingNameId(null);
                    }}
                    className="h-8"
                  />
                ) : (
                  <button
                    className="text-left hover:underline"
                    onClick={() => {
                      setEditingNameId(r.id);
                      setEditingNameValue(r.name);
                    }}
                  >
                    {r.name}
                  </button>
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={r.room_type_id || ""}
                  onValueChange={(v) => updateRoom(r.id, { room_type_id: v })}
                >
                  <SelectTrigger className="h-8 w-44">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <div className="inline-flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleBeds(r, -1)} disabled={r.capacity <= 1}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center tabular-nums">{r.capacity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => handleBeds(r, 1)} disabled={r.capacity >= 100}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) => updateRoom(r.id, { is_active: v })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const renderOfficeTable = (list: Room[]) => (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Services</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => {
            const svcNames = officeRoomServiceMap.get(r.id) || [];
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {editingNameId === r.id ? (
                    <Input
                      autoFocus
                      value={editingNameValue}
                      onChange={(e) => setEditingNameValue(e.target.value)}
                      onBlur={() => handleSaveName(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveName(r);
                        if (e.key === "Escape") setEditingNameId(null);
                      }}
                      className="h-8"
                    />
                  ) : (
                    <button
                      className="text-left hover:underline"
                      onClick={() => {
                        setEditingNameId(r.id);
                        setEditingNameValue(r.name);
                      }}
                    >
                      {r.name}
                    </button>
                  )}
                </TableCell>
                <TableCell>{r.room_types?.name || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {svcNames.length === 0 ? (
                      <span className="text-xs text-muted-foreground">No services</span>
                    ) : (
                      svcNames.map((n, i) => (
                        <span key={i} className="rounded border bg-muted px-2 py-0.5 text-xs">
                          {n}
                        </span>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => updateRoom(r.id, { is_active: v })}
                  />
                </TableCell>
              </TableRow>
            );
          })}
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
          <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2" disabled={departments.length === 0 || roomTypes.length === 0}>
            <Layers className="h-4 w-4" /> Bulk Create
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a department first.</p>
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

          {officeRooms.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Office Rooms
              </h2>
              {renderOfficeTable(officeRooms)}
            </div>
          )}

          {/* Add Room row */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Add Room
            </h2>
            <div className="rounded-lg border bg-card p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Room 101"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Room Type</Label>
                  <Select value={addTypeId} onValueChange={setAddTypeId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {roomTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddRoom} disabled={adding} className="h-9">
                  {adding ? "Adding…" : "Add"}
                </Button>
              </div>

              {!addIsOffice ? (
                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-2 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Beds</Label>
                    <div className="inline-flex items-center gap-2">
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setAddBeds((b) => Math.max(1, b - 1))} disabled={addBeds <= 1}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center tabular-nums">{addBeds}</span>
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setAddBeds((b) => Math.min(100, b + 1))} disabled={addBeds >= 100}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <Select value={addDeptId} onValueChange={setAddDeptId}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Services</Label>
                  <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                    {services.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No active services.</p>
                    ) : services.map((s) => {
                      const id = `addsvc-${s.id}`;
                      return (
                        <label key={s.id} htmlFor={id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            id={id}
                            checked={addServiceIds.has(s.id)}
                            onCheckedChange={() => toggleAddService(s.id)}
                          />
                          <span>{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ManageRoomTypesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        roomTypes={allRoomTypes}
        hospitalId={user?.hospitalId}
      />

      <BulkCreateDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        departments={departments}
        roomTypes={roomTypes}
        rooms={rooms}
        hospitalId={user?.hospitalId}
      />
    </div>
  );
}

function BulkCreateDialog({
  open,
  onOpenChange,
  departments,
  roomTypes,
  rooms,
  hospitalId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  departments: Department[];
  roomTypes: RoomType[];
  rooms: Room[];
  hospitalId?: string;
}) {
  const queryClient = useQueryClient();
  const [deptId, setDeptId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [beds, setBeds] = useState(1);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);

  const startNumber = useMemo(() => {
    const deptRooms = rooms.filter((r) => r.department_id === deptId);
    let max = 0;
    for (const r of deptRooms) {
      const m = r.name.match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    }
    return max + 1;
  }, [rooms, deptId]);

  const previewNames = useMemo(() => {
    const n = Math.max(1, Math.min(50, count));
    return Array.from({ length: n }, (_, i) => `Room ${startNumber + i}`);
  }, [count, startNumber]);

  const deptName = departments.find((d) => d.id === deptId)?.name || "";

  const handleConfirm = async () => {
    if (!hospitalId || !deptId || !typeId) return;
    setBusy(true);
    try {
      const rows = previewNames.map((name) => ({
        hospital_id: hospitalId,
        department_id: deptId,
        room_type_id: typeId,
        name,
        capacity: beds,
      }));
      const { error } = await supabase.from("rooms").insert(rows);
      if (error) throw error;
      toast.success(`Created ${rows.length} rooms.`);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onOpenChange(false);
      setDeptId(""); setTypeId(""); setBeds(1); setCount(5);
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
          <DialogTitle>Bulk Create Rooms</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Department *</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Room Type *</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
              <SelectContent>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Number of Beds per Room</Label>
            <div className="inline-flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setBeds((b) => Math.max(1, b - 1))} disabled={beds <= 1}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-10 text-center tabular-nums">{beds}</span>
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setBeds((b) => Math.min(100, b + 1))} disabled={beds >= 100}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>How many rooms to create</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            />
          </div>
          {deptId && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium">Preview</p>
              <p className="text-muted-foreground">
                Will create: {previewNames.slice(0, 4).join(", ")}
                {previewNames.length > 4 ? `, ... ${previewNames[previewNames.length - 1]}` : ""}
                {" "}in {deptName}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={busy || !deptId || !typeId}>
            {busy ? "Creating…" : `Create ${previewNames.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
