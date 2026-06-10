import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import ICD10SearchField from "./ICD10SearchField";

interface Props {
  hospitalizationId?: string;
  visitId?: string;
  patientId: string;
  hospitalId: string;
  documentId: string | null;
  documentTypeId: string;
  isReadOnly: boolean;
  currentUserId: string;
  mainDiagnosisFieldId: string | null;
  onMainDiagnosisChange: (value: string) => void;
  mainDiagnosisValue: string;
}

const diagTypes = [
  { value: "main", label: "Основной" },
  { value: "complication", label: "Осложнение" },
  { value: "competing", label: "Конкурирующий" },
  { value: "background", label: "Фоновый" },
  { value: "comorbid", label: "Сопутствующий" },
];

export default function DiagnosisTab({
  hospitalizationId,
  visitId,
  patientId,
  hospitalId,
  isReadOnly,
  currentUserId,
  mainDiagnosisValue,
  onMainDiagnosisChange,
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

  const handleAddDiagnosis = async () => {
    if (!addSelected) return;
    await supabase.from("patient_diagnoses").insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId || null,
      visit_id: visitId || null,
      icd10_code: addSelected.code,
      diagnosis_type: addType,
      notes: addNote || null,
      recorded_by: currentUserId,
    });
    if (addType === "main") {
      const displayValue = `${addSelected.code} — ${addSelected.name_ru}`;
      onMainDiagnosisChange(displayValue);
    }
    refetchDiagnoses();
    setShowAddForm(false);
    setAddSearch("");
    setAddSelected(null);
    setAddNote("");
    setAddType("main");
    setPendingSelection(null);
  };

  const handleSaveNote = async (id: string, note: string) => {
    await supabase.from("patient_diagnoses").update({ notes: note }).eq("id", id);
    refetchDiagnoses();
    setEditingNoteId(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("patient_diagnoses").delete().eq("id", id);
    refetchDiagnoses();
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">
          Основной диагноз
          <span className="text-red-500 ml-1">*</span>
        </label>
        {isReadOnly ? (
          <div className="text-sm mt-1">{mainDiagnosisValue || "—"}</div>
        ) : (
          <ICD10SearchField
            fieldId="main-diagnosis-field"
            label=""
            value={mainDiagnosisValue}
            onChange={(val) => {
              onMainDiagnosisChange(val);
            }}
            onBlur={() => {
              const val = mainDiagnosisValue;
              const code = val.split(" — ")[0];
              const name = val.split(" — ")[1] || "";
              if (code && name) {
                supabase
                  .from("patient_diagnoses")
                  .upsert(
                    {
                      patient_id: patientId,
                      hospital_id: hospitalId,
                      hospitalization_id: hospitalizationId || null,
                      visit_id: visitId || null,
                      icd10_code: code,
                      diagnosis_type: "main",
                      recorded_by: currentUserId,
                    },
                    {
                      onConflict:
                        "patient_id,hospitalization_id,icd10_code,diagnosis_type",
                    }
                  )
                  .then(() => refetchDiagnoses());
              }
            }}
            isReadOnly={isReadOnly}
          />
        )}
      </div>

      <hr className="border-gray-200" />

      <div className="space-y-2">
        {diagnoses.map((d: any) => {
          const canEdit = !isReadOnly && d.recorded_by === currentUserId;
          const isEditing = editingNoteId === d.id;
          const typeLabel =
            diagTypes.find((t) => t.value === d.diagnosis_type)?.label ??
            d.diagnosis_type;
          return (
            <div
              key={d.id}
              className="p-3 rounded-md border bg-card space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {typeLabel}
                  </span>
                  <div className="text-sm font-medium">
                    {d.icd10_codes?.code || d.icd10_code}
                    {" — "}
                    {d.icd10_codes?.name_ru}
                  </div>
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
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingNoteId(null)}
                      className="text-red-500 hover:text-red-600 text-lg"
                    >
                      ✗
                    </button>
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
            </div>
          );
        })}
      </div>

      {!isReadOnly && (
        <div>
          {showAddForm ? (
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="relative">
                <Input
                  placeholder="Поиск по МКБ-10..."
                  value={addSearch}
                  onChange={(e) => {
                    setAddSearch(e.target.value);
                    setAddSelected(null);
                  }}
                  className="text-sm"
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
                            setAddSelected({
                              code: r.code,
                              name_ru: r.name_ru,
                            });
                            setAddSearch(`${r.code} — ${r.name_ru}`);
                          }}
                        >
                          <span className="font-medium">{r.code}</span>
                          {" — "}
                          {r.name_ru}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
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
    </div>
  );
}
