import { useState, useEffect } from "react";
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

  const [personalGender, setPersonalGender] = useState<string>("");
  const [personalPhone, setPersonalPhone] = useState<string>("");
  const [personalEmail, setPersonalEmail] = useState<string>("");
  const [personalNationalId, setPersonalNationalId] = useState<string>("");
  const [personalWeight, setPersonalWeight] = useState<string>("");
  const [personalHeight, setPersonalHeight] = useState<string>("");
  const [personalAddress, setPersonalAddress] = useState<string>("");
  const [personalBaseline, setPersonalBaseline] = useState<string>("");
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["patient-card-hosp", hospitalizationId],
    enabled: !!hospitalizationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, department_id, admitted_at,
          departments!department_id(id, name),
          patients!patient_id(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender,
            blood_type, national_id, phone, email, address,
            weight_kg, height_cm
          ),
          room_assignments(
            id, bed_number, assigned_at, discharged_at,
            rooms!room_id(id, name)
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

  useEffect(() => {
    if (!patient) return;
    const initial = {
      gender: patient.gender ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      nationalId: patient.national_id ?? "",
      weight: patient.weight_kg != null ? String(patient.weight_kg) : "",
      height: patient.height_cm != null ? String(patient.height_cm) : "",
      address: patient.address ?? "",
    };
    setPersonalGender(initial.gender);
    setPersonalPhone(initial.phone);
    setPersonalEmail(initial.email);
    setPersonalNationalId(initial.nationalId);
    setPersonalWeight(initial.weight);
    setPersonalHeight(initial.height);
    setPersonalAddress(initial.address);
    setPersonalBaseline(JSON.stringify(initial));
  }, [patient?.id, patient?.gender, patient?.phone, patient?.email, patient?.national_id, patient?.weight_kg, patient?.height_cm, patient?.address]);

  const isPersonalDirty = (() => {
    if (!personalBaseline) return false;
    const current = JSON.stringify({
      gender: personalGender,
      phone: personalPhone,
      email: personalEmail,
      nationalId: personalNationalId,
      weight: personalWeight,
      height: personalHeight,
      address: personalAddress,
    });
    return current !== personalBaseline;
  })();

  const { data: vitalsHistory = [] } = useQuery({
    queryKey: ["patient-vitals-history", patient?.id],
    enabled: !!patient?.id && open && showHistory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_vitals_measurements" as any)
        .select(`
          id, weight_kg, height_cm, recorded_at,
          profiles!recorded_by(full_name)
        `)
        .eq("patient_id", patient!.id)
        .order("recorded_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

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

  const savePersonal = async () => {
    if (!patient?.id) return;
    setSavingPersonal(true);
    try {
      const { error: profileErr } = await supabase
        .from("patients")
        .update({
          gender: personalGender || null,
          phone: personalPhone || null,
          email: personalEmail || null,
          national_id: personalNationalId || null,
          address: personalAddress || null,
        })
        .eq("id", patient.id);
      if (profileErr) throw profileErr;

      const weightNum = personalWeight ? parseFloat(personalWeight) : null;
      const heightNum = personalHeight ? parseFloat(personalHeight) : null;
      if (weightNum !== null || heightNum !== null) {
        const { error: rpcErr } = await supabase.rpc("record_patient_measurement" as any, {
          p_patient_id: patient.id,
          p_weight_kg: weightNum,
          p_height_cm: heightNum,
        });
        if (rpcErr) throw rpcErr;
      }

      toast.success("Сохранено");
      setPersonalBaseline(JSON.stringify({
        gender: personalGender,
        phone: personalPhone,
        email: personalEmail,
        nationalId: personalNationalId,
        weight: personalWeight,
        height: personalHeight,
        address: personalAddress,
      }));
      qc.invalidateQueries({ queryKey: ["patient-card-hosp", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["patient-vitals-history", patient.id] });
      qc.invalidateQueries({ queryKey: ["nurse-hosp", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["nurse-hosps"] });
      qc.invalidateQueries({ queryKey: ["inpatient-detail", hospitalizationId] });
      qc.invalidateQueries({ queryKey: ["inpatient-hosps"] });
    } catch (e: any) {
      toast.error(e.message ?? "Ошибка сохранения");
    } finally {
      setSavingPersonal(false);
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

            {/* Personal details — always editable */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Личные данные</p>
              <p className="text-sm text-muted-foreground">
                Дата рождения:{" "}
                {patient.date_of_birth
                  ? `${format(new Date(patient.date_of_birth), "dd.MM.yyyy")} (${differenceInYears(new Date(), new Date(patient.date_of_birth))} лет)`
                  : "—"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Пол</Label>
                  <Select value={personalGender} onValueChange={setPersonalGender}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Не указан" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Мужской</SelectItem>
                      <SelectItem value="female">Женский</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Телефон</Label>
                  <input
                    type="text"
                    value={personalPhone}
                    onChange={(e) => setPersonalPhone(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <input
                    type="email"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Паспорт/ИД</Label>
                  <input
                    type="text"
                    value={personalNationalId}
                    onChange={(e) => setPersonalNationalId(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Вес (кг)</Label>
                  <input
                    type="number"
                    step="0.1"
                    value={personalWeight}
                    onChange={(e) => setPersonalWeight(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Рост (см)</Label>
                  <input
                    type="number"
                    step="0.1"
                    value={personalHeight}
                    onChange={(e) => setPersonalHeight(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Адрес</Label>
                <input
                  type="text"
                  value={personalAddress}
                  onChange={(e) => setPersonalAddress(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showHistory ? "Скрыть историю" : "Показать историю"}
                </button>
                <Button size="sm" onClick={savePersonal} disabled={!isPersonalDirty || savingPersonal}>
                  {savingPersonal ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
              {showHistory && (
                <div className="border rounded-md p-2 space-y-1.5 bg-muted/30">
                  {vitalsHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет записей</p>
                  ) : (
                    vitalsHistory.map((v: any) => (
                      <div key={v.id} className="text-xs flex justify-between gap-2">
                        <span>
                          {v.weight_kg ? `${v.weight_kg} кг` : "—"} ·{" "}
                          {v.height_cm ? `${v.height_cm} см` : "—"}
                        </span>
                        <span className="text-muted-foreground">
                          {v.profiles?.full_name ?? "—"} ·{" "}
                          {format(new Date(v.recorded_at), "dd.MM.yyyy HH:mm")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
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
