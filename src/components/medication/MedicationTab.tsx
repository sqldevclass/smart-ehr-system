import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import PrescriptionGrid from "@/components/medication/PrescriptionGrid";

const TIME_CHIPS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  physicianId: string;
  isReadOnly: boolean;
  patientAllergies: any[];
}

const ROUTES = [
  { code: "per_os", label: "Перорально" },
  { code: "iv_bolus", label: "Внутривенно болюсно" },
  { code: "iv_drip", label: "Внутривенно капельно" },
  { code: "im", label: "Внутримышечно" },
  { code: "sc", label: "Подкожно" },
  { code: "nasal", label: "Назально" },
  { code: "rectal", label: "Ректально" },
  { code: "nasogastric", label: "Назогастрально" },
  { code: "sublingual", label: "Подъязык" },
  { code: "ear", label: "В ухо" },
  { code: "eye", label: "В глаз" },
  { code: "vaginal", label: "Вагинально" },
  { code: "epidural", label: "Эпидурально" },
  { code: "transdermal", label: "Трансдермально" },
  { code: "intrathecal", label: "Интратекально" },
  { code: "intraosseous", label: "Внутрикостно" },
  { code: "endotracheal", label: "Эндотрахеально" },
  { code: "other", label: "Другое" },
];

const FOOD_RULES = [
  { code: "any", label: "Когда угодно" },
  { code: "before_meal", label: "Перед едой" },
  { code: "during_meal", label: "Во время еды" },
  { code: "after_meal", label: "После еды" },
  { code: "before_sleep", label: "Перед сном" },
  { code: "fasting", label: "Натощак" },
];

const initialFormData = {
  drug: null as any,
  dose: "",
  doseUnit: "мг",
  route: "per_os",
  scheduleTimes: [] as Array<{ time: string; dose: string }>,
  durationDays: 0,
  foodRule: "any",
  mixWithDrug: null as any,
  mixDose: "",
  prescriptionType: "regular",
  prnCondition: "",
  maxDailyDose: "",
  notes: "",
};

