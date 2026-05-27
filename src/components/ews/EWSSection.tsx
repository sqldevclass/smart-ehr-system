import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInMonths, format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  patientDateOfBirth: string;
  admittedAt: string;
  isReadOnly?: boolean;
  canOverride?: boolean;
}

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
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showEWSForm, setShowEWSForm] = useState(false);
  const [showGlucoseForm, setShowGlucoseForm] = useState(false);
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
        min: existing?.override_min?.toString() ?? "",
        max: existing?.override_max?.toString() ?? "",
        reason: existing?.reason ?? "",
      };
    });
    setOverrideValues(init);
  }, [overrides, parameters]);

  const handleSaveOverrides = async () => {
    setSavingOverrides(true);
    for (const param of parameters as any[]) {
      const val = overrideValues[param.id];
      const hasOverride = val?.min || val?.max;
      if (hasOverride) {
        await supabase
          .from("ews_patient_overrides")
          .upsert(
            {
              hospitalization_id: hospitalizationId,
              patient_id: patientId,
              hospital_id: hospitalId,
              parameter_id: param.id,
              override_min: val.min ? parseFloat(val.min) : null,
              override_max: val.max ? parseFloat(val.max) : null,
              reason: val.reason || null,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">ШРПУ</h3>
          <p className="text-xs text-muted-foreground">
            Шкала: {scale?.name ?? "—"}
          </p>
        </div>
        {!isReadOnly && scale && (
          <Button size="sm" onClick={() => setShowEWSForm(true)}>
            + Внести данные
          </Button>
        )}
      </div>

      {!isReadOnly && (isDue || isDueSoon) && (
        <div className={cn(
          "flex items-center gap-2 p-2 rounded text-sm mb-3",
          isDue
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
        )}>
          <span className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0",
            isDue
              ? "bg-red-500 animate-ping"
              : "bg-yellow-400 animate-pulse"
          )} />
          {isDue
            ? "Необходимо внести показатели ШРПУ"
            : "Скоро время вносить показатели ШРПУ"}
        </div>
      )}

      {ewsSchedule && (
        <div
          className={cn(
            "p-3 rounded-md border text-sm",
            escalationColors[
              (ewsSchedule.last_score ?? 0) === 0
                ? 0
                : (ewsSchedule.last_score ?? 0) <= 2
                ? 1
                : (ewsSchedule.last_score ?? 0) <= 6
                ? 2
                : 3
            ],
          )}
        >
          <div className="font-semibold">Балл: {ewsSchedule.last_score ?? 0}</div>
          {ewsSchedule.next_due_at && (
            <div className="text-xs mt-0.5">
              Следующее внесение:{" "}
              {format(new Date(ewsSchedule.next_due_at), "dd.MM.yyyy HH:mm")}
            </div>
          )}
        </div>
      )}

      {canOverride && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOverridePanel(!showOverridePanel)}
          >
            {showOverridePanel ? "Скрыть границы" : "Изменить границы нормы"}
          </Button>
        </div>
      )}

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
                          {zones.map((zone: any, idx: number) => {
                            const isNormalZone = zone.score === 0;
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
                                  {zone.min_value === null
                                    ? `≤ ${zone.max_value}`
                                    : zone.max_value === null
                                      ? `≥ ${zone.min_value}`
                                      : `${zone.min_value} – ${zone.max_value}`}
                                </div>
                                {isNormalZone && canOverride && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">от</span>
                                      <Input
                                        type="number"
                                        step="0.1"
                                        value={
                                          overrideValues[p.id]?.min ??
                                          zone.min_value ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          setOverrideValues((prev) => ({
                                            ...prev,
                                            [p.id]: {
                                              ...prev[p.id],
                                              min: e.target.value,
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
                                          overrideValues[p.id]?.max ??
                                          zone.max_value ??
                                          ""
                                        }
                                        onChange={(e) =>
                                          setOverrideValues((prev) => ({
                                            ...prev,
                                            [p.id]: {
                                              ...prev[p.id],
                                              max: e.target.value,
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
                          })}
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

      {recentReadings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">История ШРПУ</h4>
          {recentReadings.map((r: any) => (
            <div key={r.id} className="border rounded p-3 text-sm">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "font-bold px-2 py-0.5 rounded text-xs",
                    r.escalation_level === 0
                      ? "bg-green-100 text-green-700"
                      : r.escalation_level === 1
                      ? "bg-yellow-100 text-yellow-700"
                      : r.escalation_level === 2
                      ? "bg-orange-100 text-orange-700"
                      : "bg-red-100 text-red-700",
                  )}
                >
                  {r.total_score} баллов
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(r.recorded_at), "dd.MM.yyyy HH:mm")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {r.profiles?.full_name}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2">
                {(r.ews_reading_values || []).map((v: any) => {
                  const param = parameters.find((p: any) => p.id === v.parameter_id);
                  if (!param) return null;
                  return (
                    <div
                      key={v.parameter_id}
                      className={cn(
                        "text-xs px-1 rounded",
                        v.score === 0
                          ? ""
                          : v.score === 1
                          ? "text-yellow-700"
                          : "text-red-700 font-medium",
                      )}
                    >
                      {param.name_ru}: {v.numeric_value ?? v.text_value}
                      {v.score > 0 && <span className="ml-1">(+{v.score})</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="border-gray-200" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium">Глюкоза крови</h4>
          {!isReadOnly && (
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
          <p className="text-xs text-muted-foreground">Нет записей</p>
        ) : (
          glucoseReadings.map((g: any) => (
            <div
              key={g.id}
              className="flex items-center justify-between text-sm py-1 border-b last:border-0"
            >
              <span className="font-medium">{g.value_mmol} ммоль/л</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(g.recorded_at), "dd.MM.yyyy HH:mm")}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
