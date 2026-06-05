import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Search, User } from "lucide-react";

interface Role {
  id: string;
  code: string;
  name_en: string | null;
}

interface EligibleEmployee {
  id: string;
  employee_number: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  email: string;
  job_titles: { name: string } | null;
  departments: { name: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function InviteStaffSheet({ open, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EligibleEmployee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EligibleEmployee | null>(null);
  const [search, setSearch] = useState("");
  const [roleCodes, setRoleCodes] = useState<Set<string>>(new Set());
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setSelectedEmployee(null);
    setRoleCodes(new Set());
    setSearch("");

    Promise.all([
      supabase
        .from("employees")
        .select(`
          id, employee_number, first_name, last_name, middle_name, email,
          job_titles!job_title_id(name),
          departments!department_id(name)
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .not("email", "is", null)
        .is("profile_id", null)
        .order("last_name"),

      supabase
        .from("roles")
        .select("id, code, name_en")
        .order("code"),

      supabase
        .from("staff_invitations")
        .select("employee_id")
        .eq("hospital_id", user.hospitalId)
        .eq("status", "pending")
        .not("employee_id", "is", null),
    ]).then(([empRes, rolesRes, pendingRes]) => {
      const pendingIds = new Set(
        (pendingRes.data ?? []).map((i: any) => i.employee_id)
      );
      const eligible = (empRes.data ?? []).filter(
        (e: any) => !pendingIds.has(e.id)
      );
      setEmployees(eligible as EligibleEmployee[]);
      setAllRoles((rolesRes.data as Role[]) ?? []);
      setLoading(false);
    });
  }, [open, user]);

  const toggleRole = (code: string) => {
    setRoleCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const filtered = employees.filter((e) => {
    const full = `${e.last_name} ${e.first_name} ${e.middle_name ?? ""} ${e.email}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const handleSubmit = async () => {
    if (!selectedEmployee) { toast.error("Select an employee first."); return; }
    if (roleCodes.size === 0) { toast.error("Select at least one role."); return; }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("invite-staff-user", {
        body: {
          employee_id: selectedEmployee.id,
          role_codes: Array.from(roleCodes),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to send invitation.");
        return;
      }

      toast.success(`Invitation sent to ${selectedEmployee.email}`);
      onOpenChange(false);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Invite Staff Member</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {!selectedEmployee ? (
            <>
              <p className="text-sm text-muted-foreground">
                Select an employee to invite. Only employees without a system account are shown.
              </p>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No eligible employees found.</p>
              ) : (
                <div className="rounded-md border divide-y max-h-[60vh] overflow-y-auto">
                  {filtered.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelectedEmployee(e)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-medium text-sm">
                        {e.last_name} {e.first_name} {e.middle_name ?? ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.email}
                        {e.job_titles?.name && (
                          <span> · {e.job_titles.name}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">
                    {selectedEmployee.last_name} {selectedEmployee.first_name} {selectedEmployee.middle_name ?? ""}
                  </div>
                  <div className="text-xs text-muted-foreground">{selectedEmployee.email}</div>
                  {selectedEmployee.job_titles?.name && (
                    <div className="text-xs text-muted-foreground">{selectedEmployee.job_titles.name}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedEmployee(null); setRoleCodes(new Set()); }}
                >
                  Change
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Roles *</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-md border p-3">
                  {allRoles.map((r) => (
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
                  ))}
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send Invitation"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
