import { DepartmentEditForm } from "@/components/admin/clinic-structure/DepartmentEditForm";
import { useClinicStructure } from "@/components/admin/clinic-structure/useClinicStructure";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit } from "lucide-react";

interface Department {
  id: string;
  name: string;
  code: string | null;
  floor_id: string | null;
  is_active: boolean;
}

export default function DepartmentsPage() {
  const { user } = useAuth();
  const { formatFloor } = useClinicStructure();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

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
    setDialogOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setDialogOpen(true);
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
          <DepartmentEditForm
            key={editing?.id ?? "new"}
            department={editing}
            onSaved={() => setDialogOpen(false)}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
