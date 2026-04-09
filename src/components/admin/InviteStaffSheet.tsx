import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onSuccess: () => void;
}

export default function InviteStaffSheet({ open, onOpenChange, onSuccess }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setFullName(""); setEmail(""); setRole(""); setSpecialization(""); setPhone(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !role) return;
    if (role === "physician" && !specialization) {
      toast.error("Specialization is required for physicians.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, string> = {
        email,
        full_name: fullName,
        role,
      };
      if (role === "physician") body.specialization = specialization;
      if (phone) body.phone = phone;

      const { data, error } = await supabase.functions.invoke("invite-staff-user", {
        body,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to send invitation.");
        return;
      }

      toast.success(`Invitation sent to ${email}`);
      reset();
      onOpenChange(false);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Invite Staff Member</SheetTitle></SheetHeader>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-name">Full Name *</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">Email *</Label>
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Role *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {role === "physician" && (
            <div className="space-y-2">
              <Label htmlFor="inv-spec">Specialization *</Label>
              <Input id="inv-spec" value={specialization} onChange={(e) => setSpecialization(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="inv-phone">Phone</Label>
            <Input id="inv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Sending…" : "Send Invitation"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
