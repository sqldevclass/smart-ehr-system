import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInMonths, format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import EWSChart from "./EWSChart";
import AssessmentSection from "@/components/assessments/AssessmentSection";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  patientDateOfBirth: string;
  admittedAt: string;
  isReadOnly?: boolean;
  canOverride?: boolean;
  hospitalizationSuspectedInfection?: boolean;
  canSetSuspectedInfection?: boolean;
  onSuspectedInfectionChange?: (v: boolean) => void;
}

const SEPSIS_SIGN_LABELS: Record<string, string> = {
  temperature: "Температура < 36°C или > 38°C",
  tachycardia: "Неадекватная тахикардия",
  altered_mental_state: "Изменение сознания (AVPU)",
  poor_perfusion: "Нарушение перфузии (ВКН > 2 сек)",
};

const bgColor: Record<string, string> = {
  white: "bg-white",
  yellow: "bg-yellow-100",
  pink: "bg-pink-100",
  red: "bg-red-200",
};

const escalationColors: Record<number, string> = {
  0: "bg-green-50 border-green-200 text-green-800",
  1: "bg-yellow-50 border-yellow-200 text-yellow-800",
  2: "bg-orange-50 border-orange-200 text-orange-800",
  3: "bg-red-50 border-red-200 text-red-800",
};

