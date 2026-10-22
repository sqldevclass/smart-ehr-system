import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { formatStaffShortName, type StaffNameSource } from "@/lib/staffName";
import { toLocal } from "@/lib/timezone";
import { PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID, formatDayRanges } from "@/lib/physicianDailyNotes";
import {
  useExcludedNoteAuthorPersonIds,
  useMissingDailyNotes,
  type MissingNotesRow,
} from "@/hooks/useDailyNoteCompliance";

const VIEW_KEY = "daily_notes_columns";
const MISSING_VIEW_KEY = "daily_notes_missing_columns";

interface NoteDoc {
  id: string;
  created_by: string;
  hospitalization_id: string | null;
  patient_id: string;
  hospitalizations: { departments: { name: string } | null } | null;
  author: (StaffNameSource & { person_id: string | null }) | null;
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

// Daily progress notes (дневниковые записи). Notes by Анестезиолог-Реаниматолог
// are excluded everywhere on this tab.
export default function DailyNotesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const tz = useHospitalTimezone();
  const { excludedPersonIds } = useExcludedNoteAuthorPersonIds();
  const missing = useMissingDailyNotes(from, to, excludedPersonIds);

  const { data: allDocs = [], isLoading } = useQuery({
    queryKey: ["daily-notes-report", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select(`
          id, created_by, hospitalization_id, patient_id,
          hospitalizations(departments(name)),
          author:profiles!patient_documents_created_by_fkey(
            full_name, person_id,
            person:persons!profiles_person_id_fkey(first_name, last_name)
          )
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as unknown as NoteDoc[];
    },
    enabled: !!user,
  });

  const docs = useMemo(
    () => allDocs.filter((d) => !(d.author?.person_id && excludedPersonIds.has(d.author.person_id))),
    [allDocs, excludedPersonIds]
  );

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

  const missingTotal = missing.rows.reduce((sum, r) => sum + r.missingDays.length, 0);

  const missingColumns: ColumnDef<MissingNotesRow, any>[] = [
    { id: "patient", header: "Пациент", accessorFn: (r) => r.patientName },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber || "" },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalizationNumber || "" },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "admitted", header: "Поступил", accessorFn: (r) => toLocal(r.admittedAt, tz, "dd.MM.yyyy") },
    { id: "discharged", header: "Выписан", accessorFn: (r) => (r.dischargedAt ? toLocal(r.dischargedAt, tz, "dd.MM.yyyy") : "В стационаре") },
    { id: "required", header: "Требуется", accessorFn: (r) => r.required, meta: { align: "right" } },
    { id: "written", header: "Написано", accessorFn: (r) => r.written, meta: { align: "right" } },
    { id: "missing", header: "Не хватает", accessorFn: (r) => r.missingDays.length, meta: { align: "right" } },
    { id: "missing_dates", header: "Пропущенные даты", accessorFn: (r) => formatDayRanges(r.missingDays) },
  ];

  const columns: ColumnDef<Row, any>[] = [
    { id: "physician", header: "Врач", accessorFn: (r) => r.physician },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "notes", header: "Записей", accessorFn: (r) => r.notes, meta: { align: "right" } },
    { id: "patients", header: "Пациентов", accessorFn: (r) => r.patients, meta: { align: "right" } },
    { id: "inpatient", header: "Стационар", accessorFn: (r) => r.inpatient, meta: { align: "right" } },
    { id: "outpatient", header: "Амбулаторно", accessorFn: (r) => r.outpatient, meta: { align: "right" } },
  ];

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Пропущенные дневниковые записи (хирургические пациенты)</h3>
        <SummaryCard>
          <MetricTile label="Хирургических пациентов" value={missing.surgicalStaysInPeriod} />
          <MetricTile label="С пропусками" value={missing.rows.length} />
          <MetricTile label="Пропущено записей" value={missingTotal} />
        </SummaryCard>
        <div className="h-[45vh] min-h-0">
          <DataTable
            columns={missingColumns}
            data={missing.rows}
            isLoading={missing.isLoading}
            emptyMessage="Пропущенных дневниковых записей нет."
            viewKey={MISSING_VIEW_KEY}
            getRowId={(r) => r.hospitalizationId}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Дневниковые записи по врачам</h3>
        <SummaryCard>
          <MetricTile label="Всего записей" value={stats.total} />
          <MetricTile label="Стационар" value={stats.inpatient} />
          <MetricTile label="Амбулаторно" value={stats.outpatient} />
          <MetricTile label="Врачей" value={stats.physicians} />
        </SummaryCard>
        <div className="h-[45vh] min-h-0">
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            emptyMessage="За этот период дневниковых записей нет."
            viewKey={VIEW_KEY}
            getRowId={(r) => r.key}
          />
        </div>
      </section>
    </div>
  );
}
