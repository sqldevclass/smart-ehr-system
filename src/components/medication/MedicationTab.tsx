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

const STATUS_COLORS: Record<string, string> = {
  preliminary: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  ready_for_execution: "bg-green-100 text-green-700",
  completed: "bg-green-700 text-white",
  cancelled: "bg-gray-100 text-gray-500",
  return: "bg-orange-100 text-orange-700",
  returned_accepted: "bg-gray-200 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  preliminary: "Предварительное",
  in_progress: "В процессе",
  ready_for_execution: "Готов к исполнению",
  completed: "Выполнен",
  cancelled: "Отменён",
  return: "Возврат",
  returned_accepted: "Обратно принято",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full font-medium",
        STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

const initialFormData = {
  drug: null as any,
  dose: "",
  doseUnit: "мг",
  route: "per_os",
  scheduleTimes: ["08:00"],
  durationDays: 7,
  foodRule: "any",
  mixWithDrug: null as any,
  prescriptionType: "regular",
  prnCondition: "",
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

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["drug-prescriptions", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route, schedule_times, duration_days,
          food_rule, prescription_type, prn_condition, notes, is_drafted,
          status_code, prescribed_at, mix_with_drug_id,
          drug_formulary!drug_formulary_id(id, trade_name, inn, dose),
          mix_drug:drug_formulary!mix_with_drug_id(trade_name),
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
          drug_formulary!drug_formulary_id(id, trade_name, inn, dose)
        `)
        .eq("physician_id", physicianId)
        .order("use_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!physicianId,
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
        .select("id, trade_name, inn, dose")
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
    () => prescriptions.filter((p: any) => !p.is_drafted),
    [prescriptions],
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["drug-prescriptions", hospitalizationId],
    });

  const handleAddDrug = (drug: any) => {
    setFormData({ ...initialFormData, drug });
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
      prescription_type: formData.prescriptionType,
      prn_condition: formData.prnCondition || null,
      notes: formData.notes || null,
      is_drafted: true,
      status_code: "preliminary",
      prescribed_by: physicianId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setShowForm(false);
    setFormData(initialFormData);
    invalidate();
  };

  const handleRemoveDraft = async (id: string) => {
    const { error } = await supabase
      .from("drug_prescriptions")
      .delete()
      .eq("id", id);
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
      p_physician_id: physicianId,
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
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{formData.drug?.trade_name}</p>
                <p className="text-xs text-muted-foreground">{formData.drug?.inn}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                ✕
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                value={formData.dose}
                onChange={(e) => setFormData((p) => ({ ...p, dose: e.target.value }))}
                placeholder="Доза"
                className="w-24 h-8 text-sm"
              />
              <Input
                value={formData.doseUnit}
                onChange={(e) => setFormData((p) => ({ ...p, doseUnit: e.target.value }))}
                placeholder="мг"
                className="w-16 h-8 text-sm"
              />
            </div>

            <Select
              value={formData.route}
              onValueChange={(v) => setFormData((p) => ({ ...p, route: v }))}
            >
              <SelectTrigger className="h-8 text-sm">
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

            <div>
              <Label className="text-xs">Время приёма</Label>
              <div className="flex gap-2 flex-wrap mt-1">
                {formData.scheduleTimes.map((t, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      type="time"
                      value={t}
                      onChange={(e) => {
                        const times = [...formData.scheduleTimes];
                        times[i] = e.target.value;
                        setFormData((prev) => ({ ...prev, scheduleTimes: times }));
                      }}
                      className="w-28 h-7 text-xs"
                    />
                    {formData.scheduleTimes.length > 1 && (
                      <button
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            scheduleTimes: prev.scheduleTimes.filter((_, j) => j !== i),
                          }))
                        }
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      scheduleTimes: [...prev.scheduleTimes, "12:00"],
                    }))
                  }
                >
                  + Время
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={formData.durationDays}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, durationDays: Number(e.target.value) }))
                }
                className="w-16 h-8 text-sm"
                min={1}
              />
              <span className="text-sm text-muted-foreground">дней</span>
            </div>

            <Select
              value={formData.foodRule}
              onValueChange={(v) => setFormData((p) => ({ ...p, foodRule: v }))}
            >
              <SelectTrigger className="h-8 text-sm">
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

            <div className="flex gap-2">
              {["regular", "prn", "antibiotic_prophylaxis"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFormData((prev) => ({ ...prev, prescriptionType: t }))}
                  className={cn(
                    "px-2 py-1 rounded text-xs border",
                    formData.prescriptionType === t
                      ? "bg-primary text-white border-primary"
                      : "bg-white border-gray-300",
                  )}
                >
                  {t === "regular"
                    ? "Обычное"
                    : t === "prn"
                    ? "PRN"
                    : "Антибиотикопрофилактика"}
                </button>
              ))}
            </div>

            {formData.prescriptionType === "prn" && (
              <Input
                value={formData.prnCondition}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, prnCondition: e.target.value }))
                }
                placeholder="Условие (напр. при t° ≥ 38°C)"
                className="h-8 text-sm"
              />
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
                  {p.dose_unit} {p.schedule_times?.join(", ")}
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

        {submittedPrescriptions.map((p: any) => (
          <div
            key={p.id}
            className="border-2 border-gray-200 rounded-lg p-3 space-y-1"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-sm">
                  {p.drug_formulary?.trade_name}
                </span>
                {p.prescription_type === "prn" && (
                  <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                    PRN
                  </span>
                )}
                {p.prescription_type === "antibiotic_prophylaxis" && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                    Антибиотикопрофилактика
                  </span>
                )}
              </div>
              <StatusBadge status={p.status_code} />
            </div>
            <p className="text-xs text-muted-foreground">
              {p.dose}
              {p.dose_unit} ·{" "}
              {ROUTES.find((r) => r.code === p.route)?.label} ·{" "}
              {p.schedule_times?.join(", ")}
              {p.duration_days && ` · ${p.duration_days} дней`}
            </p>
            {p.mix_drug && (
              <p className="text-xs text-muted-foreground">
                Смешать с: {p.mix_drug.trade_name}
              </p>
            )}
            {p.prn_condition && (
              <p className="text-xs text-purple-700">При: {p.prn_condition}</p>
            )}
            {!isReadOnly && p.status_code === "preliminary" && (
              <button
                className="text-xs text-red-600 underline"
                onClick={() => handleCancelPrescription(p.id)}
              >
                Отменить
              </button>
            )}
          </div>
        ))}

        {submittedPrescriptions.length === 0 && draftPrescriptions.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground">Нет назначений</p>
        )}
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 border-l overflow-y-auto p-4 space-y-4">
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
