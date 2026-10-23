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
import RegistrationSourceTab from "@/components/reports/RegistrationSourceTab";
import MortalityTab from "@/components/reports/MortalityTab";
import ReadmissionTab from "@/components/reports/ReadmissionTab";
import VteTab from "@/components/reports/VteTab";
import AlosTab from "@/components/reports/AlosTab";
import CensusTab from "@/components/reports/CensusTab";
import SurgicalVolumeTab from "@/components/reports/SurgicalVolumeTab";
import TopDiagnosesTab from "@/components/reports/TopDiagnosesTab";
import SafetyTab from "@/components/reports/SafetyTab";
import AntibioticTimeoutTab from "@/components/reports/AntibioticTimeoutTab";
import CriticalLabValuesTab from "@/components/reports/CriticalLabValuesTab";
import DailyNotesTab from "@/components/reports/DailyNotesTab";
import WoundInfectionTab from "@/components/reports/WoundInfectionTab";
import IcuTransfersTab from "@/components/reports/IcuTransfersTab";
import DiagnosisDiscrepancyTab from "@/components/reports/DiagnosisDiscrepancyTab";

const defaultPeriod = (): PeriodState => ({
  period: "custom",
  customFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  customTo: format(new Date(), "yyyy-MM-dd"),
});

export default function QualityReportsPage() {
  const { user, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodState>(defaultPeriod);

  const canView = hasAnyRole(["admin", "senior_manager", "finance"]);
  const { from, to } = getDateBounds(period);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Вы вышли из системы.");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-14 flex items-center justify-between border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">Отчёты по качеству</span>
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

      <main className="flex-1 p-6 space-y-8 overflow-y-auto">
        {!canView ? (
          <div className="text-sm text-muted-foreground">
            Отчёты для вашей роли недоступны.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-foreground">Отчёты по качеству</h1>
              <PeriodFilter value={period} onChange={setPeriod} />
            </div>

            <Tabs defaultValue="census" className="w-full">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="census">Госпитализация</TabsTrigger>
                <TabsTrigger value="acquisition">Источник привлечения</TabsTrigger>
                <TabsTrigger value="mortality">Летальность</TabsTrigger>
                <TabsTrigger value="readmissions">Повторные госпитализации</TabsTrigger>
                <TabsTrigger value="vte">ВТЭО</TabsTrigger>
                <TabsTrigger value="alos">Средний срок госпитализации</TabsTrigger>
                <TabsTrigger value="surgical-volume">Объём операций</TabsTrigger>
                <TabsTrigger value="diagnoses">Диагнозы</TabsTrigger>
                <TabsTrigger value="daily-notes">Дневниковые записи</TabsTrigger>
                <TabsTrigger value="safety">Побочные эффекты анестезии</TabsTrigger>
                <TabsTrigger value="antibiotic-timeout">Антибиотикопрофилактика</TabsTrigger>
                <TabsTrigger value="wound-infection">Частота инфекции</TabsTrigger>
                <TabsTrigger value="critical-lab">Критические лабораторные показатели</TabsTrigger>
                <TabsTrigger value="icu-transfers">Перевод в реанимацию</TabsTrigger>
                <TabsTrigger value="diagnosis-discrepancy">Расхождение диагнозов</TabsTrigger>
              </TabsList>
              <TabsContent value="census">
                <CensusTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="acquisition">
                <RegistrationSourceTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="mortality">
                <MortalityTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="readmissions">
                <ReadmissionTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="vte">
                <VteTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="alos">
                <AlosTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="surgical-volume">
                <SurgicalVolumeTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="diagnoses">
                <TopDiagnosesTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="daily-notes">
                <DailyNotesTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="safety">
                <SafetyTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="antibiotic-timeout">
                <AntibioticTimeoutTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="wound-infection">
                <WoundInfectionTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="critical-lab">
                <CriticalLabValuesTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="icu-transfers">
                <IcuTransfersTab from={from} to={to} />
              </TabsContent>
              <TabsContent value="diagnosis-discrepancy">
                <DiagnosisDiscrepancyTab from={from} to={to} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
