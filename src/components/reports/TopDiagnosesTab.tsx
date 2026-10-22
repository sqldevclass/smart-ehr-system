import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "diagnoses_report_columns";

interface DiagnosisRow {
  id: string;
  icd10_code: string;
  icd10_name: string | null;
  recorded_at: string | null;
  op_ip: "inpatient" | "outpatient";
  hospitalization_number: string | null;
  patient_number: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_dob: string | null;
  recorded_by_name: string | null;
}

interface TopRow {
  icd10_code: string;
  icd10_name: string | null;
  records: number;
  patients: number;
  inpatient: number;
  outpatient: number;
}
const TOP_VIEW_KEY = "top_diagnoses_columns";

interface RawItem {
  id: string;
  icd10_code: string;
  recorded_at: string | null;
  hospitalization_id: string | null;
  patient_id: string;
  icd10_codes: { name_ru: string } | null;
  hospitalizations: { hospitalization_number: string | null } | null;
  patients: { patient_number: string; first_name: string; last_name: string; date_of_birth: string | null } | null;
  profiles: { full_name: string } | null;
}

export default function TopDiagnosesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"top" | "all">("top");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["diagnoses-report", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, recorded_at, hospitalization_id, patient_id,
          icd10_codes(name_ru),
          hospitalizations(hospitalization_number),
          patients(patient_number, first_name, last_name, date_of_birth),
          profiles!recorded_by(full_name)
        `)
        .eq("hospital_id", user.hospitalId)
        .gte("recorded_at", from)
        .lte("recorded_at", to);
      if (error) throw error;
      return (data || []) as unknown as RawItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo<DiagnosisRow[]>(
    () =>
      items.map((i) => ({
        id: i.id,
        icd10_code: i.icd10_code,
        icd10_name: i.icd10_codes?.name_ru ?? null,
        recorded_at: i.recorded_at,
        op_ip: i.hospitalization_id ? "inpatient" : "outpatient",
        hospitalization_number: i.hospitalizations?.hospitalization_number ?? null,
        patient_number: i.patients?.patient_number ?? null,
        patient_first_name: i.patients?.first_name ?? null,
        patient_last_name: i.patients?.last_name ?? null,
        patient_dob: i.patients?.date_of_birth ?? null,
        recorded_by_name: i.profiles?.full_name ?? null,
      })),
    [items]
  );

  // Top diagnoses: grouped by ICD-10 code, most frequent first.
  const topRows = useMemo<TopRow[]>(() => {
    const byCode = new Map<string, TopRow & { patientIds: Set<string> }>();
    items.forEach((i) => {
      const row =
        byCode.get(i.icd10_code) ||
        {
          icd10_code: i.icd10_code,
          icd10_name: i.icd10_codes?.name_ru ?? null,
          records: 0,
          patients: 0,
          inpatient: 0,
          outpatient: 0,
          patientIds: new Set<string>(),
        };
      row.records += 1;
      if (i.hospitalization_id) row.inpatient += 1;
      else row.outpatient += 1;
      row.patientIds.add(i.patient_id);
      row.patients = row.patientIds.size;
      byCode.set(i.icd10_code, row);
    });
    return Array.from(byCode.values())
      .map(({ patientIds, ...r }) => r)
      .sort((a, b) => b.records - a.records || a.icd10_code.localeCompare(b.icd10_code));
  }, [items]);

  const topColumns = useMemo<ColumnDef<TopRow, any>[]>(() => [
    { id: "icd10", header: "ICD-10", accessorFn: (r) => r.icd10_code },
    { id: "diagnosis", header: "Диагноз", accessorFn: (r) => r.icd10_name || "" },
    { id: "records", header: "Случаев", accessorFn: (r) => r.records, meta: { align: "right" } },
    { id: "patients", header: "Пациентов", accessorFn: (r) => r.patients, meta: { align: "right" } },
    { id: "inpatient", header: "Стационар", accessorFn: (r) => r.inpatient, meta: { align: "right" } },
    { id: "outpatient", header: "Амбулаторно", accessorFn: (r) => r.outpatient, meta: { align: "right" } },
  ], []);

  const modeToggle = (
    <div className="flex gap-1">
      <Button size="sm" variant={mode === "top" ? "default" : "outline"} onClick={() => setMode("top")}>
        Топ диагнозов
      </Button>
      <Button size="sm" variant={mode === "all" ? "default" : "outline"} onClick={() => setMode("all")}>
        Все записи
      </Button>
    </div>
  );

  const columns = useMemo<ColumnDef<DiagnosisRow, any>[]>(() => [
    { id: "recorded_at", header: "Дата поставления", accessorFn: (r) => (r.recorded_at ? format(new Date(r.recorded_at), "dd.MM.yyyy HH:mm") : "") },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalization_number || "" },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patient_number || "" },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => r.patient_last_name || "" },
    { id: "first_name", header: "Имя", accessorFn: (r) => r.patient_first_name || "" },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => (r.patient_dob ? format(new Date(r.patient_dob), "dd.MM.yyyy") : "") },
    { id: "icd10", header: "ICD-10", accessorFn: (r) => r.icd10_code },
    { id: "diagnosis", header: "Диагноз", accessorFn: (r) => r.icd10_name || "" },
    { id: "op_ip", header: "IP/OP", accessorFn: (r) => (r.op_ip === "inpatient" ? "Стационар" : "Амбулаторно") },
    { id: "recorded_by", header: "Врач", accessorFn: (r) => r.recorded_by_name || "" },
  ], []);

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      {mode === "top" ? (
        <DataTable
          key="top"
          columns={topColumns}
          data={topRows}
          isLoading={isLoading}
          emptyMessage="За этот период диагнозы не зарегистрированы."
          viewKey={TOP_VIEW_KEY}
          getRowId={(r) => r.icd10_code}
          leftSlot={modeToggle}
        />
      ) : (
        <DataTable
          key="all"
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="За этот период диагнозы не зарегистрированы."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.id}
          leftSlot={modeToggle}
        />
      )}
    </div>
  );
}
