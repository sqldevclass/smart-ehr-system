import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function NurseProfile() {
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

  const setDefaultDepartments = async (ids: string[]) => {
    if (!user) return;
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

  return (
    <div className="max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Name:</span> {user?.fullName}</p>
          <p><span className="text-muted-foreground">Roles:</span> {user?.roles.join(", ")}</p>
          <p><span className="text-muted-foreground">Hospital:</span> {user?.hospitalName}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Departments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Which department's patients to show by default in the inpatient view. Pick one or more.
          </p>
          <div className="space-y-1 max-h-56 overflow-y-auto rounded-md border p-2">
            <label className="flex items-center gap-2 py-1 text-sm cursor-pointer">
              <Checkbox
                checked={departments.length > 0 && (user?.defaultDepartmentIds?.length ?? 0) === departments.length}
                onCheckedChange={(checked) =>
                  setDefaultDepartments(checked ? departments.map((d: any) => d.id) : [])
                }
              />
              <span className="font-medium">All departments</span>
            </label>
            {departments.map((d: any) => (
              <label key={d.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                <Checkbox
                  checked={user?.defaultDepartmentIds?.includes(d.id) ?? false}
                  onCheckedChange={(checked) =>
                    setDefaultDepartments(
                      checked
                        ? [...(user?.defaultDepartmentIds ?? []), d.id]
                        : (user?.defaultDepartmentIds ?? []).filter((id) => id !== d.id),
                    )
                  }
                />
                <span>{d.name}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