export default function MedicationTab({
  hospitalizationId,
  patientId,
  hospitalId,
  physicianId,
  isReadOnly,
}: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [mixMode, setMixMode] = useState(false);

  const [startDay, setStartDay] = useState(new Date());
  const formatStartDay = (d: Date) => format(d, "dd.MM.yyyy");

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["drug-prescriptions", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, patient_id, dose, dose_unit, route, schedule_times, duration_days,
          food_rule, prescription_type, prn_condition, notes, is_drafted,
          status_code, prescribed_at, mix_with_drug_id, mix_dose,
          drug_formulary!drug_formulary_id(id, trade_name, inn, dose),
          mix_drug:drug_formulary!mix_with_drug_id(id, trade_name, inn, dose),
          profiles!prescribed_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .neq("status_code", "cancelled")
        .order("prescribed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ["physician-favorites", physicianId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_favorites")
        .select(`
          drug_formulary_id, use_count,
          drug_formulary!drug_formulary_id(id, trade_name, inn, dose, unit_id, release_form_id, units_of_measurement!unit_id(abbreviation), release_forms!release_form_id(name_ru))
        `)
        .eq("physician_id", physicianId)
        .order("use_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!physicianId,
  });

  const { data: allSlots = [] } = useQuery({
    queryKey: ["all-slots", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, prescription_id, scheduled_at, administered_at, administered_by,
          dose_given, override_dose, original_scheduled_at, status, notes,
          profiles!administered_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("drug_formulary")
        .select("id, trade_name, inn, dose, unit_id, release_form_id, units_of_measurement!unit_id(abbreviation), release_forms!release_form_id(name_ru)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .or(`trade_name.ilike.%${searchQuery}%,inn.ilike.%${searchQuery}%`)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, hospitalId]);

  const draftPrescriptions = useMemo(
    () => prescriptions.filter((p: any) => p.is_drafted),
    [prescriptions],
  );
  const submittedPrescriptions = useMemo(
    () =>
      prescriptions
        .filter((p: any) => !p.is_drafted)
        .sort(
          (a: any, b: any) =>
            new Date(a.prescribed_at).getTime() -
            new Date(b.prescribed_at).getTime(),
        ),
    [prescriptions],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["drug-prescriptions", hospitalizationId],
    });

  const invalidateSlots = () =>
    queryClient.invalidateQueries({
      queryKey: ["all-slots", hospitalizationId],
    });

  const handleExtend = async (prescriptionId: string, date: Date) => {
    const { error } = await supabase.rpc("extend_prescription_to_date", {
      p_prescription_id: prescriptionId,
      p_target_date: format(date, "yyyy-MM-dd"),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
    invalidateSlots();
  };

  const handleCancelDay = async (prescriptionId: string, date: Date) => {
    const { error } = await supabase.rpc("cancel_day_slots", {
      p_prescription_id: prescriptionId,
      p_date: format(date, "yyyy-MM-dd"),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateSlots();
  };


  const handleAddDrug = (drug: any) => {
    if (mixMode && formData.drug) {
      setFormData((prev) => ({
        ...prev,
        mixWithDrug: drug,
        mixDose: drug.dose ?? "",
      }));
      setMixMode(false);
      return;
    }
    const doseMatch = drug.dose?.match(/^([\d.]+)\s*(.*)$/);
    const unitAbbr = (drug as any).units_of_measurement?.abbreviation
      ?? doseMatch?.[2]
      ?? "мг";
    setFormData({
      ...initialFormData,
      drug,
      dose: doseMatch?.[1] ?? "",
      doseUnit: unitAbbr,
    });
    setShowForm(true);
  };

  const handleSaveDraft = async () => {
    if (!formData.drug || !formData.dose) return;
    const { error } = await supabase.from("drug_prescriptions").insert({
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      patient_id: patientId,
      physician_id: physicianId,
      drug_formulary_id: formData.drug.id,
      dose: formData.dose,
      dose_unit: formData.doseUnit,
      route: formData.route,
      schedule_times: formData.scheduleTimes,
      duration_days: formData.durationDays,
      food_rule: formData.foodRule,
      mix_with_drug_id: formData.mixWithDrug?.id ?? null,
      mix_dose: formData.mixDose || null,
      prescription_type: formData.prescriptionType,
      prn_condition: formData.prnCondition || null,
      notes:
        [
          formData.notes,
          formData.maxDailyDose
            ? `Макс. доза: ${formData.maxDailyDose}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || null,
      is_drafted: true,
      status_code: "preliminary",
      prescribed_by: physicianId,
      prescribed_at: new Date().toISOString(),
      start_date: format(startDay, "yyyy-MM-dd"),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setShowForm(false);
    setFormData(initialFormData);
    setMixMode(false);
    invalidate();
  };

  const handleRemoveDraft = async (id: string) => {
    const { error } = await supabase
      .from("drug_prescriptions")
      .delete()
      .eq("id", id)
      .eq("is_drafted", true);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  const handleSubmitAll = async () => {
    const { error } = await supabase.rpc("submit_prescriptions", {
      p_hospitalization_id: hospitalizationId,
      p_hospital_id: hospitalId,
      p_staff_role_id: physicianId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Назначения отправлены");
    invalidate();
  };

  const handleCancelPrescription = async (id: string) => {
    const { error } = await supabase.rpc("update_prescription_status", {
      p_prescription_id: id,
      p_new_status: "cancelled",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left — prescriptions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showForm && formData.drug && (
          <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="shrink-0">
                <p className="font-semibold text-sm">{formData.drug?.trade_name}</p>
                <p className="text-xs text-muted-foreground">{formData.drug?.inn}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Input
                  value={formData.dose}
                  onChange={(e) => setFormData((p) => ({ ...p, dose: e.target.value }))}
                  placeholder="Доза"
                  className="w-20 h-8 text-sm"
                />
                <span className="text-sm text-muted-foreground px-1 min-w-[32px]">
                  {formData.doseUnit}
                </span>
              </div>
              <div className="flex gap-1 shrink-0 flex-wrap">
                {["regular", "prn", "antibiotic_prophylaxis"].map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        prescriptionType: t,
                        scheduleTimes: t === "prn" ? [] : prev.scheduleTimes,
                      }))
                    }
                    className={cn(
                      "px-2 py-1 rounded text-xs border",
                      formData.prescriptionType === t
                        ? "bg-primary text-white border-primary"
                        : "bg-white border-gray-300",
                    )}
                  >
                    {t === "regular"
                      ? "Стандартное"
                      : t === "prn"
                      ? "PRN"
                      : "Антибиотикопрофилактика"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMixMode((prev) => {
                      const next = !prev;
                      if (!next) {
                        setFormData((p) => ({
                          ...p,
                          mixWithDrug: null,
                          mixDose: "",
                        }));
                      }
                      return next;
                    });
                  }}
                  className={cn(
                    "px-2 py-1 rounded text-xs border",
                    mixMode
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white border-gray-300",
                  )}
                >
                  Mix with
                </button>
              </div>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowForm(false)}>
                ✕
              </Button>
            </div>

            {formData.mixWithDrug && (
              <div className="flex items-center gap-2 mt-1 pl-4 border-l-2 border-blue-300">
                <span className="text-xs text-blue-600 font-medium">+</span>
                <span className="text-sm font-medium">
                  {formData.mixWithDrug.trade_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formData.mixWithDrug.inn}
                </span>
                <Input
                  value={formData.mixDose}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, mixDose: e.target.value }))
                  }
                  placeholder="Доза"
                  className="w-24 h-7 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      mixWithDrug: null,
                      mixDose: "",
                    }))
                  }
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={formData.route}
                onValueChange={(v) => setFormData((p) => ({ ...p, route: v }))}
              >
                <SelectTrigger className="w-auto min-w-fit h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTES.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={formData.foodRule}
                onValueChange={(v) => setFormData((p) => ({ ...p, foodRule: v }))}
              >
                <SelectTrigger className="w-auto min-w-fit h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOOD_RULES.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, durationDays: Number(e.target.value) }))
                  }
                  className="w-14 h-8 text-sm"
                  min={0}
                />
                <span className="text-sm text-muted-foreground">дней</span>
              </div>
            </div>

            <div>
              <Label className="text-xs">Дата начала</Label>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() =>
                    setStartDay((d) => {
                      const prev = new Date(d);
                      prev.setDate(prev.getDate() - 1);
                      return prev;
                    })
                  }
                  className="w-7 h-7 rounded border flex items-center justify-center hover:bg-muted text-sm"
                >
                  ◀
                </button>
                <span className="text-sm font-medium min-w-24 text-center">
                  {formatStartDay(startDay)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setStartDay((d) => {
                      const next = new Date(d);
                      next.setDate(next.getDate() + 1);
                      return next;
                    })
                  }
                  className="w-7 h-7 rounded border flex items-center justify-center hover:bg-muted text-sm"
                >
                  ▶
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Время приёма</Label>
              <div
                className={cn(
                  "flex flex-wrap gap-1 max-h-32 overflow-y-auto p-1 border rounded mt-1",
                  formData.prescriptionType === "prn"
                    ? "opacity-40 pointer-events-none bg-gray-50"
                    : "bg-white",
                )}
              >
                {TIME_CHIPS.map((t) => {
                  const selected = formData.scheduleTimes.find((s) => s.time === t);
                  return (
                    <div key={t} className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const exists = formData.scheduleTimes.find((s) => s.time === t);
                          if (exists) {
                            setFormData((prev) => ({
                              ...prev,
                              scheduleTimes: prev.scheduleTimes.filter((s) => s.time !== t),
                            }));
                          } else {
                            setFormData((prev) => ({
                              ...prev,
                              scheduleTimes: [
                                ...prev.scheduleTimes,
                                {
                                  time: t,
                                  dose: prev.dose ?? "",
                                },
                              ].sort((a, b) => a.time.localeCompare(b.time)),
                            }));
                          }
                        }}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-xs border transition-colors",
                          selected
                            ? "bg-primary text-white border-primary"
                            : "bg-white border-gray-200 hover:bg-muted text-gray-600",
                        )}
                      >
                        {t}
                      </button>
                      {selected && (
                        <input
                          type="text"
                          value={selected.dose}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              scheduleTimes: prev.scheduleTimes.map((s) =>
                                s.time === t ? { ...s, dose: e.target.value } : s,
                              ),
                            }))
                          }
                          className="w-14 text-xs border rounded px-1 py-0.5 text-center mt-0.5"
                          placeholder="доза"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {formData.prescriptionType === "prn" && (
                <p className="text-xs text-muted-foreground mt-1">
                  PRN — время не требуется
                </p>
              )}
            </div>

            {formData.prescriptionType === "prn" && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Условие</Label>
                  <Input
                    value={formData.prnCondition}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, prnCondition: e.target.value }))
                    }
                    placeholder="напр. при t° ≥ 38°C"
                    className="h-8 text-sm mt-1"
                  />
                </div>
                <div className="w-36 shrink-0">
                  <Label className="text-xs">Макс. суточная доза</Label>
                  <Input
                    value={formData.maxDailyDose ?? ""}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, maxDailyDose: e.target.value }))
                    }
                    placeholder="напр. 4г"
                    className="h-8 text-sm mt-1"
                  />
                </div>
              </div>
            )}

            <Input
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Примечания"
              className="h-8 text-sm"
            />

            <Button
              size="sm"
              disabled={!formData.dose || !formData.drug}
              onClick={handleSaveDraft}
            >
              Добавить в список
            </Button>
          </div>
        )}


        {draftPrescriptions.length > 0 && (
          <div className="border rounded-lg p-3 space-y-2 bg-yellow-50 border-yellow-200">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-yellow-800">
                Черновик ({draftPrescriptions.length} назначений)
              </p>
              <Button size="sm" onClick={handleSubmitAll}>
                Заказывать →
              </Button>
            </div>
            {draftPrescriptions.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span>
                  {p.drug_formulary?.trade_name} {p.dose}
                  {p.dose_unit} {p.schedule_times?.map((s: any) => s.time).join(", ")}
                </span>
                <button
                  className="text-xs text-red-600"
                  onClick={() => handleRemoveDraft(p.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <PrescriptionGrid
          prescriptions={submittedPrescriptions}
          slots={allSlots}
          viewerRole="physician"
          isReadOnly={isReadOnly}
          hospitalId={hospitalId}
          hospitalizationId={hospitalizationId}
          onExtend={handleExtend}
          onCancelDay={handleCancelDay}
          onAdministerSlot={() => {}}
          onSkipSlot={() => {}}
        />

        {submittedPrescriptions.length === 0 && draftPrescriptions.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">Нет назначений</p>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 border-l overflow-y-auto p-4 space-y-4">
        {mixMode && (
          <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
            Выберите препарат для смешивания
          </div>
        )}
        <div className="space-y-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск препарата..."
            className="h-8 text-sm"
          />
          {searching && <p className="text-xs text-muted-foreground">Поиск...</p>}
          {searchResults.map((drug) => (
            <button
              key={drug.id}
              onClick={() => handleAddDrug(drug)}
              className="w-full text-left p-2 rounded border hover:bg-muted/50 space-y-0.5"
            >
              <p className="text-sm font-medium">{drug.trade_name}</p>
              <p className="text-xs text-muted-foreground">
                {drug.inn} · {drug.dose}
              </p>
            </button>
          ))}
        </div>

        {!searchQuery && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Часто назначаемые
            </p>
            {favorites.map((fav: any) => (
              <button
                key={fav.drug_formulary_id}
                onClick={() => handleAddDrug(fav.drug_formulary)}
                className="w-full text-left p-2 rounded border hover:bg-muted/50 space-y-0.5"
              >
                <p className="text-sm font-medium">
                  {fav.drug_formulary?.trade_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fav.drug_formulary?.inn} · {fav.drug_formulary?.dose}
                </p>
              </button>
            ))}
            {favorites.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Нет часто назначаемых препаратов
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
