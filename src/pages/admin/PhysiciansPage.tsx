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

interface PhysicianRow {
  id: string;
  full_name: string;
  specialization: string | null;
  dashboard_type: string | null;
  is_active: boolean;
}

export default function PhysiciansPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addInfoOpen, setAddInfoOpen] = useState(false);
  const [editing, setEditing] = useState<PhysicianRow | null>(null);
  const [specialization, setSpecialization] = useState("");
  const [dashboardType, setDashboardType] = useState("clinical");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: physicians = [], isLoading } = useQuery({
    queryKey: ["admin-physicians", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("physicians")
        .select("id, dashboard_type, is_active, profile_id, profiles!inner(full_name), specializations!specialization_id(name)")
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        full_name: p.profiles?.full_name || "Unknown",
        specialization: (p as any).specializations?.name ?? null,
        specializations: p.specializations,
        dashboard_type: p.dashboard_type,
        is_active: p.is_active,
      })) as PhysicianRow[];
    },
    enabled: !!user,
  });

  const openEdit = (p: PhysicianRow) => {
    setEditing(p);
    setSpecialization((p as any).specializations?.name || "");
    setDashboardType(p.dashboard_type || "clinical");
    setIsActive(p.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("physicians")
        .update({
          specialization: specialization.trim() || null,
          dashboard_type: dashboardType,
          is_active: isActive,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Physician updated.");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-physicians"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Physicians</h1>
        <Button onClick={() => setAddInfoOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Physician
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : physicians.length === 0 ? (
        <p className="text-sm text-muted-foreground">No physicians yet.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Specialization</TableHead>
                <TableHead>Dashboard Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {physicians.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{(p as any).specializations?.name || "—"}</TableCell>
                  <TableCell className="capitalize">{p.dashboard_type || "—"}</TableCell>
                  <TableCell>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${p.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={addInfoOpen} onOpenChange={setAddInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Physician</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Invite via User Management. Once a user with the physician role accepts their invite,
            they will appear here for configuration.
          </p>
          <DialogFooter>
            <Button onClick={() => setAddInfoOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Physician</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Specialization</Label>
              <Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Cardiology" />
            </div>
            <div className="space-y-1.5">
              <Label>Dashboard Type</Label>
              <Select value={dashboardType} onValueChange={setDashboardType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="worklist">Worklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
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
