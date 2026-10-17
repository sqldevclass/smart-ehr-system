import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import DailyReportSummaryChart from "@/components/reports/DailyReportSummaryChart";

interface PaymentItem {
  payment_method_code: string;
  payment_method_name: string;
  amount: number;
  is_refunded: boolean;
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

  const rows = useMemo(() => {
    const byCode = new Map<string, { name: string; amount: number; count: number; priorAmount: number }>();
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

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const priorTotal = rows.reduce((sum, r) => sum + r.priorAmount, 0);

  return (
    <div className="mt-4 space-y-6">
      {rows.length > 0 && (
        <DailyReportSummaryChart
          data={rows.map((r) => ({ name: r.name, revenue: r.amount }))}
          title="Cash Inflow by Payment Method"
        />
      )}

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No payments in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Same Period Last Year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(r.priorAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">
                  {rows.reduce((s, r) => s + r.count, 0)}
                </TableCell>
                <TableCell className="text-right font-semibold">{fmt(total)}</TableCell>
                <TableCell className="text-right font-semibold text-muted-foreground">{fmt(priorTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
