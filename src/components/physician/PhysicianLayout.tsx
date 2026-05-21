import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, useOutletContext } from "react-router-dom";

import { CalendarDays, UserCircle, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
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
} from "@/components/ui/sidebar";

const navItems = [
  { title: "My Schedule", url: "/physician", icon: CalendarDays },
  { title: "Profile", url: "/physician/profile", icon: UserCircle },
];

const roleTitles: Record<string, string> = {
  admin: "Administrator",
  physician: "Physician",
  registrar: "Registrar",
  pharmacy_staff: "Pharmacy Staff",
  warehouse_staff: "Warehouse Staff",
};

type Mode = "ambulatory" | "inpatient";

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


  // Sync mode from URL on initial load
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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Mode</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="flex flex-col gap-1.5 px-2 py-1">
                  <Button
                    size="sm"
                    variant={mode === "ambulatory" ? "default" : "outline"}
                    onClick={() => switchMode("ambulatory")}
                  >
                    Ambulatory
                  </Button>
                  <Button
                    size="sm"
                    variant={mode === "inpatient" ? "default" : "outline"}
                    onClick={() => switchMode("inpatient")}
                  >
                    Inpatient
                  </Button>
                </div>
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
          <header className="h-14 flex items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              {user && (
                <span className="text-sm font-semibold text-foreground">
                  {user.hospitalName}
                </span>
              )}
              {patientContext && (
                <>
                  <span className="text-muted-foreground">&nbsp;|&nbsp;</span>
                  {patientContext}
                </>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
}
