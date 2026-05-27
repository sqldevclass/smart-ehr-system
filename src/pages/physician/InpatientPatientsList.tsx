import { useState } from "react";
import { useEWSSchedule } from "@/hooks/useEWSSchedule";
import EWSStatusDot from "@/components/ews/EWSStatusDot";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { UserCheck } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useInpatientContext } from "@/contexts/InpatientContext";
import { cn } from "@/lib/utils";

export default function InpatientPatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedDeptIds, nameSearch, idSearch } = useInpatientContext();
  const { physicianId: currentPhysicianId } = usePhysicianId();

  const { getStatus, scheduleMap } = useEWSSchedule(user?.hospitalId);

  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [physicianSearch, setPhysicianSearch] = useState("");

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

  const { data: allPhysicians = [] } = useQuery({
    queryKey: ["inpatient-all-physicians", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id, profiles!inner(full_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const filteredPhysicians = (allPhysicians as any[])
    .filter((p: any) =>
      p.profiles?.full_name
        .toLowerCase()
        .includes(physicianSearch.toLowerCase())
    ).slice(0, 10);

  const handleAssignPhysician = async (hospId: string, physicianId: string) => {
    const { error } = await supabase
      .from("hospitalizations")
      .update({ primary_physician_id: physicianId })
      .eq("id", hospId);
    if (error) return;
    queryClient.invalidateQueries({ queryKey: ["inpatient-list"] });
    setOpenPopoverId(null);
    setPhysicianSearch("");
  };

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
                const hasPhysician = !!h.primary_physician_id;

                const cells = (
                  <>
                    <TableCell>{format(new Date(h.admitted_at), "dd.MM.yyyy")}</TableCell>
                    <TableCell>{h.departments?.name || "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{p?.last_name} {p?.first_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p?.date_of_birth ? format(new Date(p.date_of_birth), "dd.MM.yyyy") : "—"}
                      </div>
                    </TableCell>
                    <TableCell>{ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Popover
                        open={openPopoverId === h.id}
                        onOpenChange={(open) => {
                          setOpenPopoverId(open ? h.id : null);
                          setPhysicianSearch("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          {physMap[h.primary_physician_id] ? (
                            <button className="text-sm font-medium text-primary hover:underline">
                              {physMap[h.primary_physician_id]}
                            </button>
                          ) : (
                            <button className="text-sm text-muted-foreground hover:text-primary">
                              — Назначить
                            </button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="start">
                          <div className="space-y-2">
                            {currentPhysicianId && h.primary_physician_id !== currentPhysicianId && (
                              <button
                                onClick={() => handleAssignPhysician(h.id, currentPhysicianId)}
                                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted flex items-center gap-2 text-primary font-medium"
                              >
                                <UserCheck className="h-4 w-4" />
                                Назначить себя
                              </button>
                            )}
                            <Input
                              placeholder="Поиск врача..."
                              value={physicianSearch}
                              onChange={(e) => setPhysicianSearch(e.target.value)}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {filteredPhysicians.map((ph: any) => (
                                <button
                                  key={ph.id}
                                  onClick={() => handleAssignPhysician(h.id, ph.id)}
                                  className={cn(
                                    "w-full text-left px-3 py-2 text-sm rounded hover:bg-muted",
                                    ph.id === h.primary_physician_id && "bg-muted font-medium"
                                  )}
                                >
                                  {ph.profiles?.full_name}
                                </button>
                              ))}
                              {filteredPhysicians.length === 0 && (
                                <p className="text-xs text-muted-foreground px-3 py-2">
                                  Не найдено
                                </p>
                              )}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell>{days}</TableCell>
                    <TableCell>
                      <EWSStatusDot
                        status={getStatus(h.id)}
                        score={scheduleMap[h.id]?.last_score}
                      />
                    </TableCell>
                  </>
                );

                if (!hasPhysician) {
                  return (
                    <TooltipProvider key={h.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableRow className="cursor-default opacity-75">
                            {cells}
                          </TableRow>
                        </TooltipTrigger>
                        <TooltipContent>
                          Назначьте лечащего врача, чтобы открыть карту пациента
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                }

                return (
                  <TableRow
                    key={h.id}
                    onClick={() => navigate(`/physician/inpatient/${h.id}`)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    {cells}
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
