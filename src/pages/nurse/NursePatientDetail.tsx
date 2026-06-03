import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNurseLayoutContext } from "@/components/nurse/NurseLayout";
import { format, differenceInYears } from "date-fns";
import { Button } from "@/components/ui/button";
import EWSSection from "@/components/ews/EWSSection";
import NursePrescriptions from "@/components/medication/NursePrescriptions";
import NurseMonitoringPanel from "@/components/nurse/NurseMonitoringPanel";
import FallingPersonIcon from "@/components/assessments/FallingPersonIcon";
import { cn } from "@/lib/utils";


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
  const [panelOffset, setPanelOffset] = useState(0);


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

  const fallRiskScaleCode = useMemo(() => {
    const dob = (hosp as any)?.patients?.date_of_birth;
    if (!dob) return undefined;
    const ageYears = differenceInYears(new Date(), new Date(dob));
    return ageYears < 18 ? "humpty_dumpty" : "morse";
  }, [(hosp as any)?.patients?.date_of_birth]);

  const { data: fallRiskAssessments = [] } = useQuery({
    queryKey: ["fall-risk-assessments", hospId, fallRiskScaleCode],
    enabled: !!hospId && fallRiskScaleCode !== undefined,
    staleTime: 0,
    queryFn: async () => {
      const { data: scale } = await supabase
        .from("assessment_scales")
        .select("id")
        .eq("code", fallRiskScaleCode)
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

  const latestFallRiskScore = (fallRiskAssessments[0] as any)?.total_score ?? null;
  const isFallRisk =
    fallRiskScaleCode !== undefined &&
    latestFallRiskScore !== null &&
    (fallRiskScaleCode === "humpty_dumpty"
      ? latestFallRiskScore >= 12
      : latestFallRiskScore >= 51);

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

      {/* Sliding container — clips the strip */}
      <div className="flex-1 relative overflow-hidden">
        {/* Left arrow */}
        {panelOffset > 0 && (
          <button
            onClick={() => setPanelOffset(0)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white border shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ◀
          </button>
        )}
        {/* Right arrow */}
        {panelOffset < 1 && (
          <button
            onClick={() => setPanelOffset(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white border shadow-md flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ▶
          </button>
        )}
        {/* Dot indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => setPanelOffset(i)}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                panelOffset === i
                  ? "bg-primary"
                  : "bg-gray-300 hover:bg-gray-400"
              )}
            />
          ))}
        </div>
        {/* Strip — absolutely positioned so it never causes page scroll */}
        <div
          className="absolute inset-y-0 left-0 flex transition-transform duration-300 ease-in-out"
          style={{
            width: "200%",
            transform: `translateX(${-panelOffset * 50}%)`,
          }}
        >
          {/* Panel 1 — 25% of strip = 100% of container */}
          <div className="w-1/4 h-full overflow-y-auto border-r p-4">
            <p className="text-muted-foreground text-sm">Panel 1 — ШРПУ</p>
          </div>
          {/* Panel 2 */}
          <div className="w-1/4 h-full overflow-y-auto border-r p-4">
            <p className="text-muted-foreground text-sm">Panel 2 — Мониторинг</p>
          </div>
          {/* Panel 3 */}
          <div className="w-1/4 h-full overflow-y-auto border-r p-4">
            <p className="text-muted-foreground text-sm">Panel 3 — Назначения</p>
          </div>
          {/* Panel 4 — empty reserved */}
          <div className="w-1/4 h-full" />
        </div>
      </div>

    </div>
  );
}
