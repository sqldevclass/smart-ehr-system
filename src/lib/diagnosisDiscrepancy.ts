export const SURGEON_FIELD_ID = "b1000000-0000-0000-0000-000000000140";
export const OPERATION_NAME_FIELD_ID = "b1000000-0000-0000-0000-000000000126";

export interface DiagnosisRef { code: string; name: string }

export interface ProtocolDiagnosisInput {
  documentId: string;
  hospitalizationId: string | null;
  hospitalizationNumber: string | null;
  patientName: string;
  patientNumber: string | null;
  completedAt: string;
  surgeonText: string | null;
  completedByName: string | null;
  operationName: string | null;
  preop: DiagnosisRef | null;
  postop: DiagnosisRef | null;
}

export interface DiagnosisDiscrepancyRow {
  documentId: string;
  hospitalizationId: string | null;
  hospitalizationNumber: string | null;
  patientName: string;
  patientNumber: string | null;
  completedAt: string;
  operationName: string | null;
  surgeon: string | null;
  preop: DiagnosisRef;
  postop: DiagnosisRef;
  status: "match" | "mismatch";
}

const norm = (c: string) => c.trim().toLowerCase();

export function buildDiagnosisDiscrepancies(inputs: ProtocolDiagnosisInput[]) {
  const rows: DiagnosisDiscrepancyRow[] = [];
  let withoutDiagnoses = 0;
  for (const p of inputs) {
    if (!p.preop || !p.postop) { withoutDiagnoses++; continue; }
    rows.push({
      documentId: p.documentId,
      hospitalizationId: p.hospitalizationId,
      hospitalizationNumber: p.hospitalizationNumber,
      patientName: p.patientName,
      patientNumber: p.patientNumber,
      completedAt: p.completedAt,
      operationName: p.operationName,
      surgeon: p.surgeonText || p.completedByName || null,
      preop: p.preop,
      postop: p.postop,
      status: norm(p.preop.code) === norm(p.postop.code) ? "match" : "mismatch",
    });
  }
  rows.sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  return { rows, withoutDiagnoses };
}
