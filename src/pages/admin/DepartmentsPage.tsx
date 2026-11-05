import { BlockFloorSelect } from "@/components/admin/clinic-structure/BlockFloorSelect";
import { useClinicStructure } from "@/components/admin/clinic-structure/useClinicStructure";
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
import { Switch } from "@/components/ui/switch";
import { Plus, Edit } from "lucide-react";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
  code: string | null;
  floor_id: string | null;
  is_active: boolean;
}

export default function DepartmentsPage() {
  const { user, hasPermission } = useAuth();
  const { formatFloor } = useClinicStructure();
  const [floorId, setFloorId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code, is_active, floor_id")
        .eq("hospital_id", user.hospitalId)
        .order("name");
      if (error) throw error;
      return (data || []) as Department[];
    },
    enabled: !!user,
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setFloorId(null);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setName(d.name);
    setCode(d.code || "");
    setFloorId(d.floor_id);
    setIsActive(d.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("departments")
          .update({
            name: name.trim(),
            code: code.trim() || null,
            is_active: isActive,
            floor_id: floorId,
          })
          .eq("id", editing.id);
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
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["departments-active"] });
      queryClient.invalidateQueries({ queryKey: ["clinic-structure"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Departments</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Department
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No departments yet.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Блок / Этаж</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.code || "—"}</TableCell>
                  <TableCell>{formatFloor(d.floor_id)}</TableCell>
                  <TableCell>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${d.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {d.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Department" : "Add Department"}</DialogTitle>
          </DialogHeader>
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
