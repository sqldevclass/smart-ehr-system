import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { useDiagnosisDiscrepancies } from "@/hooks/useDiagnosisDiscrepancies";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import type { DiagnosisDiscrepancyRow } from "@/lib/diagnosisDiscrepancy";
import { toLocal } from "@/lib/timezone";

export default function DiagnosisDiscrepancyTab({ from, to }: { from: string; to: string }) {
  const { rows, withoutDiagnoses, isLoading, error } = useDiagnosisDiscrepancies(from, to);
  const tz = useHospitalTimezone();
  const columns = useMemo<ColumnDef<DiagnosisDiscrepancyRow, any>[]>(() => [
    { id: "patient", header: "Пациент", accessorFn: (r) => r.patientName },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber ?? "" },
    { id: "hospitalization_number", header: "№ истории", accessorFn: (r) => r.hospitalizationNumber ?? "" },
    { id: "completed_at", header: "Дата протокола", accessorFn: (r) => toLocal(r.completedAt, tz, "dd.MM.yyyy HH:mm") },
    { id: "operation", header: "Операция", accessorFn: (r) => r.operationName ?? "" },
    { id: "surgeon", header: "Хирург", accessorFn: (r) => r.surgeon ?? "—" },
    { id: "preop", header: "До операции", accessorFn: (r) => `${r.preop.code} — ${r.preop.name}` },
    { id: "postop", header: "После операции", accessorFn: (r) => `${r.postop.code} — ${r.postop.name}` },
    { id: "status", header: "Расхождение", accessorFn: (r) => (r.status === "mismatch" ? "Расхождение" : "Совпадает"),
      cell: ({ row }) => row.original.status === "mismatch"
        ? <span className="text-destructive">Расхождение</span> : "Совпадает" },
  ], [tz]);

  const mismatches = rows.filter((r) => r.status === "mismatch").length;

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold">Расхождение до/после операционного диагноза</h3>
      <p className="text-sm text-muted-foreground">Завершённые протоколы операций, где указаны основной предоперационный и основной послеоперационный диагноз. Расхождение — любое различие кода МКБ-10. Протоколы без диагнозов (оформленные до введения вкладок) в таблицу не входят.</p>
      {error && <p role="alert" className="text-sm text-destructive">Не удалось загрузить данные о расхождении диагнозов.</p>}
      <SummaryCard>
        <MetricTile label="Протоколов с обоими диагнозами" value={rows.length} />
        <MetricTile label="Расхождений" value={mismatches} />
        <MetricTile label="% расхождений" value={rows.length ? `${((mismatches / rows.length) * 100).toFixed(1)}%` : "—"} />
        <MetricTile label="Без диагнозов" value={withoutDiagnoses} />
      </SummaryCard>
      <div className="h-[45vh] min-h-0">
        <DataTable columns={columns} data={rows} isLoading={isLoading}
          viewKey="diagnosis_discrepancy_columns" getRowId={(r) => r.documentId}
          emptyMessage="Протоколов с обоими диагнозами за этот период нет." />
      </div>
    </div>
  );
}
