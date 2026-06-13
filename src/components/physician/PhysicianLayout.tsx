import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { UserCircle, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import RoleSwitcher from "@/components/shared/RoleSwitcher";
import { InpatientProvider } from "@/contexts/InpatientContext";
import InpatientToolbox from "@/components/inpatient/InpatientToolbox";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Profile", url: "/physician/profile", icon: UserCircle },
];

type Mode = "ambulatory" | "inpatient";

type Mode = "ambulatory" | "inpatient";

function ModeSwitcher({ mode, switchMode }: { mode: Mode; switchMode: (m: Mode) => void }) {
  const { open } = useSidebar();
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1">
      <Button
        size="sm"
        variant={mode === "ambulatory" ? "default" : "outline"}
        onClick={() => switchMode("ambulatory")}
      >
        {open ? "Outpatient" : "OP"}
      </Button>
      <Button
        size="sm"
        variant={mode === "inpatient" ? "default" : "outline"}
        onClick={() => switchMode("inpatient")}
      >
        {open ? "Inpatient" : "IP"}
      </Button>
    </div>
  );
}

interface PhysicianOutletContext {
  setPatientContext: (node: React.ReactNode | null) => void;
}

export function usePhysicianLayoutContext() {
  return useOutletContext<PhysicianOutletContext>();
}

export default function PhysicianLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientContext, setPatientContext] = useState<React.ReactNode | null>(null);

  const [mode, setMode] = useState<Mode>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("physician_mode") : null;
    return (stored as Mode) || "ambulatory";
  });

  const isInpatient = location.pathname.startsWith("/physician/inpatient");

  const { data: physician } = useQuery({
    queryKey: ["layout-staff-role", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("person_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (!profile?.person_id) return null;
      const { data: staffRole } = await supabase
        .from("staff_roles")
        .select("id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", user!.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true)
        .maybeSingle();

      const { data: employment } = await supabase
        .from("employments")
        .select("department_id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", user!.hospitalId)
        .eq("employment_status", "active")
        .maybeSingle();

      return staffRole ? { id: staffRole.id, department_id: employment?.department_id ?? null } : null;
    },
  });

  useEffect(() => {
    if (location.pathname.startsWith("/physician/inpatient") && mode !== "inpatient") {
      setMode("inpatient");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out.");
    navigate("/login");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem("physician_mode", m);
    navigate(m === "ambulatory" ? "/physician" : "/physician/inpatient");
  };

  const content = (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Mode</SidebarGroupLabel>
              <SidebarGroupContent>
                <ModeSwitcher mode={mode} switchMode={switchMode} />

              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          className="hover:bg-sidebar-accent"
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        >
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={handleLogout} className="hover:bg-sidebar-accent cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SidebarTrigger />
              {user && (
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {user.hospitalName}
                </span>
              )}
              {patientContext && (
                <div className="flex items-center gap-2 text-sm border-l pl-3 shrink-0">
                  {patientContext}
                </div>
              )}
              {isInpatient && physician && user && (
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <InpatientToolbox
                    physicianId={physician.id}
                    hospitalId={user.hospitalId}
                  />
                </div>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground ml-auto shrink-0">
                <span>{user.fullName}</span>
                <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {user.roles.map((r) => roleTitles[r] || r).join(", ")}
                </span>
              </div>
            )}
          </header>
          <main className="flex-1 p-6">
            <Outlet context={{ setPatientContext } satisfies PhysicianOutletContext} />
          </main>

        </div>
      </div>
    </SidebarProvider>
  );

  return isInpatient ? <InpatientProvider>{content}</InpatientProvider> : content;
}
