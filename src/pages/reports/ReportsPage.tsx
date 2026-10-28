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
import { startOfMonth, format } from "date-fns";
import DailyReportSummaryTab from "@/components/reports/DailyReportSummaryTab";
import DailyReportByDepartmentTab from "@/components/reports/DailyReportByDepartmentTab";
import FinanceServicesTab from "@/components/reports/FinanceServicesTab";
import CashInflowTab from "@/components/reports/CashInflowTab";
import AdvanceTab from "@/components/reports/AdvanceTab";
import DiscountReportTab from "@/components/reports/DiscountReportTab";
import TopServicesTab from "@/components/reports/TopServicesTab";
import PhysicianMonthlyTab from "@/components/reports/PhysicianMonthlyTab";

const defaultPeriod = (): PeriodState => ({
  period: "custom",
  customFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  customTo: format(new Date(), "yyyy-MM-dd"),
});

export default function ReportsPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod);

  const canViewDaily = hasAnyRole(["admin", "senior_manager", "finance"]);
  const canViewFinance = hasAnyRole(["finance"]);
  const { from, to } = getDateBounds(period);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Вы вышли из системы.");
    navigate("/login");
  };

  return (
    <div className={canViewDaily ? "min-h-screen flex flex-col bg-background" : "h-screen flex flex-col bg-background"}>
      <header className="h-14 flex items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Отчёты</span>
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

      <main className={canViewDaily ? "flex-1 p-6 space-y-8 overflow-y-auto" : "flex-1 p-6 pt-3 overflow-hidden flex flex-col"}>
        {!canViewDaily ? (
          <div className="text-sm text-muted-foreground">
            Отчёты для вашей роли недоступны.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-foreground">Дневной отчёт</h1>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="summary">Сводка</TabsTrigger>
                <TabsTrigger value="department">По отделениям</TabsTrigger>
                <TabsTrigger value="cash-inflow">Поступления денежных средств</TabsTrigger>
                <TabsTrigger value="advance">Аванс</TabsTrigger>
                <TabsTrigger value="discounts">Отчет скидок</TabsTrigger>
                <TabsTrigger value="operations" disabled>Операции</TabsTrigger>
                <TabsTrigger value="diagnostics" disabled>Диагностика и лаборатория</TabsTrigger>
                <TabsTrigger value="polyclinic" disabled>Поликлиника</TabsTrigger>
                <TabsTrigger value="physio" disabled>Физио/СПА</TabsTrigger>
                <TabsTrigger value="top-services">Топ услуг</TabsTrigger>
                <TabsTrigger value="patient-count" disabled>Количество пациентов</TabsTrigger>
                <TabsTrigger value="by-physician">По врачам</TabsTrigger>
                {canViewFinance && <TabsTrigger value="services">Услуги</TabsTrigger>}
              </TabsList>
              <TabsContent value="summary">
                <DailyReportSummaryTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="department">
                <DailyReportByDepartmentTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="cash-inflow">
                <CashInflowTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="advance">
                <AdvanceTab to={to} />
              </TabsContent>
              <TabsContent value="discounts">
                <DiscountReportTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="top-services">
                <TopServicesTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="by-physician">
                <PhysicianMonthlyTab from={from} to={to} />
              </TabsContent>
              {canViewFinance && (
                <TabsContent value="services" className="h-[70vh] min-h-0">
                  <FinanceServicesTab period={period} onPeriodChange={setPeriod} />
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
