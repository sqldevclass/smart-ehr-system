import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { fmtMoney, totalsFooter } from "./reportTotals";

const VIEW_KEY = "discount_report_columns";
const STATUS_LABELS = {
  active: "Активный",
  confirmed: "Счёт-фактура создана",
  paid: "Оплачен",
};

interface DiscountRow {
  item_id: string;
  applied_at: string;
  applied_by_name: string | null;
  hospitalization_number: string | null;
  patient_id: string;
  patient_number: string | null;
  last_name: string | null;
  first_name: string | null;
  date_of_birth: string | null;
  service_name: string | null;
  discount_name: string | null;
  discount_percent: number;
  original_amount: number;
  discount_amount: number;
  amount: number;
  invoice_number: string | null;
  invoice_status: "active" | "confirmed" | "paid";
}

export default function DiscountReportTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["discount-report", user?.hospitalId, from, to],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      if (!user?.hospitalId) return [];
      const { data, error } = await supabase.rpc("get_discount_report" as any, {
        p_hospital_id: user.hospitalId,
        p_from: from,
        p_to: to,
      } as any);
      if (error) throw error;
      return ((data ?? []) as unknown as DiscountRow[]).map((r) => ({
        ...r,
        discount_percent: Number(r.discount_percent ?? 0),
        original_amount: Number(r.original_amount ?? 0),
        discount_amount: Number(r.discount_amount ?? 0),
        amount: Number(r.amount ?? 0),
      }));
    },
  });

  const originalTotal = rows.reduce((sum, r) => sum + r.original_amount, 0);
  const discountTotal = rows.reduce((sum, r) => sum + r.discount_amount, 0);
  const averageDiscount = originalTotal === 0 ? 0 : discountTotal / originalTotal * 100;

  const columns: ColumnDef<DiscountRow, any>[] = [
    { id: "date", header: "Дата применения", accessorFn: (r) => format(new Date(r.applied_at), "dd.MM.yyyy HH:mm") },
    { id: "applied_by", header: "Кем применена", accessorFn: (r) => r.applied_by_name ?? "" },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalization_number ?? "" },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patient_number ?? "" },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => r.last_name ?? "" },
    { id: "first_name", header: "Имя", accessorFn: (r) => r.first_name ?? "" },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => r.date_of_birth ? format(new Date(r.date_of_birth), "dd.MM.yyyy") : "" },
    { id: "service", header: "Услуга", accessorFn: (r) => r.service_name ?? "" },
    { id: "discount", header: "Скидка", accessorFn: (r) => r.discount_name ?? "" },
    { id: "percent", header: "%", accessorFn: (r) => `${Number(r.discount_percent)}%`, meta: { align: "right" } },
    { id: "original", header: "Цена до скидки", accessorFn: (r) => fmtMoney(r.original_amount), meta: { align: "right" } },
    { id: "discount_amount", header: "Сумма скидки", accessorFn: (r) => fmtMoney(r.discount_amount), meta: { align: "right" } },
    { id: "amount", header: "Сумма после", accessorFn: (r) => fmtMoney(r.amount), meta: { align: "right" } },
    { id: "invoice_number", header: "№ счёта", accessorFn: (r) => r.invoice_number ?? "" },
    { id: "invoice_status", header: "Статус счёта", accessorFn: (r) => STATUS_LABELS[r.invoice_status] ?? "" },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Позиций со скидкой" value={rows.length} />
        <MetricTile label="Сумма до скидок" value={fmtMoney(originalTotal)} />
        <MetricTile label="Сумма скидок" value={fmtMoney(discountTotal)} />
        <MetricTile label="Средняя скидка" value={`${averageDiscount.toFixed(1)}%`} />
      </SummaryCard>
      <div className="h-[65vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="За этот период скидок не применялось."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.item_id}
          renderFooter={(table) => {
            const filteredRows = table.getRowModel().rows;
            return totalsFooter(table, `Итого (${filteredRows.length})`, {
              original: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.original_amount, 0)),
              discount_amount: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.discount_amount, 0)),
              amount: fmtMoney(filteredRows.reduce((sum, r) => sum + r.original.amount, 0)),
            });
          }}
        />
      </div>
    </div>
  );
}