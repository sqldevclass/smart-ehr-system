import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PeriodFilter, PeriodState, getDateBounds } from "@/components/shared/PeriodFilter";
import RoleSwitcher from "@/components/shared/RoleSwitcher";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";
import DailyReportSummaryTab from "@/components/reports/DailyReportSummaryTab";
import DailyReportByDepartmentTab from "@/components/reports/DailyReportByDepartmentTab";

export default function ReportsPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodState>({ period: "today" });

  const canViewDaily = hasAnyRole(["admin", "senior_manager"]);
  const { from, to } = getDateBounds(period);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out.");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 flex items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Reports</span>
        </div>
        {user && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{user.fullName}</span>
            <RoleSwitcher roles={user.roleDetails} />
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>

      <main className="flex-1 p-6">
        {!canViewDaily ? (
          <div className="text-sm text-muted-foreground">
            No reports are available for your role yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-foreground">Daily Report</h1>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="department">By Department</TabsTrigger>
                <TabsTrigger value="operations" disabled>Operations</TabsTrigger>
                <TabsTrigger value="diagnostics" disabled>Diagnostics &amp; Lab</TabsTrigger>
                <TabsTrigger value="polyclinic" disabled>Polyclinic</TabsTrigger>
                <TabsTrigger value="physio" disabled>Physio/SPA</TabsTrigger>
                <TabsTrigger value="top-services" disabled>Top Services</TabsTrigger>
                <TabsTrigger value="patient-count" disabled>Patient Count</TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                <DailyReportSummaryTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="department">
                <DailyReportByDepartmentTab from={from} to={to} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
