import { WarehouseEditForm } from "@/components/admin/clinic-structure/WarehouseEditForm";
import { StructureWarehouse } from "@/components/admin/clinic-structure/useClinicStructureData";
import { useClinicStructure } from "@/components/admin/clinic-structure/useClinicStructure";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

export default function WarehousesPage() {
  const { user } = useAuth();
  const { formatFloor } = useClinicStructure();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StructureWarehouse | null>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select(
          "id, name, is_active, warehouse_type_id, department_id, floor_id, warehouse_types(name_ru), departments(name)"
        )
        .eq("hospital_id", user?.hospitalId ?? "")
        .order("name");
      if (error) { toast.error(error.message); throw error; }
      return (data || []) as unknown as StructureWarehouse[];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold text-foreground">Склады</h2>
        <Button
          onClick={() => {
            setEditing(null);
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
              <th className="p-3">Блок / Этаж</th>
              <th className="p-3">Активен</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="p-3">{w.name}</td>
                <td className="p-3">{w.warehouse_types?.name_ru || "—"}</td>
                <td className="p-3">{w.departments?.name || "—"}</td>
                <td className="p-3">{formatFloor(w.floor_id)}</td>
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
                      setEditing(w);
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
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
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
            <DialogTitle>{editing ? "Редактировать склад" : "Добавить склад"}</DialogTitle>
          </DialogHeader>
          <WarehouseEditForm
            key={editing?.id ?? "new"}
            warehouse={editing}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
