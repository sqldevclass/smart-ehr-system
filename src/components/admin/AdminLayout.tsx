import { Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Building2, Wrench, Stethoscope, FileText, UserCircle, LogOut, DoorOpen, ShieldCheck, Warehouse } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import RoleSwitcher from "@/components/shared/RoleSwitcher";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard },
  { title: "User Management", url: "/admin/users", icon: Users },
  { title: "Departments", url: "/admin/departments", icon: Building2 },
  { title: "Services", url: "/admin/services", icon: Wrench },
  { title: "Physicians", url: "/admin/physicians", icon: Stethoscope },
  { title: "Rooms", url: "/admin/rooms", icon: DoorOpen },
  { title: "Склады", url: "/admin/warehouses", icon: Warehouse },
  { title: "Physician Privileges", url: "/admin/physician-privileges", icon: ShieldCheck },
  { title: "Audit Log", url: "/admin/audit", icon: FileText },
  { title: "Profile", url: "/admin/profile", icon: UserCircle },
];


export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out.");
    navigate("/login");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink to={item.url} end className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
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
              {user && <span className="text-sm font-semibold text-foreground">{user.hospitalName}</span>}
            </div>
            {user && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{user.fullName}</span>
                <RoleSwitcher roles={user.roles} />
              </div>
            )}
          </header>
          <main className="flex-1 p-6"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
