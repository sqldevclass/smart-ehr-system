import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { fmtMoney, totalsFooter } from "./reportTotals";

const VIEW_KEY = "advance_columns";

interface AdvanceRow {
  patient_id: string;
  patient_number: string | null;
  last_name: string | null;
  first_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
  deposited_amount: number;
  applied_amount: number;
  refunded_amount: number;
  balance: number;
  last_deposit_at: string | null;
}

export default function AdvanceTab({ to }: { to: string }) {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["patient-advances", user?.hospitalId, to],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      if (!user?.hospitalId) return [];
      const { data, error } = await supabase.rpc("get_patient_advances" as any, {
        p_hospital_id: user.hospitalId,
        p_as_of: to,
      } as any);
      if (error) throw error;
      return ((data ?? []) as unknown as AdvanceRow[]).map((r) => ({
        ...r,
        deposited_amount: Number(r.deposited_amount ?? 0),
        applied_amount: Number(r.applied_amount ?? 0),
        refunded_amount: Number(r.refunded_amount ?? 0),
        balance: Number(r.balance ?? 0),
      }));
    },
  });

  const columns: ColumnDef<AdvanceRow, any>[] = [
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patient_number ?? "" },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => r.last_name ?? "" },
    { id: "first_name", header: "Имя", accessorFn: (r) => r.first_name ?? "" },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => r.date_of_birth ? format(new Date(r.date_of_birth), "dd.MM.yyyy") : "" },
    { id: "phone", header: "Телефон", accessorFn: (r) => r.phone ?? "" },
    { id: "deposited", header: "Внесено", accessorFn: (r) => fmtMoney(r.deposited_amount), meta: { align: "right" } },
    { id: "applied", header: "Использовано", accessorFn: (r) => fmtMoney(r.applied_amount), meta: { align: "right" } },
    { id: "refunded", header: "Возвращено", accessorFn: (r) => fmtMoney(r.refunded_amount), meta: { align: "right" } },
    {
      id: "balance", header: "Баланс депозита", accessorFn: (r) => fmtMoney(r.balance),
      cell: ({ row }) => <span className="font-semibold">{fmtMoney(row.original.balance)}</span>,
      meta: { align: "right" },
    },
    { id: "last_deposit", header: "Последний взнос", accessorFn: (r) => r.last_deposit_at ? format(new Date(r.last_deposit_at), "dd.MM.yyyy") : "" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">{`Баланс депозитов на конец периода: ${format(new Date(to), "dd.MM.yyyy")}`}</p>
      <SummaryCard>
        <MetricTile label="Пациентов с депозитом" value={rows.length} />
        <MetricTile label="Общий баланс депозитов" value={fmtMoney(rows.reduce((sum, r) => sum + r.balance, 0))} />
      </SummaryCard>
      <div className="h-[65vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="Нет пациентов с положительным балансом депозита на конец периода."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.patient_id}
          renderFooter={(table) => {
            const filteredRows = table.getRowModel().rows;
            return totalsFooter(table, `Итого (${filteredRows.length})`, {
              deposited: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.deposited_amount, 0)),
              applied: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.applied_amount, 0)),
              refunded: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.refunded_amount, 0)),
              balance: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.balance, 0)),
            });
          }}
        />
      </div>
    </div>
  );
}