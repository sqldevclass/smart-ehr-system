import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function DailyReportPlanDialog({
  open,
  onOpenChange,
  serviceTypes,
  year,
  month,
  existingPlans,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serviceTypes: { id: string; name_ru: string; code: string }[];
  year: number;
  month: number;
  existingPlans: Record<string, number>;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      serviceTypes.forEach((t) => {
        initial[t.id] = existingPlans[t.id] ? String(existingPlans[t.id]) : "";
      });
      setValues(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const rows = serviceTypes
        .filter((t) => values[t.id] && Number(values[t.id]) >= 0)
        .map((t) => ({
          hospital_id: user.hospitalId,
          service_type_id: t.id,
          year,
          month,
          planned_revenue: Number(values[t.id]),
          created_by: user.id,
        }));
      if (rows.length === 0) {
        onOpenChange(false);
        return;
      }
      const { error } = await supabase
        .from("service_type_revenue_plans")
        .upsert(rows as any, { onConflict: "hospital_id,service_type_id,year,month" });
      if (error) throw error;
      toast.success("Plan saved.");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save plan.");
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set Revenue Plan — {monthLabel}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Planned Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceTypes.filter((t) => t.code !== "test").map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name_ru}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      value={values[t.id] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      className="h-8 text-right"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
