import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDiscounts } from "@/hooks/useDiscounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function DiscountsManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: discounts = [], isLoading, error } = useDiscounts();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [errors, setErrors] = useState<{ name?: string; percent?: string }>({});
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["finance-discount-list", user?.hospitalId] });

  const create = useMutation({
    mutationFn: async (values: { name: string; percent: number }) => {
      if (!user) throw new Error("Please sign in.");
      const { error } = await supabase.from("discounts").insert({
        hospital_id: user.hospitalId, ...values, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Discount created.");
      setOpen(false);
      invalidate();
    },
    onError: (error: { code?: string; message: string }) => toast.error(
      error.code === "23505" ? "A discount with this name already exists." : error.message,
    ),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!user) throw new Error("Please sign in.");
      const { error } = await supabase.from("discounts").update({ is_active: active })
        .eq("id", id).eq("hospital_id", user.hospitalId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const numericPercent = Number(percent);
    if (!name.trim()) nextErrors.name = "Enter a name.";
    if (!/^\d+(?:\.\d{1,2})?$/.test(percent.trim()) || !Number.isFinite(numericPercent) || numericPercent <= 0 || numericPercent > 100) {
      nextErrors.percent = "Percent must be greater than 0 and at most 100, with up to 2 decimals.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) create.mutate({ name: name.trim(), percent: numericPercent });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold text-foreground">Discount list</h2>
        <Button size="sm" className="gap-1" onClick={() => { setName(""); setPercent(""); setErrors({}); setOpen(true); }}>
          <Plus className="h-4 w-4" /> New discount
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error.message}</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead className="text-right">Percent</TableHead>
            <TableHead>Status</TableHead><TableHead className="w-20">Active</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading || discounts.length === 0 ? <TableRow><TableCell colSpan={4} className="text-muted-foreground">
              {isLoading ? "Loading…" : "No discounts yet."}
            </TableCell></TableRow> : discounts.map((discount) => <TableRow key={discount.id}>
              <TableCell className="font-medium">{discount.name}</TableCell>
              <TableCell className="text-right">{Number(discount.percent).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</TableCell>
              <TableCell><Badge variant={discount.is_active ? "default" : "secondary"}>{discount.is_active ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell><Switch aria-label={`Active: ${discount.name}`} checked={discount.is_active} disabled={toggle.isPending}
                onCheckedChange={(active) => toggle.mutate({ id: discount.id, active })} /></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={(value) => { if (!create.isPending) setOpen(value); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New discount</DialogTitle><DialogDescription>Name and percent cannot be changed after saving.</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="discount-name">Name</Label>
              <Input id="discount-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!!errors.name} disabled={create.isPending} />
              {errors.name && <p role="alert" className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount-percent">Percent</Label>
              <Input id="discount-percent" type="number" min="0.01" max="100" step="0.01" value={percent} onChange={(event) => setPercent(event.target.value)} aria-invalid={!!errors.percent} disabled={create.isPending} />
              {errors.percent && <p role="alert" className="text-sm text-destructive">{errors.percent}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={create.isPending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}