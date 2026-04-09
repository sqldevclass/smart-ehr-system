import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const roles = [
  { value: "admin", label: "Admin" },
  { value: "physician", label: "Physician" },
  { value: "warehouse_staff", label: "Warehouse Staff" },
  { value: "pharmacy_staff", label: "Pharmacy Staff" },
  { value: "registrar", label: "Registrar" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  currentRole: string;
  fullName: string;
  onSuccess: () => void;
}

export default function ChangeRoleDialog({ open, onOpenChange, profileId, currentRole, fullName, onSuccess }: Props) {
  const [newRole, setNewRole] = useState(currentRole);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (newRole === currentRole) { onOpenChange(false); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
      if (error) { toast.error(error.message); return; }
      toast.success(`Role updated for ${fullName}`);
      onOpenChange(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Change Role — {fullName}</DialogTitle></DialogHeader>
        <div className="space-y-2 py-2">
          <Label>New Role</Label>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
