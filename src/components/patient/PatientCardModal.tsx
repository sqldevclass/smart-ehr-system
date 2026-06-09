import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RoomBedSelector, RoomBedValue } from "@/components/inpatient/RoomBedSelector";
import { toast } from "sonner";
import { format, differenceInYears } from "date-fns";
import { Loader2 } from "lucide-react";

interface Props {
  hospitalizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PatientCardModal({ hospitalizationId, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [editDeptId, setEditDeptId] = useState<string>("");
  const [editRoomBed, setEditRoomBed] = useState<RoomBedValue>({ roomId: "", bedNumber: null });
  const [editing, setEditing] = useState(false);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["patient-card-hosp", hospitalizationId],
    enabled: !!hospitalizationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, department_id, admitted_at, status,
          departments!department_id(id, name),
          patients!inner(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender,
            blood_type, national_id, phone, email, address
          ),
          room_assignments(
            id, bed_number, assigned_at, discharged_at,
            rooms!inner(id, name, departments!department_id(name))
          )
        `)
        .eq("id", hospitalizationId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["patient-card-allergies", (hosp as any)?.patients?.id],
    enabled: !!(hosp as any)?.patients?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_allergies")
        .select("allergy_type, severity, notes")
        .eq("patient_id", (hosp as any).patients.id);
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["patient-card-depts", user?.hospitalId],
    enabled: !!user?.hospitalId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  const patient = (hosp as any)?.patients;
  const currentRa = (hosp as any)?.room_assignments?.find((r: any) => !r.discharged_at);

  const startEditing = () => {
    setEditDeptId((hosp as any)?.department_id ?? "");
    setEditRoomBed({
      roomId: currentRa?.rooms?.id ?? "",
      bedNumber: currentRa?.bed_number != null ? Number(currentRa.bed_number) : null,
    });
    setEditing(true);
  };

  const save = async () => {
    if (!user || !hosp) return;
    setSaving(true);
    try {
      if (editDeptId && editDeptId !== (hosp as any).department_id) {
        const { error } = await supabase
          .from("hospitalizations")
          .update({ department_id: editDeptId })
          .eq("id", hospitalizationId);
        if (error) throw error;
      }

      const currentBedNum = currentRa?.bed_number != null ? Number(currentRa.bed_number) : null;
      if (
        editRoomBed.roomId &&
        (editRoomBed.roomId !== currentRa?.rooms?.id || editRoomBed.bedNumber !== currentBedNum)
      ) {
        if (currentRa?.id) {
          await supabase
            .from("room_assignments")
            .update({ discharged_at: new Date().toISOString() })
            .eq("id", currentRa.id);
        }
        const { error } = await supabase
          .from("room_assignments")
          .insert({
            hospitalization_id: hospitalizationId,
            hospital_id: user.hospitalId,
            room_id: editRoomBed.roomId,
            bed_number: editRoomBed.bedNumber as any,
            assigned_by: user.id,
          } as any);
        if (error) throw error;
      }

      toast.success("Сохранено");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["patient-card-hosp", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["nurse-hosp", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["nurse-hosps"] });
      qc.invalidateQueries({ queryKey: ["inpatient-detail", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["inpatient-hosps"] });
      qc.invalidateQueries({ queryKey: ["rbs-occupied", user.hospitalId] });
    } catch (e: any) {
      toast.error(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const genderLabel = (g: string) =>
    g === "male" ? "Мужской" : g === "female" ? "Женский" : g ?? "—";

  const bloodTypeColor = (bt: string) => {
    const map: Record<string, string> = {
      "A+": "bg-red-100 text-red-700", "A-": "bg-red-100 text-red-700",
      "B+": "bg-blue-100 text-blue-700", "B-": "bg-blue-100 text-blue-700",
      "AB+": "bg-purple-100 text-purple-700", "AB-": "bg-purple-100 text-purple-700",
      "O+": "bg-green-100 text-green-700", "O-": "bg-green-100 text-green-700",
    };
    return map[bt] ?? "bg-muted text-muted-foreground";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Карта пациента</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !patient ? (
          <p className="text-muted-foreground">Пациент не найден</p>
        ) : (
          <div className="space-y-5">
            {/* Identity */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-semibold">
                  {patient.last_name} {patient.first_name} {patient.middle_name ?? ""}
                </span>
                {patient.blood_type && (
                  <Badge className={bloodTypeColor(patient.blood_type)}>
                    {patient.blood_type}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">П# {patient.patient_number}</p>
            </div>

            {/* Personal details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Дата рождения:</span>{" "}
                {patient.date_of_birth
                  ? `${format(new Date(patient.date_of_birth), "dd.MM.yyyy")} (${differenceInYears(new Date(), new Date(patient.date_of_birth))} лет)`
                  : "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Пол:</span> {genderLabel(patient.gender)}
              </p>
              <p>
                <span className="text-muted-foreground">Телефон:</span> {patient.phone || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span> {patient.email || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Паспорт/ИД:</span> {patient.national_id || "—"}
              </p>
              <p className="sm:col-span-2">
                <span className="text-muted-foreground">Адрес:</span> {patient.address || "—"}
              </p>
            </div>

            {/* Allergies */}
            {allergies.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700">Аллергии</p>
                <div className="flex flex-wrap gap-1.5">
                  {allergies.map((a: any, i: number) => (
                    <Badge key={i} variant="outline" className="border-red-300 text-red-700">
                      {a.allergy_type}
                      {a.severity ? ` (${a.severity})` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Hospitalization info */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Госпитализация</p>
                {!editing && (
                  <Button size="sm" variant="outline" onClick={startEditing}>
                    Изменить
                  </Button>
                )}
              </div>

              {!editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Отделение:</span>{" "}
                    {(hosp as any).departments?.name || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Палата:</span>{" "}
                    {currentRa?.rooms?.name || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Место:</span>{" "}
                    {currentRa?.bed_number || "—"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Поступление:</span>{" "}
                    {(hosp as any).admitted_at
                      ? format(new Date((hosp as any).admitted_at), "dd.MM.yyyy HH:mm")
                      : "—"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Отделение</Label>
                    <Select
                      value={editDeptId}
                      onValueChange={(v) => {
                        setEditDeptId(v);
                        setEditRoomBed({ roomId: "", bedNumber: null });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите отделение" />
                      </SelectTrigger>
                      <SelectContent>
                        {(departments as any[]).map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editDeptId && (
                    <div className="space-y-1">
                      <Label>Палата и место</Label>
                      <RoomBedSelector
                        hospitalId={user!.hospitalId}
                        departmentId={editDeptId}
                        value={editRoomBed}
                        onChange={setEditRoomBed}
                      />
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                      Отмена
                    </Button>
                    <Button onClick={save} disabled={saving || !editDeptId}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Сохранить
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
