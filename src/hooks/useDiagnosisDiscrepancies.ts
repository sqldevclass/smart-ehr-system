import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { OPERATION_PROTOCOL_DOC_TYPE_ID } from "@/lib/documentTypeIds";
import {
  buildDiagnosisDiscrepancies, OPERATION_NAME_FIELD_ID, SURGEON_FIELD_ID,
  type DiagnosisRef, type ProtocolDiagnosisInput,
} from "@/lib/diagnosisDiscrepancy";

const textOrNull = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export function useDiagnosisDiscrepancies(from: string, to: string) {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;
  const query = useQuery({
    queryKey: ["diagnosis-discrepancies", hospitalId, from, to],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_documents")
        .select("id, hospitalization_id, completed_at, patients(first_name, last_name, patient_number), hospitalizations(hospitalization_number), completed_by_profile:profiles!patient_documents_completed_by_fkey(full_name), patient_document_field_values(field_definition_id, value), document_diagnoses(phase, icd10_code, diagnosis_type, icd10_codes!icd10_code(name_ru))")
        .eq("hospital_id", hospitalId!)
        .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
        .eq("status", "completed")
        .gte("completed_at", from)
        .lte("completed_at", to)
        .in("patient_document_field_values.field_definition_id", [SURGEON_FIELD_ID, OPERATION_NAME_FIELD_ID])
        .eq("document_diagnoses.diagnosis_type", "main");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const result = useMemo(() => {
    const inputs: ProtocolDiagnosisInput[] = (query.data ?? []).map((d: any) => {
      const fv = (id: string) =>
        textOrNull((d.patient_document_field_values ?? []).find((f: any) => f.field_definition_id === id)?.value);
      const diag = (phase: string): DiagnosisRef | null => {
        const r = (d.document_diagnoses ?? []).find((x: any) => x.phase === phase && x.diagnosis_type === "main");
        return r ? { code: r.icd10_code, name: r.icd10_codes?.name_ru ?? "" } : null;
      };
      return {
        documentId: d.id,
        hospitalizationId: d.hospitalization_id ?? null,
        hospitalizationNumber: d.hospitalizations?.hospitalization_number ?? null,
        patientName: [d.patients?.last_name, d.patients?.first_name].filter(Boolean).join(" "),
        patientNumber: d.patients?.patient_number ?? null,
        completedAt: d.completed_at,
        surgeonText: fv(SURGEON_FIELD_ID),
        completedByName: textOrNull(d.completed_by_profile?.full_name),
        operationName: fv(OPERATION_NAME_FIELD_ID),
        preop: diag("preop"),
        postop: diag("postop"),
      };
    });
    return buildDiagnosisDiscrepancies(inputs);
  }, [query.data]);

  return { rows: result.rows, withoutDiagnoses: result.withoutDiagnoses, isLoading: query.isLoading, error: query.error };
}
