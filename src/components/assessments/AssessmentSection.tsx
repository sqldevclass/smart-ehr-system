import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInYears } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  scaleCode: string;
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  isReadOnly?: boolean;
  patientDateOfBirth?: string;
  patientGender?: string;
}

interface Selection {
  optionId: string;
  score: number;
}

function getRiskLevel(score: number, scaleCode: string) {
  if (scaleCode === "morse") {
    if (score >= 51)
      return {
        level: "high",
        label: "Высокий риск падения",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    if (score >= 25)
      return {
        level: "low",
        label: "Низкий риск падения",
        color: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    return {
      level: "none",
      label: "Нет риска падения",
      color: "bg-green-50 text-green-700 border-green-200",
    };
  }
  // GCS (lower = worse)
  if (scaleCode === "gcs") {
    if (score <= 8)
      return {
        level: "severe",
        label: "Тяжёлое нарушение сознания",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    if (score <= 12)
      return {
        level: "moderate",
        label: "Умеренное нарушение сознания",
        color: "bg-orange-50 text-orange-700 border-orange-200",
      };
    return {
      level: "mild",
      label: "Лёгкое нарушение сознания",
      color: "bg-green-50 text-green-700 border-green-200",
    };
  }
  if (scaleCode === "humpty_dumpty") {
    if (score >= 12)
      return {
        level: "high",
        label: "Высокий риск падения",
        color: "bg-red-100 text-red-800 border-red-300",
      };
    return {
      level: "low",
      label: "Низкий риск падения",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
  }
  // Braden (lower = worse)
  if (score <= 9)
    return {
      level: "very_high",
      label: "Очень высокий риск",
      color: "bg-red-100 text-red-800 border-red-300",
    };
  if (score <= 12)
    return {
      level: "high",
      label: "Высокий риск",
      color: "bg-red-50 text-red-700 border-red-200",
    };
  if (score <= 14)
    return {
      level: "moderate",
      label: "Умеренный риск",
      color: "bg-orange-50 text-orange-700 border-orange-200",
    };
  if (score <= 18)
    return {
      level: "mild",
      label: "Слабый риск",
      color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    };
  return {
    level: "none",
    label: "Нет риска",
    color: "bg-green-50 text-green-700 border-green-200",
  };
}

export default function AssessmentSection({
  scaleCode,
  hospitalizationId,
  patientId,
  hospitalId,
  isReadOnly = false,
  patientDateOfBirth,
  patientGender,
}: Props) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);


  const { data: scale } = useQuery({
    queryKey: ["assessment-scale", scaleCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessment_scales")
        .select(`
          id, code, name_ru, description_ru,
          min_score, max_score, lower_is_worse,
          assessment_scale_items(
            id, code, name_ru, description_ru,
            display_order, min_score, max_score,
            assessment_scale_item_options(
              id, label_ru, description_ru,
              score, display_order)
          )
        `)
        .eq("code", scaleCode)
        .single();
      if (error) throw error;
      const sorted = {
        ...data,
        assessment_scale_items: [...(data.assessment_scale_items || [])]
          .sort((a: any, b: any) => a.display_order - b.display_order)
          .map((it: any) => ({
            ...it,
            assessment_scale_item_options: [
              ...(it.assessment_scale_item_options || []),
            ].sort((a: any, b: any) => a.display_order - b.display_order),
          })),
      };
      return sorted as any;
    },
  });

  // Pre-populate Humpty Dumpty fields from patient demographics
  useEffect(() => {
    if (scaleCode !== "humpty_dumpty") return;
    if (!scale?.assessment_scale_items?.length) return;
    if (Object.keys(selections).length > 0) return; // don't overwrite if already set

    const preSelections: Record<string, { optionId: string; score: number }> = {};

    // Pre-populate Age
    if (patientDateOfBirth) {
      const ageYears = differenceInYears(new Date(), new Date(patientDateOfBirth));
      const ageItem = scale.assessment_scale_items.find((i: any) => i.code === "age");
      if (ageItem) {
        let targetScore: number;
        if (ageYears < 3) targetScore = 4;
        else if (ageYears <= 6) targetScore = 3;
        else if (ageYears <= 12) targetScore = 2;
        else targetScore = 1;

        const matchedOption = ageItem.assessment_scale_item_options.find(
          (o: any) => o.score === targetScore
        );
        if (matchedOption) {
          preSelections[ageItem.id] = {
            optionId: matchedOption.id,
            score: matchedOption.score,
          };
        }
      }
    }

    // Pre-populate Gender
    if (patientGender) {
      const genderItem = scale.assessment_scale_items.find((i: any) => i.code === "gender");
      if (genderItem) {
        const isMale =
          patientGender.toLowerCase().startsWith("m") ||
          patientGender === "м" ||
          patientGender === "male";
        const targetScore = isMale ? 2 : 1;

        const matchedOption = genderItem.assessment_scale_item_options.find(
          (o: any) => o.score === targetScore
        );
        if (matchedOption) {
          preSelections[genderItem.id] = {
            optionId: matchedOption.id,
            score: matchedOption.score,
          };
        }
      }
    }

    if (Object.keys(preSelections).length > 0) {
      setSelections(preSelections);
    }
  }, [scale, scaleCode, patientDateOfBirth, patientGender]);

  const { data: assessments = [] } = useQuery({
    queryKey: ["assessments", hospitalizationId, scaleCode],
    enabled: !!scale?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_assessments")
        .select(`
          id, total_score, risk_level,
          assessed_at, next_assessment_at, notes,
          profiles!assessed_by(full_name),
          patient_assessment_responses(
            item_id, option_id, score)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("scale_id", scale!.id)
        .eq("is_voided", false)
        .order("assessed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const totalScore = Object.values(selections).reduce(
    (sum, s) => sum + s.score,
    0
  );
  const itemCount = scale?.assessment_scale_items?.length ?? 0;
  const allItemsSelected =
    itemCount > 0 && Object.keys(selections).length === itemCount;

  const handleSubmit = async () => {
    if (!scale) return;
    setSubmitting(true);
    const responses = Object.entries(selections).map(
      ([itemId, { optionId, score }]) => ({
        item_id: itemId,
        option_id: optionId,
        score,
      })
    );
    const { error } = await supabase.rpc("submit_assessment", {
      p_hospitalization_id: hospitalizationId,
      p_hospital_id: hospitalId,
      p_patient_id: patientId,
      p_scale_id: scale.id,
      p_responses: responses,
      p_notes: notes || null,
    } as any);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Оценка сохранена");
      setShowForm(false);
      setSelections({});
      setNotes("");
      queryClient.invalidateQueries({
        queryKey: ["assessments", hospitalizationId, scaleCode],
      });
      queryClient.invalidateQueries({
        queryKey: ["nurse-assessments-latest"],
      });
    }
    setSubmitting(false);
  };

  const latest = assessments[0] as any;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm">{scale?.name_ru}</h3>
          {scale?.description_ru && (
            <p className="text-xs text-muted-foreground">
              {scale.description_ru}
            </p>
          )}
        </div>
        {!isReadOnly && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Отмена" : "+ Оценить"}
          </Button>
        )}
      </div>

      {/* Latest summary */}
      {latest && !showForm && (
        <div
          className={cn(
            "rounded border px-3 py-2 text-sm",
            getRiskLevel(latest.total_score, scaleCode).color
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">
              Балл: {latest.total_score} —{" "}
              {getRiskLevel(latest.total_score, scaleCode).label}
            </span>
            <span className="text-xs opacity-75">
              {format(new Date(latest.assessed_at), "dd.MM.yyyy HH:mm")}
            </span>
          </div>
          {latest.next_assessment_at && (
            <div className="text-xs opacity-75 mt-1">
              Следующая оценка:{" "}
              {format(
                new Date(latest.next_assessment_at),
                "dd.MM.yyyy HH:mm"
              )}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      {showForm && scale && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <div
            className={cn(
              "flex items-center justify-between gap-2 px-3 py-2 rounded border text-sm",
              allItemsSelected
                ? getRiskLevel(totalScore, scaleCode).color
                : "bg-white border-gray-200"
            )}
          >
            <span className="font-medium">
              {allItemsSelected
                ? `Балл: ${totalScore} — ${getRiskLevel(totalScore, scaleCode).label}`
                : `Выбрано ${Object.keys(selections).length} из ${itemCount} параметров`}
            </span>
            {allItemsSelected && (
              <span className="text-xs opacity-75">
                {totalScore} / {scale.max_score}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {scale.assessment_scale_items.map((item: any) => {
              const selected = selections[item.id];
              return (
                <div
                  key={item.id}
                  className="border rounded p-2 bg-white space-y-2"
                >
                  <div>
                    <div className="font-medium text-sm">{item.name_ru}</div>
                    {item.description_ru && (
                      <div className="text-xs text-muted-foreground">
                        {item.description_ru}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {item.assessment_scale_item_options.map((opt: any) => {
                      const isSelected = selected?.optionId === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={cn(
                            "flex items-start gap-2 p-2 rounded border cursor-pointer text-xs",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-gray-200 hover:bg-gray-50"
                          )}
                        >
                          <input
                            type="radio"
                            name={`item-${item.id}`}
                            checked={isSelected}
                            onChange={() =>
                              setSelections((prev) => ({
                                ...prev,
                                [item.id]: {
                                  optionId: opt.id,
                                  score: opt.score,
                                },
                              }))
                            }
                            className="mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {opt.label_ru}
                              </span>
                              <span className="text-muted-foreground shrink-0">
                                {opt.score} балл
                              </span>
                            </div>
                            {opt.description_ru && (
                              <div className="text-muted-foreground mt-0.5">
                                {opt.description_ru}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Примечания (необязательно)"
              className="w-full text-sm border rounded px-2 py-1.5 resize-none bg-white"
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!allItemsSelected || submitting}
                onClick={handleSubmit}
              >
                {submitting ? "Сохранение..." : "Сохранить оценку"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setSelections({});
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      {assessments.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            История оценок
          </p>
          {assessments.slice(1).map((a: any) => (
            <div
              key={a.id}
              className={cn(
                "flex items-center justify-between px-3 py-1.5 rounded border text-xs",
                getRiskLevel(a.total_score, scaleCode).color
              )}
            >
              <span className="font-medium">
                {a.total_score} — {getRiskLevel(a.total_score, scaleCode).label}
              </span>
              <span className="opacity-75">
                {format(new Date(a.assessed_at), "dd.MM.yyyy HH:mm")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
