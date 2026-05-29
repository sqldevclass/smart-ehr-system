import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNurseContext } from "@/contexts/NurseContext";
import { format, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RoomBedSelector, RoomBedValue } from "@/components/inpatient/RoomBedSelector";
import { toast } from "sonner";
import { useEWSSchedule } from "@/hooks/useEWSSchedule";
import EWSStatusDot from "@/components/ews/EWSStatusDot";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export default function NursePatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    selectedDeptIds,
    nameSearch,
    idSearch,
    tabletMode,
    setTabletMode,
  } = useNurseContext();
  const { getStatus, scheduleMap } = useEWSSchedule(user?.hospitalId);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [roomBed, setRoomBed] = useState<RoomBedValue>({ roomId: "", bedNumber: null });
  const [submitting, setSubmitting] = useState(false);


  const { data: departments = [] } = useQuery({
    queryKey: ["nurse-departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: hospitalizations = [], isLoading, refetch } = useQuery({
    queryKey: ["nurse-active-hosp", user?.hospitalId, selectedDeptIds],
    queryFn: async () => {
      let q = supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          department_id, primary_physician_id,
          departments!department_id(name),
          physicians!primary_physician_id(
            profiles!inner(full_name)),
          patients!inner(
            id, first_name, last_name,
            patient_number, date_of_birth),
          room_assignments(
            id, bed_number,
            rooms!inner(name))
        `)
        .eq("hospital_id", user!.hospitalId)
        .is("discharged_at", null)
        .order("admitted_at", { ascending: false });
      if (selectedDeptIds.length > 0) q = q.in("department_id", selectedDeptIds);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: allVitals = [] } = useQuery({
    queryKey: ["nurse-vitals-tablet", user?.hospitalId],
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
      if (!map[v.hospitalization_id]) {
        map[v.hospitalization_id] = v;
      }
    }
    return map;
  }, [allVitals]);

  const { data: latestAssessments = [] } = useQuery({
    queryKey: ["nurse-assessments-latest", user?.hospitalId],
    staleTime: 0,
    refetchInterval: 300000,
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_assessments")
        .select(`
          id, hospitalization_id, scale_id,
          total_score, risk_level,
          next_assessment_at,
          assessment_scales!scale_id(code)
        `)
        .eq("hospital_id", user!.hospitalId)
        .eq("is_voided", false)
        .order("assessed_at", { ascending: false });
      return data || [];
    },
  });

  const { data: bradenScale } = useQuery({
    queryKey: ["scale-id-braden"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assessment_scales")
        .select("id, code")
        .eq("code", "braden")
        .single();
      return data;
    },
  });

  const pendingAssessments = useMemo(() => {
    const map: Record<string, string[]> = {};
    hospitalizations.forEach((h: any) => {
      const pending: string[] = [];
      if (bradenScale) {
        const latest = latestAssessments.find(
          (a: any) =>
            a.hospitalization_id === h.id &&
            a.assessment_scales?.code === "braden"
        );
        if (
          !latest ||
          (latest.next_assessment_at &&
            new Date(latest.next_assessment_at) <= new Date())
        ) {
          pending.push("Брадена");
        }
      }
      if (pending.length > 0) {
        map[h.id] = pending;
      }
    });
    return map;
  }, [latestAssessments, hospitalizations, bradenScale]);

  const openAssignDialog = (h: any) => {
    setAssignTarget(h);
    setRoomBed({ roomId: "", bedNumber: null });
    setAssignDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!roomBed.roomId || !roomBed.bedNumber) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("room_assignments").insert({
        hospitalization_id: assignTarget.id,
        room_id: roomBed.roomId,
        bed_number: String(roomBed.bedNumber),
        assigned_at: new Date().toISOString(),
        hospital_id: user!.hospitalId,
        assigned_by: user!.id,
      });
      if (error) throw error;
      setAssignDialogOpen(false);
      await refetch();
      navigate(`/nurse/${assignTarget.id}`);
    } catch (err: any) {
      toast.error(err.message || "Не удалось разместить");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Пациенты</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <Switch
            id="tablet-toggle"
            checked={tabletMode}
            onCheckedChange={(v) => setTabletMode(v)}
          />
          <Label htmlFor="tablet-toggle" className="text-sm cursor-pointer">
            Планшет
          </Label>
        </div>

        {(() => {
          const filtered = hospitalizations.filter((h: any) => {
            const p = h.patients;
            const name = `${p?.last_name} ${p?.first_name}`.toLowerCase();
            const matchName = nameSearch
              ? name.includes(nameSearch.toLowerCase())
              : true;
            const matchId = idSearch
              ? p?.patient_number?.toLowerCase().includes(idSearch.toLowerCase())
              : true;
            return matchName && matchId;
          });

          if (isLoading) {
            return <p className="text-muted-foreground text-sm">Загрузка…</p>;
          }
          if (!filtered.length) {
            return <p className="text-muted-foreground text-sm">Нет активных госпитализаций.</p>;
          }
          if (tabletMode) {
            return (
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
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((h: any) => {
                      const v = latestVitals[h.id];
                      const ra = h.room_assignments?.[0];
                      const days = differenceInDays(new Date(), new Date(h.admitted_at));
                      const balance = v ? (v.fluid_intake_ml ?? 0) - (v.fluid_output_ml ?? 0) : null;
                      return (
                        <tr key={h.id} className="border-b hover:bg-muted/50">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <div className="font-medium">{h.patients?.last_name} {h.patients?.first_name}</div>
                                <div className="text-xs text-muted-foreground">{h.patients?.patient_number}</div>
                              </div>
                              {pendingAssessments[h.id] && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold shrink-0">
                                        {pendingAssessments[h.id].length}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Необходимо заполнить:{" "}
                                      {pendingAssessments[h.id].map((s) => `Шкала ${s}`).join(", ")}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {(h as any).physicians?.profiles?.full_name || "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {v?.bp_systolic ? `${v.bp_systolic}/${v.bp_diastolic}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {v?.pulse ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {v?.spo2 ? `${v.spo2}%` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {v?.temperature ? `${v.temperature}°` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {balance !== null ? `${balance > 0 ? "+" : ""}${balance} мл` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {days}
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            <EWSStatusDot
                              status={getStatus(h.id)}
                              score={scheduleMap[h.id]?.last_score}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }
          return (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата поступления</TableHead>
                  <TableHead>Отделение</TableHead>
                  <TableHead>ФИО / ДОБ</TableHead>
                  <TableHead>№Палаты / Кровать</TableHead>
                  <TableHead>Лечащий Врач</TableHead>
                  <TableHead>Который день</TableHead>
                  <TableHead>ШРПУ</TableHead>
                  <TableHead>Операция</TableHead>
                  <TableHead>Лист назначения</TableHead>
                  <TableHead>Приход/списание</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h: any) => {
                  const p = h.patients;
                  const ra = h.room_assignments?.[0];
                  const hasRoom = !!ra;
                  const days = differenceInDays(new Date(), new Date(h.admitted_at));
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {format(new Date(h.admitted_at), "dd.MM.yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{h.departments?.name || "—"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p?.last_name} {p?.first_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p?.date_of_birth ? format(new Date(p.date_of_birth), "dd.MM.yyyy") : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {hasRoom ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(h as any).physicians?.profiles?.full_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{days} дн.</TableCell>
                      <TableCell>
                        <EWSStatusDot
                          status={getStatus(h.id)}
                          score={scheduleMap[h.id]?.last_score}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell>
                        {hasRoom ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                            Размещён
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                            Ожидает размещения
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {hasRoom ? (
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/nurse/${h.id}`)}>
                            Открыть
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openAssignDialog(h)}>
                            Принять
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          );
        })()}

        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Разместить пациента</DialogTitle>
              <DialogDescription>
                {assignTarget?.patients?.last_name} {assignTarget?.patients?.first_name}
              </DialogDescription>
            </DialogHeader>
            <RoomBedSelector
              hospitalId={user!.hospitalId}
              departmentId={assignTarget?.department_id ?? ""}
              value={roomBed}
              onChange={setRoomBed}
            />
            <DialogFooter>
              <Button
                disabled={!roomBed.roomId || !roomBed.bedNumber || submitting}
                onClick={handleAssign}
              >
                {submitting ? "Размещение…" : "Разместить"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
