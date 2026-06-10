import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
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
  isReadOnly,
  currentUserId,
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
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
