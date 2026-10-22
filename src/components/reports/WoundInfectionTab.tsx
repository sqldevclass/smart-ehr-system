import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import { toLocal } from "@/lib/timezone";
import { useWoundInfection, type WoundInfectionRow } from "@/hooks/useWoundInfection";

const VIEW_KEY = "wound_infection_columns";

export default function WoundInfectionTab({ from, to }: { from: string; to: string }) {
  const tz = useHospitalTimezone();
  const { rows, monitored, flagged, isLoading } = useWoundInfection(from, to);
  const rate = monitored === 0 ? "—" : `${((flagged / monitored) * 100).toFixed(1)}%`;
  const day = (v: string | null) => (v ? toLocal(v, tz, "dd.MM.yyyy") : "");

  const columns: ColumnDef<WoundInfectionRow, any>[] = [
    { id: "patient", header: "Пациент", accessorFn: (r) => r.patientName },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber || "" },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalizationNumber || "" },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "first_sign", header: "Первый признак", accessorFn: (r) => day(r.firstSignAt) },
    { id: "last_sign", header: "Последний признак", accessorFn: (r) => day(r.lastSignAt) },
    { id: "signs", header: "Признаки", accessorFn: (r) => r.signLabels.join(", ") },
    { id: "flagged_entries", header: "Записей с признаками", accessorFn: (r) => `${r.flaggedEntries} / ${r.entries}` },
    { id: "last_entry", header: "Последняя запись", accessorFn: (r) => (r.lastEntryPositive ? "С признаками" : "Без признаков") },
    { id: "culture", header: "Посев", accessorFn: (r) => (r.cultureTaken ? "Да" + (r.cultureNote ? ` (${r.cultureNote})` : "") : "Нет") },
    {
      id: "prophylaxis",
      header: "Антибиотикопрофилактика",
      accessorFn: (r) => (r.antibioticProphylaxis === null ? "—" : r.antibioticProphylaxis ? "Да" : "Нет"),
    },
  ];

  return (
    <div className="mt-4 space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Признаки инфекции послеоперационной раны</h3>
          <p className="text-xs text-muted-foreground">
            Пациенты с хотя бы одним положительным признаком (кроме лихорадки) в мониторинге раны. Это признаки по чек-листу медсестры, а не подтверждённый диагноз.
          </p>
        </div>
        <SummaryCard>
          <MetricTile label="Пациентов под наблюдением" value={monitored} />
          <MetricTile label="С признаками" value={flagged} />
          <MetricTile label="Частота" value={rate} />
        </SummaryCard>
        <div className="h-[45vh] min-h-0">
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            emptyMessage="Признаков инфекции раны за этот период нет."
            viewKey={VIEW_KEY}
            getRowId={(r) => r.hospitalizationId}
          />
        </div>
      </section>
    </div>
  );
}
