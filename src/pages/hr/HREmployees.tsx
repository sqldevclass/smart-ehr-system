import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import AddEmployeeDialog from "@/components/hr/AddEmployeeDialog";
import EmployeeDetail from "@/components/hr/EmployeeDetail";

export default function HREmployees() {
  const { user } = useAuth();
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showFormer, setShowFormer] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr-employees-list", user?.hospitalId, showFormer],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("persons")
        .select(`
          id, first_name, last_name, middle_name, gender,
          employments!inner(
            employee_number, employment_status,
            departments!department_id(name),
            job_titles!job_title_id(name)
          )
        `)
        .eq("hospital_id", user!.hospitalId)
        .in("employments.employment_status", showFormer ? ["fired", "released"] : ["active"])
        .order("last_name");
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        middle_name: p.middle_name,
        gender: p.gender,
        employee_number: p.employments?.[0]?.employee_number,
        employment_status: p.employments?.[0]?.employment_status,
        departments: p.employments?.[0]?.departments,
        job_titles: p.employments?.[0]?.job_titles,
      }));
    },
    enabled: !!user,
  });



  if (!user) return null;

  if (selectedEmployee) {
    return (
      <EmployeeDetail
        employeeId={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Сотрудники</h1>
          <p className="text-sm text-muted-foreground">Управление персоналом клиники.</p>
        </div>
        <div className="flex gap-2">
          {!showFormer && (
            <Button onClick={() => setAddOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" /> Добавить сотрудника
            </Button>
          )}
          <Button
            variant={showFormer ? "default" : "outline"}
            onClick={() => setShowFormer(!showFormer)}
            className="gap-1"
          >
            {showFormer ? "← Активные сотрудники" : "Бывшие сотрудники"}
          </Button>
        </div>
      </div>


      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Табельный №</TableHead>
              <TableHead>ФИО</TableHead>
              <TableHead>Должность</TableHead>
              <TableHead>Пол</TableHead>
              {showFormer && <TableHead>Статус</TableHead>}
              <TableHead>Отделение</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={showFormer ? 6 : 5} className="text-center text-muted-foreground py-8">Загрузка…</TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={showFormer ? 6 : 5} className="text-center text-muted-foreground py-8">Сотрудников нет</TableCell></TableRow>
            ) : employees.map((e: any) => (
              <TableRow
                key={e.id}
                onClick={() => setSelectedEmployee(e.id)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-mono text-xs">{e.employee_number}</TableCell>
                <TableCell className="font-medium">
                  {e.last_name} {e.first_name} {e.middle_name || ""}
                </TableCell>
                <TableCell>{e.job_titles?.name || "—"}</TableCell>
                <TableCell>{e.gender === "male" ? "Мужской" : e.gender === "female" ? "Женский" : "—"}</TableCell>
                {showFormer && (
                  <TableCell>
                    {e.employment_status === "fired" ? (
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Уволен
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        Освобождён
                      </span>
                    )}
                  </TableCell>
                )}
                <TableCell>{e.departments?.name || "—"}</TableCell>
              </TableRow>
            ))}

          </TableBody>
        </Table>
      </div>

      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(id) => setSelectedEmployee(id)}
      />
    </div>
  );
}
