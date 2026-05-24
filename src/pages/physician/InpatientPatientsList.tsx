import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { format, differenceInDays } from "date-fns";

export default function InpatientPatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [nameSearch, setNameSearch] = useState("");
  const [idSearch, setIdSearch] = useState("");

  const { data: physician } = useQuery({
    queryKey: ["physician-dept", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id, department_id")
        .eq("profile_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-active", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  useEffect(() => {
    if (physician?.department_id && selectedDeptIds.length === 0) {
      setSelectedDeptIds([physician.department_id]);
    }
  }, [physician?.department_id]);

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
        <div className="flex items-center gap-3 mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Отделения ▼</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuCheckboxItem
                checked={selectedDeptIds.length === departments.length && departments.length > 0}
                onCheckedChange={(checked) =>
                  setSelectedDeptIds(checked
                    ? departments.map((d: any) => d.id)
                    : physician?.department_id ? [physician.department_id] : [])
                }
              >
                Все отделения
              </DropdownMenuCheckboxItem>
              {departments.map((d: any) => (
                <DropdownMenuCheckboxItem
                  key={d.id}
                  checked={selectedDeptIds.includes(d.id)}
                  onCheckedChange={(checked) =>
                    setSelectedDeptIds(prev =>
                      checked ? [...prev, d.id] : prev.filter(id => id !== d.id)
                    )
                  }
                >
                  {d.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Input
            placeholder="Поиск по ФИО..."
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            className="w-48"
          />
          <Input
            placeholder="Поиск по ID..."
            value={idSearch}
            onChange={e => setIdSearch(e.target.value)}
            className="w-36"
          />
        </div>

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
                  <TableRow key={h.id}>
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
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/physician/inpatient/${h.id}`)}>
                        View
                      </Button>
                    </TableCell>
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
