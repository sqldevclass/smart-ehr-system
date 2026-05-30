import { useState, useEffect, useRef } from "react";
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
import EWSSection from "@/components/ews/EWSSection";
import AssessmentSection from "@/components/assessments/AssessmentSection";
import FallingPersonIcon from "@/components/assessments/FallingPersonIcon";

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
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

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

  const { data: morseAssessments = [] } = useQuery({
    queryKey: ["morse-assessments", hospId],
    enabled: !!hospId,
    staleTime: 0,
    queryFn: async () => {
      const { data: scale } = await supabase
        .from("assessment_scales")
        .select("id")
        .eq("code", "morse")
        .single();
      if (!scale) return [];
      const { data } = await supabase
        .from("patient_assessments")
        .select("total_score, risk_level, assessed_at")
        .eq("hospitalization_id", hospId!)
        .eq("scale_id", scale.id)
        .eq("is_voided", false)
        .order("assessed_at", { ascending: false })
        .limit(1);
      return data || [];
    },
  });

  const latestMorseScore = (morseAssessments[0] as any)?.total_score ?? null;
  const isFallRisk = latestMorseScore !== null && latestMorseScore >= 51;

  const patient = (hosp as any)?.patients;
  const ra = (hosp as any)?.room_assignments?.[0];
  const allergies = patient?.patient_allergies || [];

  useEffect(() => {
    if (!hosp || !patient) {
      setPatientContext(null);
      return;
    }
    setPatientContext(
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">
          {patient.last_name} {patient.first_name}
        </span>
        <span className="text-muted-foreground">
          ДР: {patient.date_of_birth ? format(new Date(patient.date_of_birth), "dd.MM.yyyy") : "—"}
        </span>
        <span className="text-muted-foreground">
          П#: {patient.patient_number}
        </span>
        {ra && (
          <span className="text-muted-foreground">
            {ra.rooms?.name} / {ra.bed_number}
          </span>
        )}
      </div>
    );
    return () => setPatientContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(hosp as any)?.id]);

  if (isLoading) return <p className="text-muted-foreground">Загрузка…</p>;
  if (!hosp) return <p className="text-destructive">Госпитализация не найдена.</p>;

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-white shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => navigate("/nurse")}
        >
          ← Назад
        </Button>
        {allergies.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
            <span>⚠</span>
            <span>АЛЛЕРГИЯ:</span>
            <span>{allergies.map((a: any) => a.allergy_type).join(", ")}</span>
          </div>
        )}
        {isFallRisk && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-50 border border-red-200 text-red-700">
            <FallingPersonIcon color="#B91C1C" size={14} />
            <span>Риск падения</span>
          </div>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled
          >
            Приход / Списание
          </Button>
        </div>
      </div>


      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden select-none"
      >
        <div
          style={{ width: `${leftWidth}%` }}
          className="overflow-y-auto shrink-0 p-4"
        >
          <EWSSection
            hospitalizationId={hospId!}
            patientId={patient.id}
            hospitalId={user!.hospitalId}
            patientDateOfBirth={patient.date_of_birth}
            admittedAt={(hosp as any).admitted_at}
            isReadOnly={false}
            viewerRole="nurse"
          />
          <div className="mt-6 pt-6 border-t">
            <AssessmentSection
              scaleCode="braden"
              hospitalizationId={hospId!}
              patientId={patient.id}
              hospitalId={user!.hospitalId}
            />
          </div>
          <div className="border-t pt-4 mt-4">
            <AssessmentSection
              scaleCode="morse"
              hospitalizationId={hospId!}
              patientId={patient.id}
              hospitalId={user!.hospitalId}
              isReadOnly={false}
            />
          </div>
        </div>

        <div
          onMouseDown={() => setIsDragging(true)}
          className="w-px bg-gray-300 hover:bg-gray-400 cursor-col-resize shrink-0 transition-colors"
        />

        <div
          style={{ width: `${100 - leftWidth}%` }}
          className="overflow-y-auto p-4"
        >
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
