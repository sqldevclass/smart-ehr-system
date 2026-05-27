import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Загрузка…</p>
        ) : !hospitalizations.length ? (
          <p className="text-muted-foreground text-sm">Нет активных госпитализаций.</p>
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
