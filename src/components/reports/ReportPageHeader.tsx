import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import RoleSwitcher from "@/components/shared/RoleSwitcher";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function ReportPageHeader({ title }: { title: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Вы вышли из системы.");
    navigate("/login");
  };

  return (
    <header className="h-14 flex items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {user && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user.fullName}</span>
          <RoleSwitcher roles={user.roleDetails} />
          <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Выйти">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}
    </header>
  );
}
