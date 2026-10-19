import { useMemo } from "react";
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

interface RawItem {
  id: string;
  icd10_code: string;
  recorded_at: string | null;
  hospitalization_id: string | null;
  icd10_codes: { name_ru: string } | null;
  hospitalizations: { hospitalization_number: string | null } | null;
  patients: { patient_number: string; first_name: string; last_name: string; date_of_birth: string | null } | null;
  profiles: { full_name: string } | null;
}

export default function TopDiagnosesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["diagnoses-report", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, recorded_at, hospitalization_id,
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
    { id: "recorded_by", header: "Doctor", accessorFn: (r) => r.recorded_by_name || "" },
  ], []);

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No diagnoses recorded in this period."
        viewKey={VIEW_KEY}
        getRowId={(r) => r.id}
      />
    </div>
  );
}
