import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInYears, format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import AssessmentSection from "@/components/assessments/AssessmentSection";
import CpotSection from "@/components/assessments/CpotSection";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  patientDateOfBirth?: string;
  patientGender?: string;
  fallRiskScaleCode?: string;
  isReadOnly?: boolean;
}

const SEPSIS_SIGN_LABELS: Record<string, string> = {
  temperature: "Температура < 36°C или > 38°C",
  tachycardia: "Неадекватная тахикардия",
  altered_mental_state: "Изменение сознания (AVPU)",
  poor_perfusion: "Нарушение перфузии (ВКН > 2 сек)",
};

const formatDateTime = (date: Date): string => {
  const dd = date.getDate().toString().padStart(2, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const hh = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${dd}.${mm} ${hh}:${min}`;
};

const intakeCategories = [
  { code: "per_os", label: "PerOs" },
  { code: "iv", label: "Внутривенно (в/в)" },
  { code: "blood_in", label: "Кровь" },
  { code: "nasogastric_in", label: "Назогастральный зонд" },
  { code: "other_in", label: "Прочие" },
];
const outputCategories = [
  { code: "urine", label: "Моча" },
  { code: "vomit", label: "Рвота" },
  { code: "blood_out", label: "Кровь" },
  { code: "aspiration", label: "Аспирация" },
  { code: "nasogastric_out", label: "Зонд" },
  { code: "other_out", label: "Прочие" },
];

const painCharacterOptions = [
  { code: "Ж", label: "Жгучая" },
  { code: "Кол", label: "Колющая" },
  { code: "Н", label: "Ноющая" },
  { code: "О", label: "Острая" },
  { code: "П", label: "Постоянная" },
  { code: "Пл", label: "Пульсирующая" },
  { code: "Р", label: "Режущая" },
  { code: "Стр", label: "Стреляющая" },
  { code: "Сх", label: "Схваткообразная" },
  { code: "Туп", label: "Тупая" },
  { code: "Тян", label: "Тянущая" },
];

const facesOptions = [
  { label: "Нет боли", score: 0, emoji: "😊", range: "0",
    behaviour: ["Нормальная активность", "Не плачет", "Весёлый"] },
  { label: "Слабая", score: 2, emoji: "😐", range: "1–3",
    behaviour: ["Трёт область боли", "Сниженная активность", "Нейтральное выражение", "Может играть / говорить"] },
  { label: "Умеренная", score: 5, emoji: "😟", range: "4–6",
    behaviour: ["Защищает область боли", "Тихий", "Жалуется на боль", "Утешаемый плач", "Гримасы при движении"] },
  { label: "Сильная", score: 8, emoji: "😭", range: "7–10",
    behaviour: ["Не двигается", "Напуган", "Очень тихий", "Беспокойный", "Безутешный плач"] },
];

const painColor = (score: number) =>
  score === 0 ? "text-green-700"
  : score <= 3 ? "text-yellow-700"
  : score <= 6 ? "text-orange-700"
  : "text-red-700";

export default function NurseMonitoringPanel({
  hospitalizationId,
  patientId,
  hospitalId,
  patientDateOfBirth,
  patientGender,
  fallRiskScaleCode,
  isReadOnly = false,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showAddForm, setShowAddForm] = useState(false);
  const [showGlucoseForm, setShowGlucoseForm] = useState(false);
  const [showAllGlucose, setShowAllGlucose] = useState(false);
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseNotes, setGlucoseNotes] = useState("");

  const [showPainForm, setShowPainForm] = useState(false);
  const [painScore, setPainScore] = useState("");
  const [painNotes, setPainNotes] = useState("");
  const [painCharacter, setPainCharacter] = useState<string[]>([]);
  const [painLocation, setPainLocation] = useState("");
  const [showAllPain, setShowAllPain] = useState(false);

  const [showAllSepsisHistory, setShowAllSepsisHistory] = useState(false);

  const [showFluidForm, setShowFluidForm] = useState(false);
  const [fluidEntryType, setFluidEntryType] = useState<"intake" | "output">("intake");
  const [fluidCategory, setFluidCategory] = useState("");
  const [fluidVolume, setFluidVolume] = useState("");

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const yesterdayStart = useMemo(() => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - 1);
    return d;
  }, [todayStart]);

  const { data: activeFormsData = [] } = useQuery({
    queryKey: ["active-forms", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_active_forms")
        .select("scale_code")
        .eq("hospitalization_id", hospitalizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const activeFormCodes = useMemo(
    () => new Set((activeFormsData as any[]).map((f) => f.scale_code)),
    [activeFormsData],
  );

  const { data: optionalScales = [] } = useQuery({
    queryKey: ["optional-scales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_scales")
        .select("id, code, name_ru")
        .eq("is_optional", true);
      if (error) throw error;
      return data || [];
    },
  });

  const allOptionalForms = useMemo(
    () => [
      ...(optionalScales as any[]).map((s) => ({ code: s.code, name: s.name_ru })),
      { code: "fluid_balance", name: "Баланс жидкости" },
    ],
    [optionalScales],
  );
  const availableForms = useMemo(
    () => allOptionalForms.filter((f) => !activeFormCodes.has(f.code)),
    [allOptionalForms, activeFormCodes],
  );

  const handleActivateForm = async (scaleCode: string) => {
    const { error } = await supabase
      .from("hospitalization_active_forms")
      .insert({
        hospital_id: hospitalId,
        hospitalization_id: hospitalizationId,
        scale_code: scaleCode,
        activated_by: user!.id,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({
      queryKey: ["active-forms", hospitalizationId],
    });
    setShowAddForm(false);
  };

  // Fluid balance
  const { data: todayEntries = [] } = useQuery({
    queryKey: ["fluid-today", hospitalizationId],
    staleTime: 0,
    enabled: activeFormCodes.has("fluid_balance"),
    queryFn: async () => {
      const { data } = await supabase
        .from("fluid_balance_entries")
        .select("id, entry_type, category, volume_ml, recorded_at")
        .eq("hospitalization_id", hospitalizationId)
        .gte("recorded_at", todayStart.toISOString())
        .order("recorded_at", { ascending: true });
      return data || [];
    },
  });

  const { data: yesterdayEntries = [] } = useQuery({
    queryKey: ["fluid-yesterday", hospitalizationId],
    enabled: activeFormCodes.has("fluid_balance"),
    queryFn: async () => {
      const { data } = await supabase
        .from("fluid_balance_entries")
        .select("entry_type, volume_ml")
        .eq("hospitalization_id", hospitalizationId)
        .gte("recorded_at", yesterdayStart.toISOString())
        .lt("recorded_at", todayStart.toISOString());
      return data || [];
    },
  });

  const todayIntake = (todayEntries as any[])
    .filter((e) => e.entry_type === "intake")
    .reduce((sum, e) => sum + e.volume_ml, 0);
  const todayOutput = (todayEntries as any[])
    .filter((e) => e.entry_type === "output")
    .reduce((sum, e) => sum + e.volume_ml, 0);
  const todayBalance = todayIntake - todayOutput;
  const yesterdayIntake = (yesterdayEntries as any[])
    .filter((e) => e.entry_type === "intake")
    .reduce((sum, e) => sum + e.volume_ml, 0);
  const yesterdayOutput = (yesterdayEntries as any[])
    .filter((e) => e.entry_type === "output")
    .reduce((sum, e) => sum + e.volume_ml, 0);
  const yesterdayBalance = yesterdayIntake - yesterdayOutput;

  const handleAddFluidEntry = async () => {
    if (!fluidCategory || !fluidVolume) return;
    const { error } = await supabase.from("fluid_balance_entries").insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      entry_type: fluidEntryType,
      category: fluidCategory,
      volume_ml: parseInt(fluidVolume),
      recorded_by: (user as any)?.id,
      recorded_at: new Date().toISOString(),
    });
    if (!error) {
      setFluidVolume("");
      setFluidCategory("");
      setShowFluidForm(false);
      queryClient.invalidateQueries({ queryKey: ["fluid-today", hospitalizationId] });
      queryClient.invalidateQueries({ queryKey: ["fluid-yesterday", hospitalizationId] });
    } else {
      toast.error(error.message);
    }
  };

  // Glucose
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

  // Pain
  const painScaleType = useMemo<"nrs" | "faces" | undefined>(() => {
    if (!patientDateOfBirth) return undefined;
    const age = differenceInYears(new Date(), new Date(patientDateOfBirth));
    return age < 12 ? "faces" : "nrs";
  }, [patientDateOfBirth]);

  const { data: painReadings = [] } = useQuery({
    queryKey: ["pain-readings", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pain_scale_readings")
        .select(`
          id, scale_type, score, pain_character, pain_location,
          recorded_at, notes,
          profiles!recorded_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const handleSubmitPain = async () => {
    if (!painScore || !painScaleType) return;
    const score = parseInt(painScore);
    if (isNaN(score) || score < 0 || score > 10) return;
    const { error } = await supabase.from("pain_scale_readings").insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      scale_type: painScaleType,
      score,
      recorded_by: user!.id,
      pain_character: painCharacter.length > 0 ? painCharacter : null,
      pain_location: painLocation.trim() || null,
      notes: painNotes || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPainScore("");
    setPainNotes("");
    setPainCharacter([]);
    setPainLocation("");
    setShowPainForm(false);
    queryClient.invalidateQueries({ queryKey: ["pain-readings", hospitalizationId] });
  };

  // Sepsis history
  const { data: alertHistory = [] } = useQuery({
    queryKey: ["sepsis-history", hospitalizationId],
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_alerts")
        .select(`
          id, alert_type, triggered_at,
          trigger_signs, is_active,
          nurse_acknowledged_at,
          physician_acknowledged_at
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("alert_type", "paediatric_sepsis_6")
        .order("triggered_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  // GCS activation — derive from latest EWS reading
  const { data: recentReadings = [] } = useQuery({
    queryKey: ["ews-readings", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ews_readings")
        .select(`
          id, total_score, escalation_level,
          next_due_at, recorded_at, notes,
          profiles!recorded_by(full_name),
          ews_reading_values(parameter_id, numeric_value, text_value, score)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_voided", false)
        .order("recorded_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allParameters = [] } = useQuery({
    queryKey: ["ews-parameters-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ews_parameters")
        .select("id, code")
        .eq("is_active", true);
      return data || [];
    },
  });

  const gcsActivated = useMemo(() => {
    if (!recentReadings.length || !allParameters.length) return false;
    const latest: any = recentReadings[0];
    const consciousnessParam = (allParameters as any[]).find((p) => p.code === "consciousness");
    if (!consciousnessParam) return false;
    const vals = latest.ews_reading_values || [];
    const cv = vals.find((v: any) =>
      (allParameters as any[]).some((p) => p.id === v.parameter_id && p.code === "consciousness")
    );
    return cv?.text_value === "pain" || cv?.text_value === "unresponsive";
  }, [recentReadings, allParameters]);

  const renderSepsisHistoryItem = (a: any) => (
    <div key={a.id} className="border rounded p-3 text-xs space-y-1 bg-red-50/50">
      <div className="flex items-center justify-between">
        <span className="font-medium text-red-700">Педиатрический Сепсис 6</span>
        <span className="text-muted-foreground">
          {format(new Date(a.triggered_at), "dd.MM.yyyy HH:mm")}
        </span>
      </div>
      <div className="text-muted-foreground">
        Признаки:{" "}
        {(a.trigger_signs as string[])
          .map((s: string) => SEPSIS_SIGN_LABELS[s] ?? s)
          .join(", ")}
      </div>
      {a.nurse_acknowledged_at && (
        <div className="text-green-700 text-xs">
          ✓ Медсестра приняла:{" "}
          {format(new Date(a.nurse_acknowledged_at), "dd.MM.yyyy HH:mm")}
        </div>
      )}
      {a.physician_acknowledged_at && (
        <div className="text-green-700 text-xs">
          ✓ Врач принял:{" "}
          {format(new Date(a.physician_acknowledged_at), "dd.MM.yyyy HH:mm")}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={isReadOnly}
          >
            Добавить форму ▾
          </Button>
          {showAddForm && (
            <div className="absolute right-0 top-full mt-1 bg-white border rounded-md shadow-lg z-50 min-w-52 py-1">
              {availableForms.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Все формы добавлены
                </div>
              ) : (
                availableForms.map((f) => (
                  <button
                    key={f.code}
                    onClick={() => handleActivateForm(f.code)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    {f.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Glucose */}
      <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Глюкоза крови</h4>
          <Button size="sm" variant="outline" onClick={() => setShowGlucoseForm(true)} disabled={isReadOnly}>
            + Внести
          </Button>
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
                  disabled={isReadOnly}
                />
              </div>
              <Button size="sm" disabled={!glucoseValue || isReadOnly} onClick={handleSubmitGlucose}>
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
          (() => {
            const GLUCOSE_PAGE_SIZE = 5;
            const visibleGlucose = showAllGlucose
              ? glucoseReadings
              : glucoseReadings.slice(0, GLUCOSE_PAGE_SIZE);
            return (
              <div className="space-y-2">
                <div className="flex gap-6 overflow-x-auto pb-1 flex-wrap">
                  {visibleGlucose.map((g: any) => {
                    const dt = new Date(g.recorded_at);
                    const value = parseFloat(g.value_mmol);
                    const isHigh = value > 7.8;
                    const isLow = value < 3.9;
                    return (
                      <div key={g.id} className="shrink-0 text-left">
                        <div className={cn(
                          "text-sm font-semibold",
                          isHigh ? "text-yellow-700"
                          : isLow ? "text-pink-700"
                          : "text-gray-800"
                        )}>
                          {value % 1 === 0 ? value : value.toFixed(1)}{" "}
                          <span className="font-normal text-xs text-muted-foreground">
                            ммоль/л
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(dt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!showAllGlucose && glucoseReadings.length > GLUCOSE_PAGE_SIZE && (
                  <button
                    onClick={() => setShowAllGlucose(true)}
                    className="text-xs text-primary underline"
                  >
                    Показать все ({glucoseReadings.length})
                  </button>
                )}
                {showAllGlucose && (
                  <button
                    onClick={() => setShowAllGlucose(false)}
                    className="text-xs text-primary underline"
                  >
                    Скрыть
                  </button>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* Pain */}
      {painScaleType && (
        <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              Боль{" "}
              <span className="text-xs text-muted-foreground font-normal">
                ({painScaleType === "nrs" ? "NRS 0–10" : "Шкала лиц"})
              </span>
            </h4>
            <Button size="sm" variant="outline" onClick={() => setShowPainForm(!showPainForm)} disabled={isReadOnly}>
              + Внести
            </Button>
          </div>
          {showPainForm && (
            <div className="border rounded p-3 space-y-2 bg-muted/30">
              {painScaleType === "nrs" ? (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Оценка боли (0–10)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={painScore}
                      onChange={(e) => setPainScore(e.target.value)}
                      className="h-8 text-sm mt-1 w-24"
                      placeholder="0–10"
                      autoFocus
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Характер боли
                      <span className="text-muted-foreground font-normal ml-1">
                        (необязательно)
                      </span>
                    </Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {painCharacterOptions.map((opt) => {
                        const selected = painCharacter.includes(opt.code);
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() =>
                              setPainCharacter((prev) =>
                                selected
                                  ? prev.filter((c) => c !== opt.code)
                                  : [...prev, opt.code]
                              )
                            }
                            className={cn(
                              "px-2 py-0.5 rounded-full text-xs border transition-colors",
                              selected
                                ? "bg-primary text-white border-primary"
                                : "bg-white border-gray-300 hover:bg-muted"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Локализация боли
                      <span className="text-muted-foreground font-normal ml-1">
                        (необязательно)
                      </span>
                    </Label>
                    <Input
                      value={painLocation}
                      onChange={(e) => setPainLocation(e.target.value)}
                      placeholder="Укажите, где болит"
                      className="h-8 text-sm mt-1"
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <Label className="text-xs mb-2 block">Выберите уровень боли</Label>
                  <div className="flex gap-2 flex-wrap">
                    {facesOptions.map((opt) => (
                      <button
                        key={opt.score}
                        onClick={() => setPainScore(String(opt.score))}
                        className={cn(
                          "flex flex-col items-center px-3 py-2 rounded border text-xs transition-colors text-left min-w-[100px]",
                          painScore === String(opt.score)
                            ? "bg-primary/10 border-primary"
                            : "bg-white border-gray-200 hover:bg-muted/50"
                        )}
                      >
                        <span className="text-3xl mb-1">{opt.emoji}</span>
                        <span className="font-medium text-center">{opt.label}</span>
                        <span className="text-muted-foreground text-center mb-1">{opt.range}</span>
                        <ul className="text-muted-foreground text-left mt-1 space-y-0.5 w-full">
                          {opt.behaviour.map((b, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="shrink-0">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <Button size="sm" disabled={!painScore || isReadOnly} onClick={handleSubmitPain}>
                  Сохранить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowPainForm(false);
                    setPainScore("");
                    setPainCharacter([]);
                    setPainLocation("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
          {painReadings.length === 0 ? (
            <p className="text-xs text-muted-foreground">Нет записей</p>
          ) : (
            <div className="space-y-1">
              <div className="flex gap-4 overflow-x-auto pb-1">
                {(showAllPain ? painReadings : painReadings.slice(0, 5)).map((r: any) => {
                  const dt = new Date(r.recorded_at);
                  return (
                    <div key={r.id} className="shrink-0 text-left">
                      <div className={cn("text-sm font-semibold", painColor(r.score))}>
                        {r.score}
                        <span className="text-xs font-normal text-muted-foreground ml-1">/10</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(dt)}
                      </div>
                      {r.pain_character?.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.pain_character.join(", ")}
                        </div>
                      )}
                      {r.pain_location && (
                        <div className="text-xs text-muted-foreground">{r.pain_location}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {!showAllPain && painReadings.length > 5 && (
                <button
                  onClick={() => setShowAllPain(true)}
                  className="text-xs text-primary underline"
                >
                  Показать все ({painReadings.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Braden */}
      <AssessmentSection
        scaleCode="braden"
        hospitalizationId={hospitalizationId}
        patientId={patientId}
        hospitalId={hospitalId}
      />

      {/* Fall risk */}
      {fallRiskScaleCode && (
        <AssessmentSection
          scaleCode={fallRiskScaleCode}
          hospitalizationId={hospitalizationId}
          patientId={patientId}
          hospitalId={hospitalId}
          isReadOnly={false}
          patientDateOfBirth={patientDateOfBirth}
          patientGender={patientGender}
        />
      )}

      {/* GCS (when AVPU = P or U) */}
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
          />
        </div>
      )}

      {/* CPOT */}
      {activeFormCodes.has("cpot") && (
        <CpotSection
          hospitalizationId={hospitalizationId}
          patientId={patientId}
          hospitalId={hospitalId}
        />
      )}

      {/* Fluid balance */}
      {activeFormCodes.has("fluid_balance") && (
        <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Баланс жидкости</h4>
          </div>

          {(yesterdayIntake > 0 || yesterdayOutput > 0) && (
            <div className="text-xs bg-muted/30 rounded p-2 space-y-1">
              <p className="font-medium text-muted-foreground">Предыдущий день</p>
              <div className="flex gap-4">
                <span>Введено: {yesterdayIntake} мл</span>
                <span>Выделено: {yesterdayOutput} мл</span>
                <span
                  className={cn(
                    "font-medium",
                    yesterdayBalance >= 0 ? "text-blue-700" : "text-red-700",
                  )}
                >
                  Баланс: {yesterdayBalance >= 0 ? "+" : ""}
                  {yesterdayBalance} мл
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="font-semibold text-blue-700">{todayIntake} мл</div>
              <div className="text-xs text-muted-foreground">Введено</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-orange-700">{todayOutput} мл</div>
              <div className="text-xs text-muted-foreground">Выделено</div>
            </div>
            <div className="text-center">
              <div
                className={cn(
                  "font-semibold",
                  todayBalance >= 0 ? "text-green-700" : "text-red-700",
                )}
              >
                {todayBalance >= 0 ? "+" : ""}
                {todayBalance} мл
              </div>
              <div className="text-xs text-muted-foreground">Баланс сегодня</div>
            </div>
          </div>

          {todayEntries.length > 0 && (
            <div className="grid grid-cols-2 gap-3 text-xs border-t pt-2">
              <div>
                <p className="font-medium text-muted-foreground mb-1">Введено</p>
                {(todayEntries as any[])
                  .filter((e) => e.entry_type === "intake")
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex justify-between py-0.5 border-b border-muted last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {format(new Date(e.recorded_at), "HH:mm")}{" "}
                        {intakeCategories.find((c) => c.code === e.category)?.label ?? e.category}
                      </span>
                      <span className="font-medium text-blue-700">{e.volume_ml} мл</span>
                    </div>
                  ))}
              </div>
              <div>
                <p className="font-medium text-muted-foreground mb-1">Выделено</p>
                {(todayEntries as any[])
                  .filter((e) => e.entry_type === "output")
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex justify-between py-0.5 border-b border-muted last:border-0"
                    >
                      <span className="text-muted-foreground">
                        {format(new Date(e.recorded_at), "HH:mm")}{" "}
                        {outputCategories.find((c) => c.code === e.category)?.label ?? e.category}
                      </span>
                      <span className="font-medium text-orange-700">{e.volume_ml} мл</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {showFluidForm ? (
            <div className="border rounded p-3 space-y-2 bg-muted/30">
              <div className="flex rounded-md border overflow-hidden w-fit">
                <button
                  onClick={() => {
                    setFluidEntryType("intake");
                    setFluidCategory("");
                  }}
                  className={cn(
                    "px-3 py-1 text-xs font-medium",
                    fluidEntryType === "intake"
                      ? "bg-primary text-white"
                      : "bg-white text-muted-foreground",
                  )}
                >
                  Введено
                </button>
                <button
                  onClick={() => {
                    setFluidEntryType("output");
                    setFluidCategory("");
                  }}
                  className={cn(
                    "px-3 py-1 text-xs font-medium border-l",
                    fluidEntryType === "output"
                      ? "bg-primary text-white"
                      : "bg-white text-muted-foreground",
                  )}
                >
                  Выделено
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(fluidEntryType === "intake" ? intakeCategories : outputCategories).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setFluidCategory(fluidCategory === c.code ? "" : c.code)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border transition-colors",
                      fluidCategory === c.code
                        ? "bg-primary text-white border-primary"
                        : "bg-white border-gray-300 hover:bg-muted text-gray-700"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  value={fluidVolume}
                  onChange={(e) => setFluidVolume(e.target.value)}
                  placeholder="Объём"
                  className="h-8 text-sm w-28"
                />
                <span className="text-sm text-muted-foreground">мл</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!fluidCategory || !fluidVolume || isReadOnly}
                  onClick={handleAddFluidEntry}
                >
                  Добавить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowFluidForm(false);
                    setFluidCategory("");
                    setFluidVolume("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowFluidForm(true)} disabled={isReadOnly}>
              + Добавить запись
            </Button>
          )}
        </div>
      )}

      {/* Sepsis history */}
      {alertHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            История предупреждений о сепсисе
          </p>
          {renderSepsisHistoryItem(alertHistory[0])}
          {showAllSepsisHistory &&
            (alertHistory as any[]).slice(1).map((a: any) => renderSepsisHistoryItem(a))}
          {alertHistory.length > 1 && (
            <button
              onClick={() => setShowAllSepsisHistory(!showAllSepsisHistory)}
              className="text-xs text-primary underline"
            >
              {showAllSepsisHistory
                ? "Скрыть"
                : `Показать ещё (${alertHistory.length - 1})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
