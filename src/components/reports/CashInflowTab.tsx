import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ColumnDef } from "@tanstack/react-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import DailyReportSummaryChart from "@/components/reports/DailyReportSummaryChart";

const VIEW_KEY = "cash_inflow_columns";

interface PaymentItem {
  payment_method_code: string;
  payment_method_name: string;
  amount: number;
  is_refunded: boolean;
}

interface Row {
  name: string;
  amount: number;
  count: number;
  priorAmount: number;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function shiftYearsISO(iso: string, years: number) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
}

export default function CashInflowTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["cash-inflow-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("cash_inflow_report_items")
        .select("payment_method_code, payment_method_name, amount, is_refunded")
        .eq("hospital_id", user.hospitalId)
        .gte("paid_at", from)
        .lte("paid_at", to)
        .eq("is_refunded", false);
      if (error) throw error;
      return (data || []) as unknown as PaymentItem[];
    },
    enabled: !!user,
  });

  const { data: priorYearItems = [] } = useQuery({
    queryKey: ["cash-inflow-items-prior-year", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("cash_inflow_report_items")
        .select("payment_method_code, amount")
        .eq("hospital_id", user.hospitalId)
        .gte("paid_at", shiftYearsISO(from, -1))
        .lte("paid_at", shiftYearsISO(to, -1))
        .eq("is_refunded", false);
      if (error) throw error;
      return (data || []) as unknown as { payment_method_code: string; amount: number }[];
    },
    enabled: !!user,
  });

  const rows = useMemo<Row[]>(() => {
    const byCode = new Map<string, Row>();
    items.forEach((i) => {
      const row = byCode.get(i.payment_method_code) || {
        name: i.payment_method_name, amount: 0, count: 0, priorAmount: 0,
      };
      row.amount += Number(i.amount || 0);
      row.count += 1;
      byCode.set(i.payment_method_code, row);
    });
    priorYearItems.forEach((i) => {
      const row = byCode.get(i.payment_method_code);
      if (row) row.priorAmount += Number(i.amount || 0);
    });
    return Array.from(byCode.values()).sort((a, b) => b.amount - a.amount);
  }, [items, priorYearItems]);

  const columns: ColumnDef<Row, any>[] = [
    { id: "name", header: "Payment Method", accessorFn: (r) => r.name },
    { id: "count", header: "Count", accessorFn: (r) => r.count, meta: { align: "right" } },
    { id: "amount", header: "Amount", accessorFn: (r) => fmt(r.amount), meta: { align: "right" } },
    { id: "prior", header: "Same Period Last Year", accessorFn: (r) => fmt(r.priorAmount), meta: { align: "right" } },
  ];

  return (
    <div className="mt-4 space-y-6">
      {rows.length > 0 && (
        <DailyReportSummaryChart
          data={rows.map((r) => ({ name: r.name, revenue: r.amount }))}
          title="Cash Inflow by Payment Method"
        />
      )}

      <div className="h-[55vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="No payments in this period."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.name}
          renderFooter={(table) => {
            const filteredRows = table.getRowModel().rows;
            const totals: Record<string, string | number> = {
              count: filteredRows.reduce((s, r) => s + r.original.count, 0),
              amount: fmt(filteredRows.reduce((s, r) => s + r.original.amount, 0)),
              prior: fmt(filteredRows.reduce((s, r) => s + r.original.priorAmount, 0)),
            };
            return (
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                {table.getVisibleLeafColumns().map((column) => (
                  <TableCell key={column.id} className="text-right font-semibold">
                    {totals[column.id] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            );
          }}
        />
      </div>
    </div>
  );
}
