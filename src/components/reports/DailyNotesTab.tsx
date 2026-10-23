import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { toLocal } from "@/lib/timezone";
import { formatDayRanges } from "@/lib/physicianDailyNotes";
import {
  useExcludedNoteAuthorPersonIds,
  useMissingDailyNotes,
  type MissingNotesRow,
} from "@/hooks/useDailyNoteCompliance";

const MISSING_VIEW_KEY = "daily_notes_missing_columns";

// Missing physician daily progress notes (дневниковые записи) for all inpatients.
export default function DailyNotesTab({ from, to }: { from: string; to: string }) {
  const tz = useHospitalTimezone();
  const { excludedPersonIds } = useExcludedNoteAuthorPersonIds();
  const missing = useMissingDailyNotes(from, to, excludedPersonIds);

  const missingTotal = missing.rows.reduce((sum, r) => sum + r.missingDays.length, 0);

  const columns: ColumnDef<MissingNotesRow, any>[] = [
    { id: "patient_number", header: "P-ID", accessorFn: (r) => r.patientNumber || "" },
    { id: "patient", header: "Пациент", accessorFn: (r) => r.patientName },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalizationNumber || "" },
    { id: "admitted", header: "Дата госпитализации", accessorFn: (r) => toLocal(r.admittedAt, tz, "dd.MM.yyyy") },
    { id: "physician", header: "Врач", accessorFn: (r) => r.physician },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "surgery", header: "Операция", accessorFn: (r) => (r.hadSurgery ? "Да" : "Нет") },
    { id: "discharged", header: "Выписан", accessorFn: (r) => (r.dischargedAt ? "Да" : "Нет") },
    { id: "stay_days", header: "Дней", accessorFn: (r) => r.stayDays, meta: { align: "right" } },
    { id: "notes", header: "Записей", accessorFn: (r) => r.notes, meta: { align: "right" } },
    { id: "missing", header: "Не хватает", accessorFn: (r) => r.missingDays.length, meta: { align: "right" } },
    { id: "missing_dates", header: "Пропущенные даты", accessorFn: (r) => formatDayRanges(r.missingDays) },
  ];

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Пропущенные дневниковые записи (стационар)</h3>
        <p className="text-xs text-muted-foreground">
          Операция = Да, если есть завершённый Протокол операции, иначе терапия. Учитываются только завершённые записи врачей (без анестезиологов-реаниматологов).
        </p>
        <SummaryCard>
          <MetricTile label="Пациентов в стационаре" value={missing.inpatientsInPeriod} />
          <MetricTile label="С пропусками" value={missing.rows.length} />
          <MetricTile label="Пропущено записей" value={missingTotal} />
        </SummaryCard>
        <div className="h-[45vh] min-h-0">
          <DataTable
            columns={columns}
            data={missing.rows}
            isLoading={missing.isLoading}
            emptyMessage="Пропущенных дневниковых записей нет."
            viewKey={MISSING_VIEW_KEY}
            getRowId={(r) => r.hospitalizationId}
          />
        </div>
      </section>
    </div>
  );
}
