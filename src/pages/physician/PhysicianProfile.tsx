import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

const roleTitles: Record<string, string> = {
  admin: "Administrator",
  physician: "Physician",
  registrar: "Registrar",
  pharmacy_staff: "Pharmacy Staff",
  warehouse_staff: "Warehouse Staff",
};

export default function PhysicianProfile() {
  const { user, refreshUser } = useAuth();

  const { data: departments = [] } = useQuery({
    queryKey: ["profile-departments", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (!user) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const setDefaultDepartments = async (ids: string[]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ default_department_ids: ids } as any)
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
    } else {
      await refreshUser();
    }
  };

  const setDefaultMode = async (mode: "ambulatory" | "inpatient") => {
    const { error } = await supabase
      .from("profiles")
      .update({ default_dashboard_mode: mode } as any)
      .eq("id", user.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Default dashboard saved.");
      await refreshUser();
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <h2 className="font-heading text-xl font-bold text-foreground">My Profile</h2>
      <div className="rounded-lg border bg-card p-6 space-y-3 text-sm">
        <div>
          <p className="text-muted-foreground">Full Name</p>
          <p className="font-medium text-foreground">{user.fullName}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Role</p>
          <p className="font-medium text-foreground">{user.roles.map((r) => roleTitles[r] || r).join(", ")}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Hospital</p>
          <p className="font-medium text-foreground">{user.hospitalName}</p>
        </div>
      </div>

      {user.roles.includes("physician") && (
        <div className="rounded-lg border bg-card p-6 space-y-3 text-sm">
          <p className="font-medium text-foreground">Default Dashboard</p>
          <p className="text-muted-foreground">
            Which view to land on when you open your Physician dashboard.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDefaultMode("ambulatory")}
              className={
                user.defaultDashboardMode !== "inpatient"
                  ? "bg-black text-white border-black hover:bg-black/90 hover:text-white"
                  : undefined
              }
            >
              Outpatient
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDefaultMode("inpatient")}
              className={
                user.defaultDashboardMode === "inpatient"
                  ? "bg-black text-white border-black hover:bg-black/90 hover:text-white"
                  : undefined
              }
            >
              Inpatient
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-6 space-y-3 text-sm">
        <p className="font-medium text-foreground">Default Departments</p>
        <p className="text-muted-foreground">
          Which department's patients to show by default in the inpatient view. Pick one or more.
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              {user.defaultDepartmentIds.length > 0
                ? `${user.defaultDepartmentIds.length} selected`
                : "Select departments..."}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem
              checked={departments.length > 0 && user.defaultDepartmentIds.length === departments.length}
              onCheckedChange={(checked) =>
                setDefaultDepartments(checked ? departments.map((d: any) => d.id) : [])
              }
            >
              All departments
            </DropdownMenuCheckboxItem>
            {departments.map((d: any) => (
              <DropdownMenuCheckboxItem
                key={d.id}
                checked={user.defaultDepartmentIds.includes(d.id)}
                onCheckedChange={(checked) =>
                  setDefaultDepartments(
                    checked
                      ? [...user.defaultDepartmentIds, d.id]
                      : user.defaultDepartmentIds.filter((id) => id !== d.id),
                  )
                }
              >
                {d.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
