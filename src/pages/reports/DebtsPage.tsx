import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ReportPageHeader from "@/components/reports/ReportPageHeader";
import DebtTab from "@/components/reports/DebtTab";

export default function DebtsPage() {
  const { hasAnyRole } = useAuth();
  const canView = hasAnyRole(["admin", "senior_manager", "finance"]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <ReportPageHeader title="Долг" />
      <main className="flex-1 p-6 space-y-8 overflow-y-auto">
        {!canView ? (
          <div className="text-sm text-muted-foreground">Отчёты для вашей роли недоступны.</div>
        ) : (
          <Tabs defaultValue="debts" className="w-full">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="debts">Долг</TabsTrigger>
            </TabsList>
            <TabsContent value="debts">
              <DebtTab />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
