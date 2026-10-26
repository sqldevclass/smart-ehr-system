import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TableCell, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/reports/data-table/DataTable";

interface DebtService {
  service_name: string;
  service_date: string | null;
  original_amount: number;
  discount_percent: number | null;
  amount: number;
}

interface DebtRow {
  debt_type: "IP" | "OP";
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: "active" | "confirmed" | null;
  patient_id: string;
  patient_number: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  hospitalization_id: string | null;
  hospitalization_number: string | null;
  admitted_at: string | null;
  discharged_at: string | null;
  visit_id: string | null;
  visit_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  services: DebtService[] | null;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : format(d, "dd.MM.yyyy");
};

const stayStatus = (r: DebtRow) =>
  r.debt_type !== "IP" ? "—" : r.discharged_at ? "Выписан" : "В стационаре";

const invoiceStatus = (s: DebtRow["invoice_status"]) =>
  s === "active" ? "Активный" : s === "confirmed" ? "Счёт-фактура создана" : "—";

export default function DebtTab() {
  const { user } = useAuth();

  const { data = [], isLoading } = useQuery({
    queryKey: ["patient-debts", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_patient_debts" as any, { p_hospital_id: user!.hospitalId });
      if (error) throw error;
      return (data || []) as unknown as DebtRow[];
    },
  });

  const columns = useMemo<ColumnDef<DebtRow, any>[]>(() => [
    { id: "debt_type", header: "IP/OP", accessorFn: (r) => r.debt_type },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patient_number ?? "—" },
    { id: "patient_name", header: "Пациент", accessorFn: (r) => r.patient_name ?? "—" },
    { id: "patient_phone", header: "Телефон", accessorFn: (r) => r.patient_phone ?? "—" },
    { id: "hospitalization_number", header: "Госпитализация", accessorFn: (r) => r.hospitalization_number ?? "—" },
    { id: "date", header: "Дата", accessorFn: (r) => fmtDate(r.debt_type === "IP" ? r.admitted_at : r.visit_date) },
    { id: "stay_status", header: "Статус госпитализации", accessorFn: stayStatus },
    { id: "invoice_number", header: "Счёт-фактура", accessorFn: (r) => r.invoice_number ?? "—" },
    { id: "invoice_status", header: "Статус счёта", accessorFn: (r) => invoiceStatus(r.invoice_status) },
    { id: "total_amount", header: "Сумма", accessorFn: (r) => fmt(r.total_amount), meta: { align: "right" } },
    { id: "paid_amount", header: "Оплачено", accessorFn: (r) => fmt(r.paid_amount), meta: { align: "right" } },
    {
      id: "outstanding_amount", header: "Долг", accessorFn: (r) => fmt(r.outstanding_amount), meta: { align: "right" },
      cell: ({ row }) => <span className="font-semibold">{fmt(row.original.outstanding_amount)}</span>,
    },
  ], []);

  return (
    <div className="h-[70vh]">
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        emptyMessage="Задолженностей нет"
        getRowId={(r, i) => `${r.debt_type}_${r.invoice_id ?? r.visit_id ?? r.hospitalization_id ?? i}`}
        getRowCanExpand={(r) => (r.services?.length ?? 0) > 0}
        renderSubRow={(r) => (
          <div className="px-10 py-2">
            <table className="text-xs w-full max-w-3xl">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left font-medium py-1">Услуга</th>
                  <th className="text-left font-medium py-1">Дата</th>
                  <th className="text-right font-medium py-1">Цена</th>
                  <th className="text-right font-medium py-1">Скидка</th>
                  <th className="text-right font-medium py-1">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {(r.services ?? []).map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1">{s.service_name}</td>
                    <td className="py-1">{fmtDate(s.service_date)}</td>
                    <td className="py-1 text-right">{fmt(s.original_amount)}</td>
                    <td className="py-1 text-right">{s.discount_percent ? `${s.discount_percent}%` : "—"}</td>
                    <td className="py-1 text-right">{fmt(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        renderFooter={(table) => {
          const rows = table.getFilteredRowModel().rows;
          const total = rows.reduce((s, r) => s + Number(r.original.outstanding_amount ?? 0), 0);
          const visible = table.getVisibleLeafColumns();
          const idx = visible.findIndex((c) => c.id === "outstanding_amount");
          const before = idx >= 0 ? idx + 1 : visible.length + 1;
          return (
            <TableRow>
              <TableCell colSpan={before} className="font-semibold whitespace-nowrap">Итого долг ({rows.length})</TableCell>
              {idx >= 0 && <TableCell className="text-right font-semibold whitespace-nowrap">{fmt(total)}</TableCell>}
              {idx >= 0 && idx < visible.length - 1 && <TableCell colSpan={visible.length - 1 - idx} />}
            </TableRow>
          );
        }}
      />
    </div>
  );
}
