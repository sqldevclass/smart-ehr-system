import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId?: string;
  visitId?: string;
  patientId: string;
  hospitalId: string;
  documentId: string | null;
  documentTypeId: string;
  isReadOnly: boolean;
  currentUserId: string;
  onDiagnosisChange?: () => void;
}

const diagTypes = [
  { value: "main", label: "Основной" },
  { value: "complication", label: "Осложнение" },
  { value: "competing", label: "Конкурирующий" },
  { value: "background", label: "Фоновый" },
  { value: "comorbid", label: "Сопутствующий" },
];

const diagGroups = [
  { type: "main", label: "Основной" },
  { type: "competing", label: "Конкурирующий" },
  { type: "complication", label: "Осложнение" },
  { type: "comorbid", label: "Сопутствующий" },
  { type: "background", label: "Фоновый" },
];

export default function DiagnosisTab({
  hospitalizationId,
  visitId,
  patientId,
  hospitalId,
  documentId,
  isReadOnly,
  currentUserId,
  onDiagnosisChange,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addType, setAddType] = useState("main");
  const [addNote, setAddNote] = useState("");
  const [addSelected, setAddSelected] = useState<
    { code: string; name_ru: string } | null
  >(null);
  const [pendingSelection, setPendingSelection] = useState<{
    code: string; name_ru: string;
  } | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");

  const qc = useQueryClient();

  // Scales picker state
  const [scalesForDiag, setScalesForDiag] = useState<any[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currentDiagCode, setCurrentDiagCode] = useState<string>("");
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);

  // Scale form state
  const [formScale, setFormScale] = useState<any>(null);
  const [formResponses, setFormResponses] = useState<Record<string, string>>({});

  const scopeKey = hospitalizationId || visitId || "";
  const scopeColumn = hospitalizationId ? "hospitalization_id" : "visit_id";

  const { data: diagnoses = [], refetch: refetchDiagnoses } = useQuery({
    queryKey: ["doc-diagnoses", scopeColumn, scopeKey],
    enabled: !!scopeKey && !!hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes,
          recorded_by, recorded_at,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name)
        `)
        .eq("hospital_id", hospitalId)
        .eq(scopeColumn, scopeKey)
        .order("recorded_at");
      return data || [];
    },
  });

  const { data: icd10Results = [] } = useQuery({
    queryKey: ["icd10-diag-add", addSearch],
    enabled: addSearch.trim().length >= 1 && !addSelected,
    queryFn: async () => {
      const term = addSearch.trim();
      const { data } = await supabase
        .from("icd10_codes")
        .select("id, code, name_ru")
        .eq("is_leaf", true)
        .or(`name_ru.ilike.%${term}%,code.ilike.%${term}%`)
        .limit(20);
      return data || [];
    },
  });

  const { data: assessments = [], refetch: refetchAssessments } = useQuery({
    queryKey: ["scale-assessments", scopeKey, documentId ?? ""],
    enabled: !!scopeKey,
    queryFn: async () => {
      if (!documentId) return [];
      const { data } = await supabase
        .from("patient_scale_assessments")
        .select(`
          id, icd10_code, status, total_score,
          interpretation, assessed_at,
          clinical_scales!scale_id(name, input_mode, scoring)
        `)
        .eq("document_id", documentId)
        .order("created_at");
      return data || [];
    },
  });

  const handleAddDiagnosis = async () => {
    if (!addSelected) return;
    const selectedCode = addSelected.code;
    await supabase.from("patient_diagnoses").insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId || null,
      visit_id: visitId || null,
      icd10_code: selectedCode,
      diagnosis_type: addType,
      notes: addNote || null,
      recorded_by: currentUserId,
    });
    refetchDiagnoses();
    onDiagnosisChange?.();
    setShowAddForm(false);
    setAddSearch("");
    setAddSelected(null);
    setAddNote("");
    setAddType("main");
    setPendingSelection(null);

    // Check for scales linked to this diagnosis
    const { data: scales } = await supabase.rpc(
      "get_scales_for_diagnosis" as any,
      { p_icd10_code: selectedCode }
    );
    if (scales && (scales as any[]).length > 0) {
      setScalesForDiag(scales as any[]);
      setCurrentDiagCode(selectedCode);
      setCurrentDocId(documentId);
      setPickerOpen(true);
    }
  };

  const handleSaveNote = async (id: string, note: string) => {
    await supabase.from("patient_diagnoses").update({ notes: note }).eq("id", id);
    refetchDiagnoses();
    setEditingNoteId(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("patient_diagnoses").delete().eq("id", id);
    refetchDiagnoses();
    onDiagnosisChange?.();
  };

  const computeScore = (items: any[], responses: Record<string, string>) => {
    return items.reduce((sum: number, item: any) => {
      const val = responses[item.id];
      if (!val) return sum;
      if (item.type === "boolean") {
        return sum + (val === "true" ? (item.score ?? 0) : 0);
      }
      if (item.type === "select") {
        const opt = (item.options ?? []).find((o: any) => o.value === val);
        return sum + (opt?.score ?? 0);
      }
      return sum;
    }, 0);
  };

  const getInterpretation = (scoring: any, score: number): string => {
    const ranges: any[] = scoring?.ranges ?? [];
    const match = ranges.find(
      (r: any) => score >= r.min && score <= r.max
    );
    return match?.label ?? "";
  };

  const saveAssessment = async (
    scale: any,
    responses: Record<string, string>,
    status: "completed" | "pending"
  ) => {
    if (!currentDocId || !scale) return;
    const totalScore = status === "completed"
      ? computeScore(scale.items ?? [], responses)
      : null;
    const interpretation = status === "completed" && totalScore !== null
      ? getInterpretation(scale.scoring, totalScore)
      : null;
    await supabase.from("patient_scale_assessments").insert({
      hospitalization_id: hospitalizationId || null,
      patient_id: patientId,
      hospital_id: hospitalId,
      scale_id: scale.scale_id,
      icd10_code: currentDiagCode,
      document_id: currentDocId,
      responses: status === "completed" ? responses : {},
      total_score: totalScore,
      interpretation,
      status,
      assessed_by: currentUserId,
      assessed_at: status === "completed" ? new Date().toISOString() : null,
    } as any);
    refetchAssessments();
  };

  return (
    <div className="space-y-4">
      {!isReadOnly && (
        <div>
          {showAddForm ? (
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <Select value={addType} onValueChange={setAddType}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {diagTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Input
                  placeholder="Поиск по МКБ-10..."
                  value={addSearch}
                  onChange={(e) => {
                    setAddSearch(e.target.value);
                    setAddSelected(null);
                    setPendingSelection(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pendingSelection) {
                      e.preventDefault();
                      handleAddDiagnosis();
                    }
                  }}
                  className={cn(
                    "text-sm",
                    pendingSelection ? "bg-yellow-50 border-yellow-300" : ""
                  )}
                />
                {addSearch.length >= 1 &&
                  !addSelected &&
                  icd10Results.length > 0 && (
                    <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto mt-1">
                      {icd10Results.map((r: any) => (
                        <div
                          key={r.id}
                          className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setPendingSelection({ code: r.code, name_ru: r.name_ru });
                            setAddSearch(`${r.code} — ${r.name_ru}`);
                            setAddSelected({ code: r.code, name_ru: r.name_ru });
                          }}
                        >
                          <span className="font-medium">{r.code}</span>
                          {" — "}
                          {r.name_ru}
                        </div>
                      ))}
                    </div>
                  )}
                {pendingSelection && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-muted-foreground flex-1 truncate">
                      Нажмите Enter для добавления
                    </span>
                    <button
                      className="text-xs text-primary border rounded px-2 py-0.5 hover:bg-primary hover:text-white"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={handleAddDiagnosis}
                    >
                      ✓ Добавить
                    </button>
                    <button
                      className="text-xs text-muted-foreground"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPendingSelection(null);
                        setAddSearch("");
                        setAddSelected(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              <textarea
                placeholder="Заметка (необязательно)"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1 resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!addSelected}
                  onClick={handleAddDiagnosis}
                >
                  Добавить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddSearch("");
                    setAddSelected(null);
                    setAddNote("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              + Добавить диагноз
            </Button>
          )}
        </div>
      )}

      {diagGroups.map(({ type, label }) => {
        const group = diagnoses.filter((d: any) => d.diagnosis_type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">
              {label}
            </h4>
            {group.map((d: any) => {
              const canEdit = !isReadOnly && d.recorded_by === currentUserId;
              const isEditing = editingNoteId === d.id;
              const diagAssessments = assessments.filter(
                (a: any) => a.icd10_code === d.icd10_code
              );
              return (
                <div
                  key={d.id}
                  className="p-3 rounded-md border bg-card space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">
                      {d.icd10_codes?.code || d.icd10_code}
                      {" — "}
                      {d.icd10_codes?.name_ru}
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="text-muted-foreground hover:text-destructive text-xs shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1 mt-1">
                      <textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        className="flex-1 text-sm border rounded px-2 py-1 resize-none"
                        rows={2}
                        autoFocus
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleSaveNote(d.id, editingNoteText)}
                          className="text-green-600 hover:text-green-700 text-lg"
                        >✓</button>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="text-red-500 hover:text-red-600 text-lg"
                        >✗</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        if (!canEdit) return;
                        setEditingNoteId(d.id);
                        setEditingNoteText(d.notes || "");
                      }}
                      className={cn(
                        "text-xs text-muted-foreground mt-1 min-h-[1.25rem]",
                        canEdit && "cursor-pointer hover:bg-muted rounded px-1"
                      )}
                    >
                      {d.notes || (canEdit ? "Добавить заметку..." : "")}
                    </div>
                  )}
                  {diagAssessments.length > 0 && (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      {diagAssessments.map((a: any) => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="font-medium text-muted-foreground">
                            {a.clinical_scales?.name}
                          </span>
                          {a.status === "completed" ? (
                            <span className="flex items-center gap-2">
                              {a.total_score !== null && (
                                <span className="font-semibold">{a.total_score}</span>
                              )}
                              {a.interpretation && (
                                <span className="text-muted-foreground">
                                  {a.interpretation}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">
                              Не заполнено
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Scales Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Шкалы оценки — {currentDiagCode}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Выберите шкалы для заполнения или пропустите их сейчас.
            </p>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {scalesForDiag.map((scale: any) => (
              <div
                key={scale.scale_id}
                className="flex items-start justify-between gap-3 border rounded-md p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{scale.scale_name}</div>
                  {scale.purpose && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {scale.purpose}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await saveAssessment(scale, {}, "pending");
                    }}
                  >
                    Пропустить
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFormScale(scale);
                      setFormResponses({});
                    }}
                  >
                    Заполнить
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scale Form Dialog */}
      <Dialog
        open={!!formScale}
        onOpenChange={(o) => {
          if (!o) { setFormScale(null); setFormResponses({}); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{formScale?.scale_name}</DialogTitle>
            {formScale?.purpose && (
              <p className="text-sm text-muted-foreground">{formScale.purpose}</p>
            )}
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {formScale?.input_mode === "freetext" ? (
              <div className="space-y-2">
                <Label className="text-sm">Значение / результат</Label>
                <input
                  value={formResponses.value ?? ""}
                  onChange={(e) =>
                    setFormResponses((r) => ({ ...r, value: e.target.value }))
                  }
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                  placeholder="Введите числовое значение..."
                />
                <Textarea
                  value={formResponses.note ?? ""}
                  onChange={(e) =>
                    setFormResponses((r) => ({ ...r, note: e.target.value }))
                  }
                  placeholder="Примечание (необязательно)"
                  className="text-sm resize-none"
                  rows={2}
                />
              </div>
            ) : (
              (formScale?.items ?? []).map((item: any) => (
                <div key={item.id} className="space-y-1">
                  <Label className="text-sm">{item.label}</Label>
                  {item.type === "boolean" && (
                    <div className="flex gap-3">
                      {[
                        { label: "Да", value: "true" },
                        { label: "Нет", value: "false" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setFormResponses((r) => ({ ...r, [item.id]: opt.value }))
                          }
                          className={cn(
                            "px-4 py-1.5 text-sm rounded-md border",
                            formResponses[item.id] === opt.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-input hover:bg-muted"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {item.type === "select" && (
                    <Select
                      value={formResponses[item.id] ?? ""}
                      onValueChange={(v) =>
                        setFormResponses((r) => ({ ...r, [item.id]: v }))
                      }
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Выберите..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(item.options ?? []).map((opt: any) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))
            )}
          </div>
          {formScale?.input_mode === "scored" &&
            formScale?.items?.length > 0 && (() => {
              const score = computeScore(formScale.items, formResponses);
              const interp = getInterpretation(formScale.scoring, score);
              return (
                <div className="border rounded-md p-2 bg-muted/30 text-sm flex items-center justify-between">
                  <span className="font-medium">Счёт: {score}</span>
                  {interp && (
                    <span className="text-muted-foreground">{interp}</span>
                  )}
                </div>
              );
            })()
          }
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setFormScale(null); setFormResponses({}); }}
            >
              Отмена
            </Button>
            <Button
              onClick={async () => {
                await saveAssessment(formScale, formResponses, "completed");
                setFormScale(null);
                setFormResponses({});
              }}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
