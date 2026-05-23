import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Role {
  id: string;
  code: string;
  name_en: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function InviteStaffSheet({ open, onOpenChange, onSuccess }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCodes, setRoleCodes] = useState<Set<string>>(new Set());
  const [phone, setPhone] = useState("");
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingRoles(true);
    supabase
      .from("roles")
      .select("id, code, name_en")
      .order("code")
      .then(({ data }) => {
        setAllRoles((data as Role[]) ?? []);
        setLoadingRoles(false);
      });
  }, [open]);

  const reset = () => {
    setFullName(""); setEmail(""); setRoleCodes(new Set()); setPhone("");
  };

  const toggleRole = (code: string) => {
    setRoleCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || roleCodes.size === 0) {
      toast.error("Name, email and at least one role are required.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body: Record<string, unknown> = {
        email,
        full_name: fullName,
        role_codes: Array.from(roleCodes),
      };
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
            <Label>Roles *</Label>
            <div className="space-y-2 max-h-64 overflow-y-auto rounded-md border p-3">
              {loadingRoles ? (
                <p className="text-sm text-muted-foreground">Loading roles…</p>
              ) : allRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles available.</p>
              ) : (
                allRoles.map((r) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`inv-role-${r.id}`}
                      checked={roleCodes.has(r.code)}
                      onCheckedChange={() => toggleRole(r.code)}
                    />
                    <Label htmlFor={`inv-role-${r.id}`} className="cursor-pointer font-normal">
                      {r.name_en || r.code.replace(/_/g, " ")}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>
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
