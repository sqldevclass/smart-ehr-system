import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";

/* ───────────────────── Lookup (units / release_forms / packaging / product_types) ───────────────────── */
export function LookupSection({
  table,
  label,
  hasAbbr,
  showCode,
  scope,
}: {
  table: "units_of_measurement" | "release_forms" | "packaging_types" | "product_types";
  label: string;
  hasAbbr?: boolean;
  showCode?: boolean;
  scope: "pharmacy" | "warehouse";
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    id?: string;
    name_ru: string;
    abbreviation?: string | null;
    hospital_id?: string | null;
  }>({ name_ru: "", abbreviation: "" });

  const queryKey = [table, "list", user?.hospitalId, scope];
  const baseCols = ["id", "name_ru", "sort_order", "hospital_id"];
  if (hasAbbr) baseCols.push("abbreviation");
  if (showCode) baseCols.push("code");
  const selectCols = baseCols.join(", ");

  const { data: items = [] } = useQuery({
    queryKey,
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const q = supabase
        .from(table)
        .select(selectCols)
        .or(`hospital_id.is.null,hospital_id.eq.${user?.hospitalId ?? ""}`)
        .in("scope", [scope, "shared"])
        .order("sort_order")
        .order("name_ru");
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const payload: any = { name_ru: form.name_ru };
      if (hasAbbr) payload.abbreviation = form.abbreviation || null;
      if (form.id) {
        const { error } = await supabase.from(table).update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const code = user.hospitalId.slice(0, 8) + "_" + Date.now();
        const insertPayload: any = {
          ...payload,
          code,
          name_en: form.name_ru,
          hospital_id: user.hospitalId,
          scope,
        };
        const { error } = await supabase.from(table).insert(insertPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setOpen(false);
      setForm({ name_ru: "", abbreviation: "" });
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: [table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const colCount = 3 + (hasAbbr ? 1 : 0) + (showCode ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(o) => { setOpen(o); if (!o) setForm({ name_ru: "", abbreviation: "" }); }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ name_ru: "", abbreviation: "" })}>Add {label}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "Add"} {label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Название</Label>
                <Input value={form.name_ru} onChange={(e) => setForm({ ...form, name_ru: e.target.value })} />
              </div>
              {hasAbbr && (
                <div className="space-y-1.5">
                  <Label>Сокращенно</Label>
                  <Input
                    value={form.abbreviation || ""}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.name_ru.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3">Название</th>
              {hasAbbr && <th className="p-3">Сокращенно</th>}
              {showCode && <th className="p-3">Код</th>}
              <th className="p-3">Source</th>
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r: any) => {
              const isPlatform = r.hospital_id == null;
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.name_ru}</td>
                  {hasAbbr && <td className="p-3">{r.abbreviation || "—"}</td>}
                  {showCode && <td className="p-3">{r.code || "—"}</td>}
                  <td className="p-3">
                    {isPlatform ? <Badge variant="secondary">Platform</Badge> : <Badge>Hospital</Badge>}
                  </td>
                  <td className="p-3">
                    {!isPlatform && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setForm({
                              id: r.id,
                              name_ru: r.name_ru,
                              abbreviation: r.abbreviation ?? "",
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this row?")) deleteMutation.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="p-6 text-center text-muted-foreground">
                  No rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

