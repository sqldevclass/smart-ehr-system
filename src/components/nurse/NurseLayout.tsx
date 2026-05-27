import { useState } from "react";
import { Outlet, useNavigate, useLocation, useOutletContext } from "react-router-dom";
import { Users, UserCircle, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { NurseProvider } from "@/contexts/NurseContext";
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
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Пациенты", url: "/nurse", icon: Users },
  { title: "Профиль", url: "/nurse/profile", icon: UserCircle },
];

const roleTitles: Record<string, string> = {
  admin: "Administrator",
  inpatient_nurse: "Медсестра",
  head_nurse: "Старшая медсестра",
};

interface NurseOutletContext {
  setPatientContext: (node: React.ReactNode | null) => void;
}

export function useNurseLayoutContext() {
  return useOutletContext<NurseOutletContext>();
}

export default function NurseLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientContext, setPatientContext] = useState<React.ReactNode | null>(null);

  const isDetailPage = /^\/nurse\/[^/]+$/.test(location.pathname) &&
    location.pathname !== "/nurse/profile";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Вы вышли.");
    navigate("/login");
  };

  return (
    <NurseProvider>
      <SidebarProvider defaultOpen={false}>
        <div className="min-h-screen flex w-full">
          <Sidebar collapsible="icon">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Меню</SidebarGroupLabel>
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
                        <span>Выйти</span>
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
                {patientContext && isDetailPage && (
                  <div className="flex items-center gap-2 text-sm border-l pl-3 min-w-0 shrink-0">
                    {patientContext}
                  </div>
                )}
                {user && (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <InpatientToolbox
                      physicianId=""
                      hospitalId={user.hospitalId}
                      showRecentPatients={false}
                      listPath="/nurse"
                      detailPathPrefix="/nurse/"
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
              <Outlet context={{ setPatientContext } satisfies NurseOutletContext} />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </NurseProvider>
  );
}
