import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, LogOut } from "lucide-react";
import { toast } from "sonner";

interface UserInfo {
  fullName: string;
  role: string;
  hospitalName: string;
}

const roleTitles: Record<string, string> = {
  admin: "Administrator",
  physician: "Physician",
  registrar: "Registrar",
  pharmacy_staff: "Pharmacy Staff",
  warehouse_staff: "Warehouse Staff",
};

const DashboardPlaceholder = ({ expectedRole }: { expectedRole: string }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, hospital_id")
        .eq("id", session.user.id)
        .single();

      if (!profile) return;

      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("roles(code)")
        .eq("user_id", session.user.id);

      const roles = (userRoles ?? [])
        .map((ur: any) => ur.roles?.code)
        .filter(Boolean) as string[];

      const { data: hospital } = await supabase
        .from("hospitals")
        .select("name")
        .eq("id", profile.hospital_id)
        .single();

      setUser({
        fullName: profile.full_name || "Unknown",
        role: roles[0] || "",
        hospitalName: hospital?.name || "Unknown Hospital",
      });
    };
    load();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out.");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            {roleTitles[expectedRole] || expectedRole} Dashboard
          </h1>
          {user && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p><span className="font-medium text-foreground">{user.fullName}</span></p>
              <p>{user.hospitalName}</p>
              <p className="capitalize">{roleTitles[user.role] || user.role}</p>
            </div>
          )}
          <Button variant="outline" onClick={handleLogout} className="mt-4 gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPlaceholder;
