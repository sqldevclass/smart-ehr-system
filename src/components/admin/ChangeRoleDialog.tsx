import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Role {
  id: string;
  code: string;
  name: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  currentRoles: string[];
  fullName: string;
  onSuccess: () => void;
}

export default function ChangeRoleDialog({ open, onOpenChange, profileId, currentRoles, fullName, onSuccess }: Props) {
  const { user } = useAuth();
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentRoles));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(currentRoles));
    setLoading(true);
    supabase
      .from("roles")
      .select("id, code, name")
      .order("code")
      .then(({ data }) => {
        setAllRoles((data as Role[]) ?? []);
        setLoading(false);
      });
  }, [open, currentRoles]);

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", profileId)
        .eq("hospital_id", user.hospitalId);
      if (delErr) { toast.error(delErr.message); return; }

      const selectedCodes = Array.from(selected);
      if (selectedCodes.length > 0) {
        const chosenRoles = allRoles.filter((r) => selectedCodes.includes(r.code));
        const rows = chosenRoles.map((r) => ({
          user_id: profileId,
          role_id: r.id,
          hospital_id: user.hospitalId,
        }));
        const { error: insErr } = await supabase.from("user_roles").insert(rows);
        if (insErr) { toast.error(insErr.message); return; }
      }

      toast.success(`Roles updated for ${fullName}`);
      onOpenChange(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Change Roles — {fullName}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading roles…</p>
          ) : allRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles available.</p>
          ) : (
            allRoles.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <Checkbox
                  id={`role-${r.id}`}
                  checked={selected.has(r.code)}
                  onCheckedChange={() => toggle(r.code)}
                />
                <Label htmlFor={`role-${r.id}`} className="cursor-pointer">
                  {r.name || r.code.replace(/_/g, " ")}
                </Label>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