export default function EWSSection({
  hospitalizationId,
  patientId,
  hospitalId,
  patientDateOfBirth,
  admittedAt,
  isReadOnly = false,
  canOverride = false,
  hospitalizationSuspectedInfection,
  canSetSuspectedInfection = false,
  onSuspectedInfectionChange,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showEWSForm, setShowEWSForm] = useState(false);
  const [showGlucoseForm, setShowGlucoseForm] = useState(false);
  const [showAllGlucose, setShowAllGlucose] = useState(false);
  const [ewsValues, setEwsValues] = useState<Record<string, string>>({});
  const [ewsNotes, setEwsNotes] = useState("");
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showOverridePanel, setShowOverridePanel] = useState(false);
  const [overrideValues, setOverrideValues] = useState<
    Record<string, { min: string; max: string; reason: string }>
  >({});
  const [savingOverrides, setSavingOverrides] = useState(false);

  const ageMonths = differenceInMonths(
    new Date(admittedAt),
    new Date(patientDateOfBirth),
  );

  const { data: scale } = useQuery({
    queryKey: ["ews-scale", ageMonths],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_scales")
        .select("id, code, name")
        .lte("min_age_months", ageMonths)
        .or(`max_age_months.is.null,max_age_months.gte.${ageMonths}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: parameters = [] } = useQuery({
    queryKey: ["ews-parameters", scale?.id],
    enabled: !!scale?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_parameters")
        .select("id, code, name_ru, unit, input_type, display_order")
        .eq("scale_id", scale!.id)
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: thresholds = [] } = useQuery({
    queryKey: ["ews-thresholds", scale?.id, parameters.length],
    enabled: parameters.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_thresholds")
        .select("parameter_id, min_value, max_value, text_value, score, color")
        .in("parameter_id", parameters.map((p: any) => p.id));
      if (error) throw error;
      return data || [];
    },
  });

  const { data: recentReadings = [] } = useQuery({
    queryKey: ["ews-readings", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_readings")
        .select(`
          id, total_score, escalation_level,
          next_due_at, recorded_at, notes,
          profiles!recorded_by(full_name),
          ews_reading_values(
            parameter_id, numeric_value,
            text_value, score)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_voided", false)
        .order("recorded_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: ewsSchedule } = useQuery({
    queryKey: ["ews-schedule", hospitalizationId],
    staleTime: 0,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_schedule")
        .select("next_due_at, last_score")
        .eq("hospitalization_id", hospitalizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: glucoseReadings = [] } = useQuery({
    queryKey: ["blood-glucose", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blood_glucose_readings")
        .select("id, value_mmol, recorded_at, notes, profiles!recorded_by(full_name)")
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeAlert } = useQuery({
    queryKey: ["sepsis-alert", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_alerts")
        .select(`
          id, alert_type, triggered_at,
          trigger_signs, is_active,
          acknowledged_at,
          profiles!acknowledged_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_active", true)
        .eq("alert_type", "paediatric_sepsis_6")
        .maybeSingle();
      return data;
    },
  });

  const { data: alertHistory = [] } = useQuery({
    queryKey: ["sepsis-history", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_alerts")
        .select(`
          id, alert_type, triggered_at,
          trigger_signs, acknowledged_at,
          profiles!acknowledged_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("alert_type", "paediatric_sepsis_6")
        .order("triggered_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });


  const { data: overrides = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["ews-overrides", hospitalizationId],
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ews_patient_overrides")
        .select("parameter_id, override_min, override_max, reason")
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_active", true);
      return data || [];
    },
  });

  const overrideMap = useMemo(() => {
    const map: Record<string, any> = {};
    overrides.forEach((o: any) => {
      map[o.parameter_id] = o;
    });
    return map;
  }, [overrides]);

  useEffect(() => {
    if (!parameters.length) return;
    const init: Record<string, { min: string; max: string; reason: string }> = {};
    parameters.forEach((p: any) => {
      const existing = overrideMap[p.id];
      init[p.id] = {
        min: "",
        max: "",
        reason: existing?.reason ?? "",
      };
    });
    setOverrideValues(init);
  }, [overrides, parameters]);

  const handleSaveOverrides = async () => {
    setSavingOverrides(true);
    for (const param of parameters as any[]) {
      if (param.input_type === "enum") continue;
      const paramZones = thresholds
        .filter((t: any) => t.parameter_id === param.id)
        .sort((a: any, b: any) => {
          const aMin = a.min_value ?? -999999;
          const bMin = b.min_value ?? -999999;
          return aMin - bMin;
        });
      const whiteIdx = paramZones.findIndex((z: any) => z.score === 0);

      const lowUpperBoundaries: number[] = [];
      const highLowerBoundaries: number[] = [];
      let edited = false;

      paramZones.forEach((zone: any, idx: number) => {
        if (zone.score === 0) return;
        const zoneKey = `${param.id}_${idx}`;
        const v = overrideValues[zoneKey];
        const isLow = whiteIdx === -1 ? idx < paramZones.length / 2 : idx < whiteIdx;
        if (isLow) {
          const raw = v?.max ?? zone.max_value?.toString() ?? "";
          const num = raw === "" ? null : parseFloat(raw);
          if (v?.max !== undefined && v.max !== "" && parseFloat(v.max) !== zone.max_value) edited = true;
          if (num !== null && !isNaN(num)) lowUpperBoundaries.push(num);
        } else {
          const raw = v?.min ?? zone.min_value?.toString() ?? "";
          const num = raw === "" ? null : parseFloat(raw);
          if (v?.min !== undefined && v.min !== "" && parseFloat(v.min) !== zone.min_value) edited = true;
          if (num !== null && !isNaN(num)) highLowerBoundaries.push(num);
        }
      });

      const overrideMin = lowUpperBoundaries.length
        ? Math.max(...lowUpperBoundaries) + 1
        : null;
      const overrideMax = highLowerBoundaries.length
        ? Math.min(...highLowerBoundaries) - 1
        : null;
      const reason = overrideValues[param.id]?.reason || null;

      if (edited && (overrideMin !== null || overrideMax !== null)) {
        await supabase
          .from("ews_patient_overrides")
          .upsert(
            {
              hospitalization_id: hospitalizationId,
              patient_id: patientId,
              hospital_id: hospitalId,
              parameter_id: param.id,
              override_min: overrideMin,
              override_max: overrideMax,
              reason,
              overridden_by: user!.id,
              is_active: true,
            },
            { onConflict: "hospitalization_id,parameter_id" },
          );
      } else {
        await supabase
          .from("ews_patient_overrides")
          .update({ is_active: false })
          .eq("hospitalization_id", hospitalizationId)
          .eq("parameter_id", param.id);
      }
    }
    toast.success("Границы нормы обновлены");
    setSavingOverrides(false);
    setShowOverridePanel(false);
    refetchOverrides();
  };


  const calculateScore = (
    paramId: string,
    value: string,
    inputType: string,
  ): { score: number; color: string } => {
    const paramThresholds = thresholds.filter(
      (t: any) => t.parameter_id === paramId,
    );

    if (inputType === "enum") {
      const match = paramThresholds.find(
        (t: any) => t.text_value === value,
      );
      return {
        score: match?.score ?? 0,
        color: match?.color ?? "white"
      };
    }

    const num = parseFloat(value);
    if (isNaN(num)) return {
      score: 0, color: "white" };

    // Check physician override first
    const override = overrideMap[paramId];
    if (override) {
      const min = override.override_min ?? -999999;
      const max = override.override_max ?? 999999;
      if (num >= min && num <= max) {
        return { score: 0, color: "white" };
      }
      // Outside override range — use standard
      // thresholds for abnormal scoring
    }

    const match = paramThresholds.find(
      (t: any) =>
        (t.min_value === null ||
          num >= t.min_value) &&
        (t.max_value === null ||
          num <= t.max_value)
    );

    return {
      score: match?.score ?? 0,
      color: match?.color ?? "white"
    };
  };

  const totalScore = parameters.reduce((sum: number, p: any) => {
    const val = ewsValues[p.id];
    if (!val) return sum;
    return sum + calculateScore(p.id, val, p.input_type).score;
  }, 0);

  const escalationLevel =
    totalScore === 0 ? 0 : totalScore <= 2 ? 1 : totalScore <= 6 ? 2 : 3;

  const gcsActivated = useMemo(() => {
    if (!recentReadings.length) return false;
    const latest = recentReadings[0];
    const consciousnessParam = parameters.find(
      (p: any) => p.code === "consciousness"
    );
    if (!consciousnessParam) return false;
    const consciousnessValue = latest.ews_reading_values?.find(
      (v: any) => v.parameter_id === consciousnessParam.id
    );
    return (
      consciousnessValue?.text_value === "pain" ||
      consciousnessValue?.text_value === "unresponsive"
    );
  }, [recentReadings, parameters]);

  const detectSepsisAlert = useCallback(
    async (readingId: string) => {
      if (!scale?.code.startsWith("pews")) return;
      if (!hospitalizationSuspectedInfection) return;
      const latest = recentReadings[0];
      if (!latest) return;
      const signs: string[] = [];
      const vals = latest.ews_reading_values || [];

      const tempParam = parameters.find((p: any) => p.code === "temperature");
      const tempVal = vals.find(
        (v: any) => v.parameter_id === tempParam?.id
      )?.numeric_value;
      if (tempVal !== null && tempVal !== undefined && (tempVal < 36.0 || tempVal > 38.0))
        signs.push("temperature");

      const hrParam = parameters.find((p: any) => p.code === "heart_rate");
      const hrScore = vals.find(
        (v: any) => v.parameter_id === hrParam?.id
      )?.score ?? 0;
      if (hrScore > 0) signs.push("tachycardia");

      const consParam = parameters.find((p: any) => p.code === "consciousness");
      const consVal = vals.find(
        (v: any) => v.parameter_id === consParam?.id
      )?.text_value;
      if (["voice", "pain", "unresponsive"].includes(consVal ?? ""))
        signs.push("altered_mental_state");

      const crtParam = parameters.find((p: any) => p.code === "crt");
      const crtVal = vals.find(
        (v: any) => v.parameter_id === crtParam?.id
      )?.numeric_value;
      if (crtVal !== null && crtVal !== undefined && crtVal > 2.0)
        signs.push("poor_perfusion");

      if (signs.length < 2) return;

      const { data: existing } = await supabase
        .from("clinical_alerts")
        .select("id")
        .eq("hospitalization_id", hospitalizationId)
        .eq("alert_type", "paediatric_sepsis_6")
        .eq("is_active", true)
        .maybeSingle();
      if (existing) return;

      await supabase.from("clinical_alerts").insert({
        hospital_id: hospitalId,
        hospitalization_id: hospitalizationId,
        patient_id: patientId,
        alert_type: "paediatric_sepsis_6",
        triggered_by_reading_id: readingId,
        trigger_signs: signs,
      });
      queryClient.invalidateQueries({
        queryKey: ["sepsis-alert", hospitalizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["sepsis-history", hospitalizationId],
      });
    },
    [scale, hospitalizationSuspectedInfection, recentReadings, parameters,
     hospitalizationId, hospitalId, patientId, queryClient]
  );

  useEffect(() => {
    const latestId = recentReadings[0]?.id;
    if (latestId) detectSepsisAlert(latestId);
  }, [recentReadings, detectSepsisAlert]);

  const handleAcknowledge = async () => {
    if (!activeAlert) return;
    const { error } = await supabase.rpc("acknowledge_clinical_alert", {
      p_alert_id: activeAlert.id,
    });
    if (error) {
      toast.error(error.message);
    } else {
      queryClient.invalidateQueries({
        queryKey: ["sepsis-alert", hospitalizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["sepsis-history", hospitalizationId],
      });
    }
  };


  const isDue = ewsSchedule && new Date(ewsSchedule.next_due_at) <= new Date();
  const isDueSoon = ewsSchedule && !isDue && (new Date(ewsSchedule.next_due_at).getTime() - Date.now()) <= 30 * 60 * 1000;

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({
        queryKey: ["ews-schedule", hospitalizationId],
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [hospitalizationId, queryClient]);


  const handleSubmitEWS = async () => {
    if (!scale) return;
    setSubmitting(true);
    const values = parameters
      .filter((p: any) => ewsValues[p.id])
      .map((p: any) => ({
        parameter_id: p.id,
        numeric_value: p.input_type !== "enum" ? parseFloat(ewsValues[p.id]) : null,
        text_value: p.input_type === "enum" ? ewsValues[p.id] : null,
      }));

    const { error } = await supabase.rpc("submit_ews_reading", {
      p_hospitalization_id: hospitalizationId,
      p_hospital_id: hospitalId,
      p_patient_id: patientId,
      p_scale_id: scale.id,
      p_values: values,
      p_notes: ewsNotes || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("ШРПУ внесён");
      setShowEWSForm(false);
      setEwsValues({});
      setEwsNotes("");
      queryClient.invalidateQueries({ queryKey: ["ews-readings", hospitalizationId] });
      queryClient.invalidateQueries({ queryKey: ["ews-schedule", hospitalizationId] });
    }
    setSubmitting(false);
  };

  const handleSubmitGlucose = async () => {
    const { error } = await supabase.from("blood_glucose_readings").insert({
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      hospital_id: hospitalId,
      value_mmol: parseFloat(glucoseValue),
      recorded_by: user!.id,
      notes: glucoseNotes || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Глюкоза внесена");
    setShowGlucoseForm(false);
    setGlucoseValue("");
    setGlucoseNotes("");
    queryClient.invalidateQueries({ queryKey: ["blood-glucose", hospitalizationId] });
  };

  const getIntervalLabel = (score: number) => {
    if (score === 0) return "каждые 12 часов";
    if (score <= 2) return "каждые 6 часов";
    if (score <= 6) return "каждый час";
    return "непрерывный мониторинг";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="shrink-0">
          <h3 className="font-semibold">ШРПУ</h3>
          <p className="text-xs text-muted-foreground">
            Шкала: {scale?.name}
          </p>
        </div>
        {ewsSchedule && (
          <div className={cn(
            "flex-1 min-w-0 px-3 py-1.5 rounded border text-sm",
            (ewsSchedule.last_score ?? 0) === 0
              ? "bg-green-50 border-green-200"
              : (ewsSchedule.last_score ?? 0) <= 2
              ? "bg-yellow-50 border-yellow-200"
              : (ewsSchedule.last_score ?? 0) <= 6
              ? "bg-orange-50 border-orange-200"
              : "bg-red-50 border-red-200"
          )}>
            <div className="flex items-center gap-3">
              <span className="font-semibold">
                Балл: {ewsSchedule.last_score ?? 0}
              </span>
              <span className="text-xs">
                Интервал:{" "}
                <strong>
                  {getIntervalLabel(ewsSchedule.last_score ?? 0)}
                </strong>
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Следующее внесение:{" "}
              {format(new Date(ewsSchedule.next_due_at), "dd.MM.yyyy HH:mm")}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {canOverride ? (
            <Button variant="outline" size="sm"
              onClick={() => setShowOverridePanel(!showOverridePanel)}>
              {showOverridePanel ? "Скрыть границы" : "Изменить границы нормы"}
            </Button>
          ) : !isReadOnly ? (
            <Button size="sm" onClick={() => setShowEWSForm(!showEWSForm)}>
              + Внести данные
            </Button>
          ) : null}
        </div>
      </div>


      {showOverridePanel && canOverride && (
        <div className="border rounded-md p-4 space-y-3 bg-blue-50/30">
          <p className="text-xs text-muted-foreground">
            Измените границы нормы для этого пациента. Оставьте поля пустыми для
            стандартных значений.
          </p>
          {(() => {
            const getZones = (paramId: string) => {
              return thresholds
                .filter((t: any) => t.parameter_id === paramId)
                .sort((a: any, b: any) => {
                  const aMin = a.min_value ?? -999999;
                  const bMin = b.min_value ?? -999999;
                  return aMin - bMin;
                });
            };
            const colorLabel: Record<string, string> = {
              white: "Норма",
              yellow: "Внимание",
              pink: "Критично",
            };
            return (
              <>
                {parameters
                  .filter((p: any) => p.input_type !== "enum")
                  .map((p: any) => {
                    const zones = getZones(p.id);
                    const override = overrideMap[p.id];
                    const hasOverride = !!override;
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "rounded-lg border overflow-hidden",
                          hasOverride ? "border-blue-300" : "border-gray-200",
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-between px-3 py-2 bg-gray-50 border-b",
                            hasOverride && "bg-blue-50 border-blue-200",
                          )}
                        >
                          <span className="text-sm font-medium">
                            {p.name_ru}
                            {p.unit && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({p.unit})
                              </span>
                            )}
                          </span>
                          {hasOverride && (
                            <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                              Изменено
                            </span>
                          )}
                        </div>
                        <div className="divide-y">
                          {(() => {
                            const whiteIdx = zones.findIndex(
                              (z: any) => z.score === 0,
                            );
                            // Compute normal range dynamically from edited
                            // yellow/pink boundaries
                            const lowUppers: number[] = [];
                            const highLowers: number[] = [];
                            zones.forEach((z: any, i: number) => {
                              if (z.score === 0) return;
                              const zk = `${p.id}_${i}`;
                              const isLow =
                                whiteIdx === -1
                                  ? i < zones.length / 2
                                  : i < whiteIdx;
                              if (isLow) {
                                const raw =
                                  overrideValues[zk]?.max ??
                                  z.max_value?.toString() ??
                                  "";
                                const n = parseFloat(raw);
                                if (!isNaN(n)) lowUppers.push(n);
                              } else {
                                const raw =
                                  overrideValues[zk]?.min ??
                                  z.min_value?.toString() ??
                                  "";
                                const n = parseFloat(raw);
                                if (!isNaN(n)) highLowers.push(n);
                              }
                            });
                            const computedNormalMin = lowUppers.length
                              ? Math.max(...lowUppers) + 1
                              : null;
                            const computedNormalMax = highLowers.length
                              ? Math.min(...highLowers) - 1
                              : null;
                            return zones.map((zone: any, idx: number) => {
                            const isNormalZone = zone.score === 0;
                            const zoneKey = `${p.id}_${idx}`;
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2",
                                  zone.color === "white"
                                    ? "bg-white"
                                    : zone.color === "yellow"
                                      ? "bg-yellow-50"
                                      : "bg-pink-50",
                                )}
                              >
                                <div
                                  className={cn(
                                    "w-1.5 h-8 rounded-full shrink-0",
                                    zone.color === "white"
                                      ? "bg-gray-300"
                                      : zone.color === "yellow"
                                        ? "bg-yellow-400"
                                        : "bg-pink-500",
                                  )}
                                />
                                <div className="w-20 shrink-0">
                                  <span
                                    className={cn(
                                      "text-xs font-medium",
                                      zone.color === "white"
                                        ? "text-gray-600"
                                        : zone.color === "yellow"
                                          ? "text-yellow-700"
                                          : "text-pink-700",
                                    )}
                                  >
                                    {colorLabel[zone.color as keyof typeof colorLabel]}
                                  </span>
                                  <div className="text-xs text-muted-foreground">
                                    {zone.score > 0 && `+${zone.score} балл`}
                                  </div>
                                </div>
                                <div className="flex-1 text-xs text-muted-foreground">
                                  {isNormalZone &&
                                  (computedNormalMin !== null ||
                                    computedNormalMax !== null) ? (
                                    <span className="text-sm text-blue-600 font-medium">
                                      {computedNormalMin ?? "—"} – {computedNormalMax ?? "—"}
                                      <span className="text-xs ml-1 text-muted-foreground">
                                        (авто)
                                      </span>
                                    </span>
                                  ) : zone.min_value === null ? (
                                    `≤ ${zone.max_value}`
                                  ) : zone.max_value === null ? (
                                    `≥ ${zone.min_value}`
                                  ) : (
                                    `${zone.min_value} – ${zone.max_value}`
                                  )}
                                </div>
                                {zone.score > 0 && canOverride && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">от</span>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={
                                          overrideValues[zoneKey]?.min ??
                                          zone.min_value?.toString() ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          setOverrideValues((prev) => ({
                                            ...prev,
                                            [zoneKey]: {
                                              ...prev[zoneKey],
                                              min: e.target.value,
                                              max:
                                                prev[zoneKey]?.max ??
                                                zone.max_value?.toString() ??
                                                "",
                                              reason: prev[zoneKey]?.reason ?? "",
                                            },
                                          }))
                                        }
                                        className="w-16 h-7 text-xs text-center border-blue-200 focus:border-blue-400"
                                        placeholder={
                                          zone.min_value?.toString() ?? "—"
                                        }
                                      />
                                      <span className="text-xs text-muted-foreground">до</span>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={
                                          overrideValues[zoneKey]?.max ??
                                          zone.max_value?.toString() ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          setOverrideValues((prev) => ({
                                            ...prev,
                                            [zoneKey]: {
                                              ...prev[zoneKey],
                                              min:
                                                prev[zoneKey]?.min ??
                                                zone.min_value?.toString() ??
                                                "",
                                              max: e.target.value,
                                              reason: prev[zoneKey]?.reason ?? "",
                                            },
                                          }))
                                        }
                                        className="w-16 h-7 text-xs text-center border-blue-200 focus:border-blue-400"
                                        placeholder={
                                          zone.max_value?.toString() ?? "—"
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                            });
                          })()}
                        </div>
                        {canOverride && (
                          <div className="px-3 py-2 bg-gray-50 border-t">
                            <Input
                              value={overrideValues[p.id]?.reason ?? ""}
                              onChange={(e) =>
                                setOverrideValues((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    reason: e.target.value,
                                  },
                                }))
                              }
                              className="h-7 text-xs"
                              placeholder="Причина изменения..."
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                {parameters
                  .filter((p: any) => p.input_type === "enum")
                  .map((p: any) => {
                    const zones = getZones(p.id);
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border border-gray-200 overflow-hidden opacity-60"
                      >
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                          <span className="text-sm font-medium">{p.name_ru}</span>
                          <span className="text-xs text-muted-foreground">
                            Нельзя изменить
                          </span>
                        </div>
                        <div className="divide-y">
                          {zones.map((zone: any, idx: number) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2",
                                zone.color === "white"
                                  ? "bg-white"
                                  : zone.color === "yellow"
                                    ? "bg-yellow-50"
                                    : "bg-pink-50",
                              )}
                            >
                              <div
                                className={cn(
                                  "w-1.5 h-6 rounded-full shrink-0",
                                  zone.color === "white"
                                    ? "bg-gray-300"
                                    : zone.color === "yellow"
                                      ? "bg-yellow-400"
                                      : "bg-pink-500",
                                )}
                              />
                              <span className="text-xs text-muted-foreground w-20">
                                {colorLabel[zone.color as keyof typeof colorLabel]}
                              </span>
                              <span className="text-xs">{zone.text_value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </>
            );
          })()}

          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              disabled={savingOverrides}
              onClick={handleSaveOverrides}
            >
              {savingOverrides ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowOverridePanel(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}



      {showEWSForm && (
        <div className="border rounded-md p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Внести показатели ШРПУ</span>
            <span
              className={cn(
                "text-sm font-bold px-2 py-0.5 rounded",
                escalationLevel === 0
                  ? "bg-green-100 text-green-700"
                  : escalationLevel === 1
                  ? "bg-yellow-100 text-yellow-700"
                  : escalationLevel === 2
                  ? "bg-orange-100 text-orange-700"
                  : "bg-red-100 text-red-700",
              )}
            >
              Балл: {totalScore}
            </span>
          </div>

          {parameters.map((p: any) => {
            const val = ewsValues[p.id] ?? "";
            const { color } = val
              ? calculateScore(p.id, val, p.input_type)
              : { color: "white" };
            return (
              <div
                key={p.id}
                className={cn(
                  "p-2 rounded transition-colors",
                  bgColor[color] ?? "bg-white",
                )}
              >
                <Label className="text-xs">
                  {p.name_ru}
                  {p.unit && (
                    <span className="text-muted-foreground ml-1">({p.unit})</span>
                  )}
                </Label>
                {p.input_type === "enum" ? (
                  p.code === "consciousness" || p.code === "oxygen" ? (
                    <Select
                      value={val}
                      onValueChange={(v) =>
                        setEwsValues((prev) => ({ ...prev, [p.id]: v }))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Выбрать..." />
                      </SelectTrigger>
                      <SelectContent>
                        {p.code === "consciousness" ? (
                          <>
                            <SelectItem value="alert">A — Ясное</SelectItem>
                            <SelectItem value="voice">V — Реакция на голос</SelectItem>
                            <SelectItem value="pain">P — Реакция на боль</SelectItem>
                            <SelectItem value="unresponsive">U — Без реакции</SelectItem>
                            {scale?.code === "news2" && (
                              <SelectItem value="confusion">C — Спутанность</SelectItem>
                            )}
                          </>
                        ) : (
                          <>
                            <SelectItem value="air">Воздух</SelectItem>
                            <SelectItem value="o2">Кислород</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  ) : null
                ) : (
                  <Input
                    type="number"
                    step={p.input_type === "numeric" ? "0.1" : "1"}
                    value={val}
                    onChange={(e) =>
                      setEwsValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="h-8 text-sm mt-1"
                    placeholder="—"
                  />
                )}
              </div>
            );
          })}

          <div>
            <Label className="text-xs">Заметки</Label>
            <textarea
              value={ewsNotes}
              onChange={(e) => setEwsNotes(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1 resize-none mt-1"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={submitting || Object.keys(ewsValues).length === 0}
              onClick={handleSubmitEWS}
            >
              {submitting ? "..." : "Сохранить"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowEWSForm(false);
                setEwsValues({});
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      {recentReadings.length > 0 && scale && (
        <EWSChart
          hospitalizationId={hospitalizationId}
          parameters={parameters}
          thresholds={thresholds}
          overrideMap={overrideMap}
          alertSlot={
            !isReadOnly && (isDue || isDueSoon)
              ? (
                <div className={cn(
                  "flex items-center gap-1.5",
                  "px-2 py-1 rounded text-xs border",
                  isDue
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-yellow-50 text-yellow-700 border-yellow-200"
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    isDue
                      ? "bg-red-500 animate-ping"
                      : "bg-yellow-400 animate-pulse"
                  )} />
                  <span>
                    {isDue
                      ? "Необходимо внести ШРПУ"
                      : "Скоро время ШРПУ"}
                  </span>
                </div>
              )
              : undefined
          }
        />
      )}

      <hr className="border-gray-200" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium">Глюкоза крови</h4>
          {!isReadOnly && !canOverride && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowGlucoseForm(true)}
            >
              + Внести
            </Button>
          )}
        </div>


        {showGlucoseForm && (
          <div className="border rounded p-3 space-y-2 bg-muted/30 mb-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Глюкоза (ммоль/л)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={glucoseValue}
                  onChange={(e) => setGlucoseValue(e.target.value)}
                  className="h-8 text-sm mt-1"
                  placeholder="5.5"
                  autoFocus
                />
              </div>
              <Button
                size="sm"
                disabled={!glucoseValue}
                onClick={handleSubmitGlucose}
              >
                Сохранить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowGlucoseForm(false);
                  setGlucoseValue("");
                }}
              >
                ✕
              </Button>
            </div>
          </div>
        )}

        {glucoseReadings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Нет записей
          </p>
        ) : (
          (() => {
            const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
            const visibleGlucose = showAllGlucose
              ? glucoseReadings
              : glucoseReadings.filter(
                  (g: any) => new Date(g.recorded_at) >= fiveDaysAgo,
                );
            return (
              <div className="space-y-2">
                <div className="flex gap-6 overflow-x-auto pb-1 flex-wrap">
                  {visibleGlucose.map((g: any) => {
                    const dt = new Date(g.recorded_at);
                    const value = parseFloat(g.value_mmol);
                    const isHigh = value > 7.8;
                    const isLow = value < 3.9;
                    return (
                      <div key={g.id}
                        className="shrink-0 text-left">
                        <div className={cn(
                          "text-sm font-semibold",
                          isHigh ? "text-yellow-700"
                          : isLow ? "text-pink-700"
                          : "text-gray-800"
                        )}>
                          {value % 1 === 0
                            ? value
                            : value.toFixed(1)}{" "}
                          <span className="font-normal
                            text-xs text-muted-foreground">
                            ммоль/л
                          </span>
                        </div>
                        <div className="text-xs
                          text-muted-foreground mt-0.5">
                          {dt.getDate().toString()
                            .padStart(2, "0")}.
                          {(dt.getMonth()+1).toString()
                            .padStart(2, "0")}{" "}
                          {dt.getHours().toString()
                            .padStart(2, "0")}:
                          {dt.getMinutes().toString()
                            .padStart(2, "0")}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!showAllGlucose &&
                  glucoseReadings.length > visibleGlucose.length && (
                  <button
                    onClick={() =>
                      setShowAllGlucose(true)}
                    className="text-xs text-primary
                      underline">
                    Показать все ({
                      glucoseReadings.length})
                  </button>
                )}
                {showAllGlucose && (
                  <button
                    onClick={() =>
                      setShowAllGlucose(false)}
                    className="text-xs text-primary
                      underline">
                    Скрыть
                  </button>
                )}
              </div>
            );
          })()
        )}
      </div>

      {gcsActivated && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded border bg-red-50 border-red-200 text-red-800 text-sm">
            <span className="font-bold">⚠</span>
            <span className="font-medium">
              Сознание снижено — требуется оценка по ШКГ
            </span>
          </div>
          <AssessmentSection
            scaleCode="gcs"
            hospitalizationId={hospitalizationId}
            patientId={patientId}
            hospitalId={hospitalId}
            isReadOnly={isReadOnly}
          />
        </div>
      )}
    </div>
  );
}
