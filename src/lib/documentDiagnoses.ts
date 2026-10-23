import { supabase } from "@/integrations/supabase/client";

export type DiagnosisPhase = "preop" | "postop";

export const DIAGNOSIS_PHASE_BY_SECTION: Record<string, DiagnosisPhase> = {
  preop_diagnosis: "preop",
  postop_diagnosis: "postop",
};

export type AddDocumentDiagnosisResult =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: "duplicate" | "main_exists" | "error" };

export const DOCUMENT_DIAGNOSIS_ERRORS = {
  duplicate: "Этот диагноз уже добавлен",
  main_exists: "Основной диагноз уже указан",
  error: "Не удалось добавить диагноз",
} as const;

interface AddArgs {
  documentId: string;
  hospitalId: string;
  phase: DiagnosisPhase;
  icd10Code: string;
  diagnosisType: string;
  notes?: string | null;
  userId: string;
  downgradeMainIfTaken?: boolean;
}

export async function addDocumentDiagnosis({
  documentId, hospitalId, phase, icd10Code, diagnosisType, notes, userId, downgradeMainIfTaken,
}: AddArgs): Promise<AddDocumentDiagnosisResult> {
  const insert = async (type: string): Promise<AddDocumentDiagnosisResult> => {
    const { error } = await supabase.from("document_diagnoses" as any).insert({
      hospital_id: hospitalId,
      document_id: documentId,
      phase,
      icd10_code: icd10Code,
      diagnosis_type: type,
      notes: notes || null,
      recorded_by: userId,
    } as any);
    if (!error) return { ok: true };
    if (error.code === "23505") {
      const msg = error.message ?? "";
      if (msg.includes("document_diagnoses_one_main_uq")) return { ok: false, reason: "main_exists" };
      if (msg.includes("document_diagnoses_code_uq")) return { ok: false, reason: "duplicate" };
    }
    return { ok: false, reason: "error" };
  };

  const res = await insert(diagnosisType);
  if (!res.ok && res.reason === "main_exists" && downgradeMainIfTaken && diagnosisType === "main") {
    return insert("competing");
  }
  return res;
}
