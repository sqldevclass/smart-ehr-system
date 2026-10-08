import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  patientId: string;
  hospitalId: string;
}

const diagTypes = [
  { value: "main", label: "Основной" },
  { value: "complication", label: "Осложнение" },
  { value: "competing", label: "Конкурирующий" },
  { value: "background", label: "Фоновый" },
  { value: "comorbid", label: "Сопутствующий" },
];

export default function PatientDiagnosisHistory({ patientId, hospitalId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initializedExpand = useRef(false);

  const { data: groups = [] } = useQuery({
    queryKey: ["patient-diagnosis-history", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at, hospitalization_id,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name),
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

  useEffect(() => {
    if (initializedExpand.current) return;
    if (groups.length === 0) return;
    initializedExpand.current = true;
    const current = groups.find((g: any) =>
      g.diagnoses.some((d: any) => d.hospitalizations && d.hospitalizations.discharged_at === null)
    );
    if (current) {
      setExpanded(new Set([current.key]));
    }
  }, [groups]);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="p-4 space-y-3">
      {groups.length === 0 ? (
        <div className="text-sm text-muted-foreground">Нет диагнозов.</div>
      ) : (
        groups.map((g: any) => {
          const isOpen = expanded.has(g.key);
          return (
            <div key={g.key} className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
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
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {d.profiles?.full_name}
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
