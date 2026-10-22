
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { formatStaffShortName, type StaffNameSource } from "@/lib/staffName";

const VIEW_KEY = "daily_notes_columns";
const DAILY_NOTE_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000002";

interface NoteDoc {
  id: string;
  created_by: string;
  hospitalization_id: string | null;
  patient_id: string;
  hospitalizations: { departments: { name: string } | null } | null;
  author: StaffNameSource | null;
}

interface Row {
  key: string;
  physician: string;
  department: string;
  notes: number;
  patients: number;
  inpatient: number;
  outpatient: number;
}

// Count of completed daily progress notes (дневниковые записи) in the period.
export default function DailyNotesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["daily-notes-report", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select(`
          id, created_by, hospitalization_id, patient_id,
          hospitalizations(departments(name)),
          author:profiles!patient_documents_created_by_fkey(
            full_name,
            person:persons!profiles_person_id_fkey(first_name, last_name)
          )
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", DAILY_NOTE_DOC_TYPE_ID)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as unknown as NoteDoc[];
    },
    enabled: !!user,
  });

  const { rows, stats } = useMemo(() => {
    const byKey = new Map<string, Row & { patientIds: Set<string> }>();
    docs.forEach((d) => {
      const department = d.hospitalizations?.departments?.name ?? (d.hospitalization_id ? "—" : "Амбулаторно");
      const key = `${d.created_by}__${department}`;
      const row =
        byKey.get(key) ||
        {
          key,
          physician: formatStaffShortName(d.author) || "Не указан",
          department,
          notes: 0,
          patients: 0,
          inpatient: 0,
          outpatient: 0,
          patientIds: new Set<string>(),
        };
      row.notes += 1;
      if (d.hospitalization_id) row.inpatient += 1;
      else row.outpatient += 1;
      row.patientIds.add(d.patient_id);
      row.patients = row.patientIds.size;
      byKey.set(key, row);
    });
    const rows = Array.from(byKey.values())
      .map(({ patientIds, ...r }) => r)
      .sort((a, b) => b.notes - a.notes);
    const stats = {
      total: docs.length,
      inpatient: docs.filter((d) => d.hospitalization_id).length,
      outpatient: docs.filter((d) => !d.hospitalization_id).length,
      physicians: new Set(docs.map((d) => d.created_by)).size,
    };
    return { rows, stats };
  }, [docs]);

  const columns: ColumnDef<Row, any>[] = [
    { id: "physician", header: "Врач", accessorFn: (r) => r.physician },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "notes", header: "Записей", accessorFn: (r) => r.notes, meta: { align: "right" } },
    { id: "patients", header: "Пациентов", accessorFn: (r) => r.patients, meta: { align: "right" } },
    { id: "inpatient", header: "Стационар", accessorFn: (r) => r.inpatient, meta: { align: "right" } },
    { id: "outpatient", header: "Амбулаторно", accessorFn: (r) => r.outpatient, meta: { align: "right" } },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Всего записей" value={stats.total} />
        <MetricTile label="Стационар" value={stats.inpatient} />
        <MetricTile label="Амбулаторно" value={stats.outpatient} />
        <MetricTile label="Врачей" value={stats.physicians} />
      </SummaryCard>
      <div className="h-[60vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="За этот период дневниковых записей нет."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.key}
        />
      </div>
    </div>
  );
}

