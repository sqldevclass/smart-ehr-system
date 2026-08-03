import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  patientId: string;
  hospitalId: string;
  currentUserId: string;
}

const diagTypes = [
  { value: "main", label: "Основной" },
  { value: "complication", label: "Осложнение" },
  { value: "competing", label: "Конкурирующий" },
  { value: "background", label: "Фоновый" },
  { value: "comorbid", label: "Сопутствующий" },
];

export default function PatientDiagnosisHistory({ patientId, hospitalId, currentUserId }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addSelected, setAddSelected] = useState<{ id: string; code: string; name_ru: string } | null>(null);
  const [addType, setAddType] = useState("main");
  const [addNote, setAddNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: groups = [], refetch } = useQuery({
    queryKey: ["patient-diagnosis-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at, hospitalization_id,
          icd10_codes!icd10_code(code, name_ru),
          hospitalizations(hospitalization_number, admitted_at, discharged_at)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false });
      if (error) throw error;

      const byHosp = new Map<string, any>();
      const general: any[] = [];
      for (const d of data || []) {
        if (!d.hospitalization_id) {
          general.push(d);
          continue;
        }
        if (!byHosp.has(d.hospitalization_id)) {
          byHosp.set(d.hospitalization_id, {
            key: d.hospitalization_id,
            label: `Госпитализация № ${(d as any).hospitalizations?.hospitalization_number}`,
            diagnoses: [],
          });
        }
        byHosp.get(d.hospitalization_id).diagnoses.push(d);
      }
      const result = Array.from(byHosp.values());
      if (general.length > 0) {
        result.push({ key: "general", label: "Общие", diagnoses: general });
      }
      return result;
    },
    enabled: !!patientId && !!hospitalId,
  });

  const { data: icd10Results = [] } = useQuery({
    queryKey: ["icd10-diag-add-standalone", addSearch],
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

  const handleAdd = async () => {
    if (!addSelected) return;
    setSubmitting(true);
    const { error } = await supabase.from("patient_diagnoses").insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      hospitalization_id: null,
      visit_id: null,
      icd10_code: addSelected.code,
      diagnosis_type: addType,
      notes: addNote || null,
      recorded_by: currentUserId,
    });
    setSubmitting(false);
    if (error) return;
    setShowAddForm(false);
    setAddSearch("");
    setAddSelected(null);
    setAddNote("");
    setAddType("main");
    refetch();
  };

  return (
    <div className="p-4 space-y-3">
      <Button variant="outline" size="sm" onClick={() => setShowAddForm((v) => !v)}>
        + Добавить диагноз
      </Button>

      {showAddForm && (
        <div className="border rounded-md p-3 space-y-3 bg-card">
          {addSelected ? (
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{addSelected.code}</span>
                {" — "}
                {addSelected.name_ru}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setAddSelected(null); setAddSearch(""); }}
              >
                Изменить
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Поиск по МКБ-10..."
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
              />
              {icd10Results.length > 0 && (
                <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                  {icd10Results.map((r: any) => (
                    <div
                      key={r.id}
                      className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                      onClick={() => { setAddSelected(r); setAddSearch(""); }}
                    >
                      {r.code} — {r.name_ru}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Select value={addType} onValueChange={setAddType}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {diagTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Примечание"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
          />

          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!addSelected || submitting}>
              {submitting ? "..." : "Сохранить"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-sm text-muted-foreground">Нет диагнозов.</div>
      ) : (
        groups.map((g: any) => {
          const isOpen = expandedGroup === g.key;
          return (
            <div key={g.key} className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedGroup(isOpen ? null : g.key)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
              >
                {g.label}
                <span>{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="border-t">
                  {g.diagnoses.map((d: any) => (
                    <div key={d.id} className="px-3 py-2 text-sm border-b last:border-b-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-medium">{d.icd10_codes?.code}</span>
                          {" — "}
                          {d.icd10_codes?.name_ru}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {d.recorded_at ? format(new Date(d.recorded_at), "dd.MM.yyyy") : "—"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {diagTypes.find((t) => t.value === d.diagnosis_type)?.label}
                        {d.notes ? ` · ${d.notes}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
