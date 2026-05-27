import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNurseLayoutContext } from "@/components/nurse/NurseLayout";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const EMPTY_VITALS = {
  bp_systolic: "",
  bp_diastolic: "",
  pulse: "",
  respiratory_rate: "",
  spo2: "",
  temperature: "",
  weight_kg: "",
  height_cm: "",
  consciousness: "alert",
  fluid_intake_ml: "",
  fluid_output_ml: "",
  notes: "",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  diet: "Диета",
  activity_mode: "Режим активности",
  care: "Уход",
};

export default function NursePatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setPatientContext } = useNurseLayoutContext();
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [vitals, setVitals] = useState<Record<string, string>>(EMPTY_VITALS);
  const [saving, setSaving] = useState(false);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["nurse-hosp", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          department_id,
          departments!department_id(name),
          patients!inner(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender,
            patient_allergies(allergy_type, severity)
          ),
          room_assignments(
            bed_number, rooms!inner(name))
        `)
        .eq("id", hospId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospId,
  });

  const { data: vitalsHistory = [], refetch: refetchVitals } = useQuery({
    queryKey: ["nurse-vitals", hospId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_vitals")
        .select(`
          id, recorded_at, bp_systolic, bp_diastolic, pulse,
          respiratory_rate, spo2, temperature, weight_kg, height_cm,
          consciousness, fluid_intake_ml, fluid_output_ml, notes,
          profiles!recorded_by(full_name)
        `)
        .eq("hospitalization_id", hospId!)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospId,
  });

  const handleSaveVitals = async () => {
    if (!hosp) return;
    setSaving(true);
    try {
      const payload: any = {
        hospital_id: user!.hospitalId,
        hospitalization_id: hospId,
        patient_id: (hosp.patients as any).id,
        recorded_by: user!.id,
        recorded_at: new Date().toISOString(),
      };
      const numericFields = ["bp_systolic", "bp_diastolic", "pulse",
        "respiratory_rate", "fluid_intake_ml", "fluid_output_ml"];
      const decimalFields = ["spo2", "temperature", "weight_kg", "height_cm"];
      numericFields.forEach(f => {
        if (vitals[f]) payload[f] = parseInt(vitals[f]);
      });
      decimalFields.forEach(f => {
        if (vitals[f]) payload[f] = parseFloat(vitals[f]);
      });
      if (vitals.consciousness) payload.consciousness = vitals.consciousness;
      if (vitals.notes) payload.notes = vitals.notes;
      const { error } = await supabase.from("patient_vitals").insert(payload);
      if (error) throw error;
      setShowVitalsForm(false);
      setVitals(EMPTY_VITALS);
      await refetchVitals();
    } catch (err: any) {
      toast.error(err.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const { data: careOrders = [] } = useQuery({
    queryKey: ["nurse-care-orders", hospId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value,
          ordered_at,
          profiles!ordered_by(full_name)
        `)
        .eq("hospitalization_id", hospId!)
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("ordered_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospId && !!user?.hospitalId,
  });

  if (isLoading) return <p className="text-muted-foreground">Загрузка…</p>;
  if (!hosp) return <p className="text-destructive">Госпитализация не найдена.</p>;

  const patient = hosp.patients as any;
  const ra = (hosp.room_assignments as any[])?.[0];
  const allergies = patient?.patient_allergies || [];

  return (
    <div className="-m-6">
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="sm" onClick={() => navigate("/nurse")}>
          ← Назад
        </Button>
        <div>
          <span className="font-semibold">
            {patient.last_name} {patient.first_name}
          </span>
          <span className="text-sm text-muted-foreground ml-2">
            П#: {patient.patient_number}
          </span>
          <span className="text-sm text-muted-foreground ml-2">
            ДР: {patient.date_of_birth ? format(new Date(patient.date_of_birth), "dd.MM.yyyy") : "—"}
          </span>
        </div>
        <div className="ml-auto text-sm">
          {ra ? `${ra.rooms?.name} / Кровать ${ra.bed_number}` : "Без палаты"}
        </div>
      </div>

      {allergies.length > 0 && (
        <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 font-semibold text-sm">
          АЛЛЕРГИЯ: {allergies.map((a: any) => a.allergy_type).join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[40%_60%]">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Физикальные показатели</h3>
            <Button size="sm" onClick={() => setShowVitalsForm(!showVitalsForm)}>
              + Внести показатели
            </Button>
          </div>

          {showVitalsForm && (
            <div className="border rounded-md p-4 mb-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">АД систол. (мм рт.ст.)</Label>
                  <Input type="number" value={vitals.bp_systolic}
                    onChange={(e) => setVitals(v => ({ ...v, bp_systolic: e.target.value }))}
                    placeholder="120" />
                </div>
                <div>
                  <Label className="text-xs">АД диастол.</Label>
                  <Input type="number" value={vitals.bp_diastolic}
                    onChange={(e) => setVitals(v => ({ ...v, bp_diastolic: e.target.value }))}
                    placeholder="80" />
                </div>
                <div>
                  <Label className="text-xs">Пульс (уд/мин)</Label>
                  <Input type="number" value={vitals.pulse}
                    onChange={(e) => setVitals(v => ({ ...v, pulse: e.target.value }))}
                    placeholder="72" />
                </div>
                <div>
                  <Label className="text-xs">ЧДД (в мин)</Label>
                  <Input type="number" value={vitals.respiratory_rate}
                    onChange={(e) => setVitals(v => ({ ...v, respiratory_rate: e.target.value }))}
                    placeholder="16" />
                </div>
                <div>
                  <Label className="text-xs">SpO2 (%)</Label>
                  <Input type="number" value={vitals.spo2}
                    onChange={(e) => setVitals(v => ({ ...v, spo2: e.target.value }))}
                    placeholder="98" />
                </div>
                <div>
                  <Label className="text-xs">Температура (°C)</Label>
                  <Input type="number" step="0.1" value={vitals.temperature}
                    onChange={(e) => setVitals(v => ({ ...v, temperature: e.target.value }))}
                    placeholder="36.6" />
                </div>
                <div>
                  <Label className="text-xs">Вес (кг)</Label>
                  <Input type="number" step="0.1" value={vitals.weight_kg}
                    onChange={(e) => setVitals(v => ({ ...v, weight_kg: e.target.value }))}
                    placeholder="70" />
                </div>
                <div>
                  <Label className="text-xs">Рост (см)</Label>
                  <Input type="number" step="0.1" value={vitals.height_cm}
                    onChange={(e) => setVitals(v => ({ ...v, height_cm: e.target.value }))}
                    placeholder="170" />
                </div>
                <div>
                  <Label className="text-xs">Приём жидкости (мл)</Label>
                  <Input type="number" value={vitals.fluid_intake_ml}
                    onChange={(e) => setVitals(v => ({ ...v, fluid_intake_ml: e.target.value }))}
                    placeholder="500" />
                </div>
                <div>
                  <Label className="text-xs">Выделение жидкости (мл)</Label>
                  <Input type="number" value={vitals.fluid_output_ml}
                    onChange={(e) => setVitals(v => ({ ...v, fluid_output_ml: e.target.value }))}
                    placeholder="400" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Сознание (AVPU)</Label>
                <Select value={vitals.consciousness}
                  onValueChange={(v) => setVitals(prev => ({ ...prev, consciousness: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alert">A — Ясное</SelectItem>
                    <SelectItem value="voice">V — Реакция на голос</SelectItem>
                    <SelectItem value="pain">P — Реакция на боль</SelectItem>
                    <SelectItem value="unresponsive">U — Без реакции</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Заметки</Label>
                <textarea
                  value={vitals.notes}
                  onChange={(e) => setVitals(v => ({ ...v, notes: e.target.value }))}
                  className="w-full text-sm border rounded px-2 py-1 resize-none"
                  rows={2}
                  placeholder="Дополнительные наблюдения..."
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveVitals} disabled={saving}>
                  {saving ? "Сохранение…" : "Сохранить"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowVitalsForm(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {vitalsHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Показатели не вносились</p>
            ) : vitalsHistory.map((v: any) => (
              <div key={v.id} className="border rounded p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {format(new Date(v.recorded_at), "dd.MM.yyyy HH:mm")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.profiles?.full_name}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {v.bp_systolic && (<span>АД: {v.bp_systolic}/{v.bp_diastolic}</span>)}
                  {v.pulse && (<span>Пульс: {v.pulse}</span>)}
                  {v.temperature && (<span>Т°: {v.temperature}</span>)}
                  {v.spo2 && (<span>SpO2: {v.spo2}%</span>)}
                  {v.respiratory_rate && (<span>ЧДД: {v.respiratory_rate}</span>)}
                  {v.consciousness && (
                    <span>Сознание:{" "}
                      {v.consciousness === "alert" ? "Ясное"
                        : v.consciousness === "voice" ? "Голос"
                        : v.consciousness === "pain" ? "Боль"
                        : "Нет реакции"}
                    </span>
                  )}
                </div>
                {v.notes && (
                  <div className="text-xs text-muted-foreground italic">{v.notes}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-l h-full overflow-y-auto">
          <h3 className="font-semibold mb-4">Уход и назначения</h3>
          {careOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Назначений нет</p>
          ) : careOrders.map((o: any) => (
            <div key={o.id} className="border rounded p-3 space-y-1 mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {ORDER_TYPE_LABELS[o.order_type as keyof typeof ORDER_TYPE_LABELS] ?? o.order_type}
              </span>
              <p className="text-sm">{o.order_value}</p>
              <div className="text-xs text-muted-foreground">
                {o.profiles?.full_name} · {format(new Date(o.ordered_at), "dd.MM.yyyy HH:mm")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
