import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { useIcuTransfers } from "@/hooks/useIcuTransfers";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import type { IcuTransferRow } from "@/lib/icuTransfers";
import { toLocal } from "@/lib/timezone";

export function returnGroupLabel(row: IcuTransferRow): string {
  if (!row.isReturn || row.returnHours === null) return "Нет возврата";
  if (row.returnHours <= 24) return "Возврат: до 24 ч";
  if (row.returnHours <= 48) return "Возврат: 24–48 ч";
  return "Возврат: более 48 ч";
}

export default function IcuTransfersTab({ from, to }: { from: string; to: string }) {
  const { rows, excludedPlanned, isLoading, icuMissing, error } = useIcuTransfers(from, to);
  const tz = useHospitalTimezone();
  const columns = useMemo<ColumnDef<IcuTransferRow, any>[]>(() => [
    { id: "patient", header: "Пациент", accessorFn: (r) => r.patientName },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber ?? "" },
    { id: "hospitalization_number", header: "№ истории", accessorFn: (r) => r.hospitalizationNumber ?? "" },
    { id: "from_department", header: "Откуда", accessorFn: (r) => r.fromDepartment },
    { id: "entered_at", header: "Дата перевода", accessorFn: (r) => toLocal(r.enteredAt, tz, "dd.MM.yyyy HH:mm") },
    { id: "epicrisis", header: "Переводной эпикриз", accessorFn: (r) => r.epicrisis === "yes"
      ? `Да${r.epicrisisAt ? ` (${toLocal(r.epicrisisAt, tz, "dd.MM.yyyy HH:mm")})` : ""}`
      : r.epicrisis === "draft" ? "Черновик" : "Нет" },
    { id: "return", header: "Возврат", accessorFn: (r) => returnGroupLabel(r),
      cell: ({ row }) => !row.original.isReturn ? "—"
        : `№${row.original.entryNumber}, через ${row.original.returnHours === null ? "—" : row.original.returnHours < 1 ? "<1" : Math.round(row.original.returnHours)} ч` },
  ], [tz]);

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold">Перевод в реанимацию</h3>
      <p className="text-sm text-muted-foreground">Пациенты, переведённые в ICU из другого отделения. Плановый перевод после операции (в протоколе операции «Перевод = ICU» в тот же день) не учитывается.</p>
      {icuMissing && <p className="text-sm text-muted-foreground">Отделение ICU не найдено.</p>}
      {error && <p role="alert" className="text-sm text-destructive">Не удалось загрузить переводы в реанимацию.</p>}
      <SummaryCard>
        <MetricTile label="Переводов в ICU" value={rows.length} />
        <MetricTile label="Без переводного эпикриза" value={rows.filter((r) => r.epicrisis !== "yes").length} />
        <MetricTile label="Возвратов в ICU" value={rows.filter((r) => r.isReturn).length} />
        <MetricTile label="Исключено плановых п/о" value={excludedPlanned} />
      </SummaryCard>
      <div className="h-[45vh] min-h-0">
        <DataTable columns={columns} data={rows} isLoading={isLoading}
          viewKey="icu_transfers_columns" getRowId={(r) => `${r.hospitalizationId}_${r.enteredAt}`}
          emptyMessage="Переводов в реанимацию за этот период нет." />
      </div>
    </div>
  );
}
