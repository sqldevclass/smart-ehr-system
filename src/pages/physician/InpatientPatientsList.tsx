import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, differenceInDays } from "date-fns";
import { useInpatientContext } from "@/contexts/InpatientContext";

export default function InpatientPatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedDeptIds, nameSearch, idSearch } = useInpatientContext();

  const { data: hospitalizations = [], isLoading } = useQuery({
    queryKey: ["inpatient-list", user?.hospitalId, selectedDeptIds],
    queryFn: async () => {
      if (!selectedDeptIds.length) return [];
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          department_id, primary_physician_id,
          departments!department_id(name),
          patients!inner(id, first_name, last_name, patient_number, date_of_birth),
          room_assignments(bed_number, rooms!inner(name))
        `)
        .eq("hospital_id", user!.hospitalId)
        .in("department_id", selectedDeptIds)
        .is("discharged_at", null)
        .order("admitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId && selectedDeptIds.length > 0,
  });

  const physicianIds = Array.from(new Set(
    hospitalizations.map((h: any) => h.primary_physician_id).filter(Boolean)
  ));

  const { data: physicianNames = [] } = useQuery({
    queryKey: ["inpatient-physician-names", physicianIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id, profiles!inner(full_name)")
        .in("id", physicianIds);
      return data || [];
    },
    enabled: physicianIds.length > 0,
  });

  const physMap: Record<string, string> = {};
  for (const p of physicianNames as any[]) {
    physMap[p.id] = p.profiles?.full_name ?? "—";
  }

  const filtered = hospitalizations.filter((h: any) => {
    const p = h.patients;
    const name = `${p.last_name} ${p.first_name}`.toLowerCase();
    const matchName = nameSearch ? name.includes(nameSearch.toLowerCase()) : true;
    const matchId = idSearch
      ? p.patient_number?.toLowerCase().includes(idSearch.toLowerCase())
      : true;
    return matchName && matchId;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Стационарные пациенты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !filtered.length ? (
          <p className="text-muted-foreground text-sm">Нет активных госпитализаций.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата поступления</TableHead>
                <TableHead>Отделение</TableHead>
                <TableHead>ФИО / Дата рождения</TableHead>
                <TableHead>№Палаты / Кровать</TableHead>
                <TableHead>Лечащий Врач</TableHead>
                <TableHead>Дней в стационаре</TableHead>
                <TableHead>ШРПУ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h: any) => {
                const p = h.patients;
                const ra = h.room_assignments?.[0];
                const days = differenceInDays(new Date(), new Date(h.admitted_at));
                return (
                  <TableRow
                    key={h.id}
                    onClick={() => navigate(`/physician/inpatient/${h.id}`)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell>{format(new Date(h.admitted_at), "dd.MM.yyyy")}</TableCell>
                    <TableCell>{h.departments?.name || "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p?.last_name} {p?.first_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p?.date_of_birth ? format(new Date(p.date_of_birth), "dd.MM.yyyy") : "—"}
                      </div>
                    </TableCell>
                    <TableCell>{ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}</TableCell>
                    <TableCell>{physMap[h.primary_physician_id] || "—"}</TableCell>
                    <TableCell>{days}</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
