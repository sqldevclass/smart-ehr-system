import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RoomBedSelector, RoomBedValue } from "@/components/inpatient/RoomBedSelector";
import { toast } from "sonner";

export default function NursePatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [roomBed, setRoomBed] = useState<RoomBedValue>({ roomId: "", bedNumber: null });
  const [submitting, setSubmitting] = useState(false);
  const [tabletMode, setTabletMode] = useState(false);
  const [nameSearch, setNameSearch] = useState("");
  const [idSearch, setIdSearch] = useState("");

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
    queryKey: ["nurse-active-hosp", user?.hospitalId, deptFilter],
    queryFn: async () => {
      let q = supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          department_id,
          departments!department_id(name),
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
      if (deptFilter !== "all") q = q.eq("department_id", deptFilter);
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
        <div className="flex flex-wrap items-center gap-3">
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все отделения</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              id="tablet-toggle"
              checked={tabletMode}
              onCheckedChange={(v) => setTabletMode(v)}
            />
            <Label htmlFor="tablet-toggle" className="text-sm cursor-pointer">
              Планшет
            </Label>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Загрузка…</p>
        ) : !hospitalizations.length ? (
          <p className="text-muted-foreground text-sm">Нет активных госпитализаций.</p>
        ) : tabletMode ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="px-3 py-2 font-medium text-xs">Пациент</th>
                  <th className="px-3 py-2 font-medium text-xs">Палата</th>
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
                {hospitalizations.map((h: any) => {
                  const v = latestVitals[h.id];
                  const ra = h.room_assignments?.[0];
                  const days = differenceInDays(new Date(), new Date(h.admitted_at));
                  const balance = v ? (v.fluid_intake_ml ?? 0) - (v.fluid_output_ml ?? 0) : null;
                  return (
                    <tr key={h.id} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{h.patients?.last_name} {h.patients?.first_name}</div>
                        <div className="text-xs text-muted-foreground">{h.patients?.patient_number}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}
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
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                        —
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hospitalizations.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Нет активных пациентов
              </div>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата поступления</TableHead>
                <TableHead>Отделение</TableHead>
                <TableHead>ФИО / ДОБ</TableHead>
                <TableHead>Палата / Кровать</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hospitalizations.map((h: any) => {
                const p = h.patients;
                const ra = h.room_assignments?.[0];
                const hasRoom = !!ra;
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
        )}

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
