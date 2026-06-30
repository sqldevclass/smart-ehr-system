import { useState, useMemo, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { UserCheck } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useInpatientContext } from "@/contexts/InpatientContext";
import StatusToggle from "@/components/shared/StatusToggle";
import { cn } from "@/lib/utils";

export default function InpatientPatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedDeptIds, nameSearch } = useInpatientContext();
  const { physicianId: currentPhysicianId } = usePhysicianId();

  const { getStatus, scheduleMap } = useEWSSchedule(user?.hospitalId);

  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [physicianSearch, setPhysicianSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "discharged">("active");
  const [showAllDischarged, setShowAllDischarged] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const { data: hospitalizations = [], isLoading } = useQuery({
    queryKey: ["inpatient-list", user?.hospitalId, selectedDeptIds, statusFilter, showAllDischarged],
    queryFn: async () => {
      if (!selectedDeptIds.length) return [];
      let query = supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          discharged_at, discharge_type,
          department_id, primary_staff_role_id,
          departments!department_id(name),
          patients!inner(id, first_name, last_name, patient_number, date_of_birth),
          room_assignments(bed_number, rooms!inner(name))
        `)
        .eq("hospital_id", user!.hospitalId)
        .in("department_id", selectedDeptIds)
        .order("admitted_at", { ascending: false });
      if (statusFilter === "active") {
        query = query.is("discharged_at", null);
      } else {
        query = query.not("discharged_at", "is", null);
        if (!showAllDischarged) {
          const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
          query = query.gte("discharged_at", fiveDaysAgo);
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId && selectedDeptIds.length > 0,
  });

  const physicianIds = Array.from(new Set(
    hospitalizations.map((h: any) => h.primary_staff_role_id).filter(Boolean)
  ));

  const { data: physicianNames = [] } = useQuery({
    queryKey: ["inpatient-physician-names", physicianIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name)")
        .in("id", physicianIds);
      return data || [];
    },
    enabled: physicianIds.length > 0,
  });

  const physMap: Record<string, string> = {};
  for (const p of physicianNames as any[]) {
    physMap[p.id] = `${p.persons?.last_name} ${p.persons?.first_name}` || "—";
  }

  const { data: allPhysicians = [] } = useQuery({
    queryKey: ["inpatient-all-physicians", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const filteredPhysicians = (allPhysicians as any[])
    .filter((p: any) =>
      `${p.persons?.last_name} ${p.persons?.first_name}`
        .toLowerCase()
        .includes(physicianSearch.toLowerCase())
    ).slice(0, 10);

  const handleAssignPhysician = async (hospId: string, physicianId: string) => {
    const { error } = await supabase
      .from("hospitalizations")
      .update({ primary_staff_role_id: physicianId })
      .eq("id", hospId);
    if (error) return;
    queryClient.invalidateQueries({ queryKey: ["inpatient-list"] });
    setOpenPopoverId(null);
    setPhysicianSearch("");
  };

  const { data: allVitals = [] } = useQuery({
    queryKey: ["physician-vitals-tablet", user?.hospitalId],
    staleTime: 0,
    refetchInterval: 60000,
    enabled: tabletMode && !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_vitals")
        .select(`
          id, hospitalization_id, recorded_at,
          bp_systolic, bp_diastolic, pulse,
          spo2, temperature,
          fluid_intake_ml, fluid_output_ml
        `)
        .eq("hospital_id", user!.hospitalId)
        .order("recorded_at", { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  const latestVitals = useMemo(() => {
    const map: Record<string, any> = {};
    for (const v of allVitals) {
      if (!map[v.hospitalization_id]) map[v.hospitalization_id] = v;
    }
    return map;
  }, [allVitals]);

  const previousDayVitals = useMemo(() => {
    const map: Record<string, any> = {};
    for (const v of allVitals) {
      const latest = latestVitals[v.hospitalization_id];
      if (!latest) continue;
      const latestDate = new Date(latest.recorded_at).toDateString();
      const thisDate = new Date(v.recorded_at).toDateString();
      if (thisDate !== latestDate && !map[v.hospitalization_id]) {
        map[v.hospitalization_id] = v;
      }
    }
    return map;
  }, [allVitals, latestVitals]);

  const filtered = hospitalizations.filter((h: any) => {
    const p = h.patients;
    const name = `${p.last_name} ${p.first_name}`.toLowerCase();
    const q = nameSearch.toLowerCase();
    const matchName = !nameSearch || name.includes(q);
    const matchId = !nameSearch || (p.patient_number?.toLowerCase().includes(q));
    return matchName || matchId;
  });


  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>Стационарные пациенты</CardTitle>
          <div className="flex items-center gap-2">
            <StatusToggle
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setShowAllDischarged(false);
              }}
            />
            <Switch
              id="physician-tablet-toggle"
              checked={tabletMode}
              onCheckedChange={(v) => setTabletMode(v)}
            />
            <Label htmlFor="physician-tablet-toggle" className="text-sm cursor-pointer">
              Планшет
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !filtered.length ? (
          <p className="text-muted-foreground text-sm">Нет госпитализаций.</p>
        ) : tabletMode ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="px-3 py-2 font-medium text-xs">Пациент</th>
                  <th className="px-3 py-2 font-medium text-xs">Палата</th>
                  <th className="px-3 py-2 font-medium text-xs">Лечащий Врач</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">АД</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">Пульс</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">SpO2</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">Темп.</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">Баланс</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">Дней</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">ШРПУ</th>
                  <th className="px-3 py-2 font-medium text-xs text-center">Вчера</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h: any) => {
                  const v = latestVitals[h.id];
                  const ra = h.room_assignments?.[0];
                  const days = differenceInDays(new Date(), new Date(h.admitted_at));
                  const balance = v ? (v.fluid_intake_ml ?? 0) - (v.fluid_output_ml ?? 0) : null;
                  const hasPhysician = !!h.primary_staff_role_id;
                  return (
                    <tr
                      key={h.id}
                      className={cn(
                        "border-b",
                        hasPhysician ? "cursor-pointer hover:bg-muted/50" : "cursor-default opacity-75"
                      )}
                      onClick={() => hasPhysician && navigate(`/physician/inpatient/${h.id}`)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{h.patients?.last_name} {h.patients?.first_name}</div>
                        <div className="text-xs text-muted-foreground">{h.patients?.patient_number}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}</td>
                      <td className="px-3 py-2 text-xs">{physMap[h.primary_staff_role_id] ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{v?.bp_systolic && v?.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{v?.pulse ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{v?.spo2 ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{v?.temperature ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{balance !== null ? `${balance} мл` : "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{days}</td>
                      <td className="px-3 py-2 text-center">
                        <EWSStatusDot
                          status={getStatus(h.id)}
                          score={scheduleMap[h.id]?.last_score}
                          pulse={false}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((h: any) => {
                const p = h.patients;
                const ra = h.room_assignments?.[0];
                const days = differenceInDays(new Date(), new Date(h.admitted_at));
                const hasPhysician = !!h.primary_staff_role_id;

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
                          {physMap[h.primary_staff_role_id] ? (
                            <button className="text-sm font-medium text-primary hover:underline">
                              {physMap[h.primary_staff_role_id]}
                            </button>
                          ) : (
                            <button className="text-sm text-muted-foreground hover:text-primary">
                              — Назначить
                            </button>
                          )}
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-2" align="start">
                          <div className="space-y-2">
                            {currentPhysicianId && h.primary_staff_role_id !== currentPhysicianId && (
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
                                    ph.id === h.primary_staff_role_id && "bg-muted font-medium"
                                  )}
                                >
                                  {`${ph.persons?.last_name} ${ph.persons?.first_name}`}
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
                        pulse={false}
                      />
                    </TableCell>
                    <TableCell>
                      {h.discharged_at ? (
                        <div>
                          <Badge variant="secondary" className="text-xs">
                            {h.discharge_type === "discharged"
                              ? "Выписан"
                              : h.discharge_type === "transferred"
                              ? "Переведён"
                              : "Летальный исход"}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(h.discharged_at), "dd.MM.yyyy HH:mm")}
                          </div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                          Активный
                        </Badge>
                      )}
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
        {statusFilter === "discharged" && !showAllDischarged && filtered.length > 0 && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setShowAllDischarged(true)}
              className="text-xs text-primary underline"
            >
              Показать все выписанные
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
