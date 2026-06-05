import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  profile_id?: string | null;
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

  const [newEmployees, setNewEmployees] = useState<EligibleEmployee[]>([]);
  const [selectedNew, setSelectedNew] = useState<EligibleEmployee | null>(null);
  const [searchNew, setSearchNew] = useState("");

  const [reactivateEmployees, setReactivateEmployees] = useState<EligibleEmployee[]>([]);
  const [selectedReactivate, setSelectedReactivate] = useState<EligibleEmployee | null>(null);
  const [searchReactivate, setSearchReactivate] = useState("");

  const [roleCodes, setRoleCodes] = useState<Set<string>>(new Set());
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("invite");

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    setSelectedNew(null);
    setSelectedReactivate(null);
    setRoleCodes(new Set());
    setSearchNew("");
    setSearchReactivate("");
    setActiveTab("invite");

    Promise.all([
      supabase
        .from("employees")
        .select(`id, employee_number, first_name, last_name, middle_name, email,
          job_titles!job_title_id(name), departments!department_id(name)`)
        .eq("hospital_id", user.hospitalId)
        .eq("employment_status", "active")
        .not("email", "is", null)
        .is("profile_id", null)
        .order("last_name"),

      supabase
        .from("employees")
        .select(`id, employee_number, first_name, last_name, middle_name, email,
          profile_id, job_titles!job_title_id(name), departments!department_id(name)`)
        .eq("hospital_id", user.hospitalId)
        .eq("employment_status", "active")
        .not("email", "is", null)
        .not("profile_id", "is", null)
        .order("last_name"),

      supabase.from("roles").select("id, code, name_en").order("code"),

      supabase
        .from("staff_invitations")
        .select("employee_id")
        .eq("hospital_id", user.hospitalId)
        .eq("status", "pending")
        .not("employee_id", "is", null),
    ]).then(async ([newRes, reactRes, rolesRes, pendingRes]) => {
      const pendingIds = new Set(
        (pendingRes.data ?? []).map((i: any) => i.employee_id)
      );

      const eligible = (newRes.data ?? []).filter(
        (e: any) => !pendingIds.has(e.id)
      );
      setNewEmployees(eligible as EligibleEmployee[]);

      const reactCandidates = (reactRes.data ?? []).filter(
        (e: any) => !pendingIds.has(e.id)
      );

      if (reactCandidates.length > 0) {
        const profileIds = reactCandidates.map((e: any) => e.profile_id);
        const { data: inactiveProfiles } = await supabase
          .from("profiles")
          .select("id")
          .in("id", profileIds)
          .eq("is_active", false);

        const inactiveIds = new Set((inactiveProfiles ?? []).map((p: any) => p.id));
        const reactivatable = reactCandidates.filter(
          (e: any) => inactiveIds.has(e.profile_id)
        );
        setReactivateEmployees(reactivatable as EligibleEmployee[]);
      } else {
        setReactivateEmployees([]);
      }

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

  const filteredNew = newEmployees.filter((e) =>
    `${e.last_name} ${e.first_name} ${e.middle_name ?? ""} ${e.email}`
      .toLowerCase()
      .includes(searchNew.toLowerCase())
  );

  const filteredReactivate = reactivateEmployees.filter((e) =>
    `${e.last_name} ${e.first_name} ${e.middle_name ?? ""} ${e.email}`
      .toLowerCase()
      .includes(searchReactivate.toLowerCase())
  );

  const selectedEmployee = activeTab === "invite" ? selectedNew : selectedReactivate;

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
        toast.error(data?.error || error?.message || "Failed to send.");
        return;
      }

      toast.success(
        activeTab === "reactivate"
          ? `Re-activation email sent to ${selectedEmployee.email}`
          : `Invitation sent to ${selectedEmployee.email}`
      );
      onOpenChange(false);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  const EmployeeCard = ({ e, onClear }: { e: EligibleEmployee; onClear: () => void }) => (
    <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
      <User className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {e.last_name} {e.first_name} {e.middle_name ?? ""}
        </div>
        <p className="text-xs text-muted-foreground truncate">{e.email}</p>
        {e.job_titles?.name && (
          <p className="text-xs text-muted-foreground">{e.job_titles.name}</p>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => { onClear(); setRoleCodes(new Set()); }}>
        Change
      </Button>
    </div>
  );

  const EmployeeList = ({
    employees, search, onSearch, onSelect, emptyText,
  }: {
    employees: EligibleEmployee[];
    search: string;
    onSearch: (v: string) => void;
    onSelect: (e: EligibleEmployee) => void;
    emptyText: string;
  }) => (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(ev) => onSearch(ev.target.value)}
          className="pl-9"
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{emptyText}</p>
      ) : (
        <div className="rounded-md border divide-y max-h-[360px] overflow-y-auto">
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e)}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <div className="font-medium text-sm">
                {e.last_name} {e.first_name} {e.middle_name ?? ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {e.email}
                {e.job_titles?.name && <> · {e.job_titles.name}</>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const RolePicker = () => (
    <div className="space-y-2">
      <Label>Roles *</Label>
      <div className="grid grid-cols-2 gap-2 rounded-md border p-3 max-h-[260px] overflow-y-auto">
        {allRoles.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={roleCodes.has(r.code)}
              onCheckedChange={() => toggleRole(r.code)}
            />
            <span>{r.name_en || r.code.replace(/_/g, " ")}</span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Staff Access</SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={(v) => {
            setActiveTab(v);
            setSelectedNew(null);
            setSelectedReactivate(null);
            setRoleCodes(new Set());
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="invite" className="gap-2">
                Invite
                {newEmployees.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {newEmployees.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="reactivate" className="gap-2">
                Re-activate
                {reactivateEmployees.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {reactivateEmployees.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="invite" className="mt-4 space-y-4">
              {!selectedNew ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Employees without a system account.
                  </p>
                  <EmployeeList
                    employees={filteredNew}
                    search={searchNew}
                    onSearch={setSearchNew}
                    onSelect={setSelectedNew}
                    emptyText="No eligible employees. HR must add the employee first."
                  />
                </>
              ) : (
                <>
                  <EmployeeCard e={selectedNew} onClear={() => setSelectedNew(null)} />
                  <RolePicker />
                  <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Sending…" : "Send Invitation"}
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="reactivate" className="mt-4 space-y-4">
              {!selectedReactivate ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Former staff re-activated by HR and ready to regain access.
                  </p>
                  <EmployeeList
                    employees={filteredReactivate}
                    search={searchReactivate}
                    onSearch={setSearchReactivate}
                    onSelect={setSelectedReactivate}
                    emptyText="No employees to re-activate."
                  />
                </>
              ) : (
                <>
                  <EmployeeCard e={selectedReactivate} onClear={() => setSelectedReactivate(null)} />
                  <RolePicker />
                  <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                    {submitting ? "Sending…" : "Send Re-activation Email"}
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
