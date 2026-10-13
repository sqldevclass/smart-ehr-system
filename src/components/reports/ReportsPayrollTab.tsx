import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock } from "lucide-react";
import { toast } from "sonner";

interface PayrollRow {
  staff_role_id: string;
  full_name: string;
  base_pay_amount: number;
  own_service_amount: number;
  referral_amount: number;
  department_bucket_amount: number;
  total_amount: number;
  is_confirmed: boolean;
}

interface PayItem {
  staff_role_id: string;
  category: "own_service" | "referral";
  completed_at: string;
  service_name: string;
  cost_at_time: number;
  rate_percent: number | null;
  amount: number;
  patient_first_name: string | null;
  patient_last_name: string | null;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReportsPayrollTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [year, month] = monthValue.split("-").map(Number);
  const periodStartISO = new Date(year, (month || 1) - 1, 1).toISOString();
  const periodEndISO = new Date(year, month || 1, 1).toISOString();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["physician-payroll", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_physician_payroll", {
        p_hospital_id: user.hospitalId,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return (data || []) as PayrollRow[];
    },
    enabled: !!user && !!year && !!month,
  });

  // One query for every physician's itemized entries this period,
  // grouped client-side -- avoids an N+1 query per expanded row.
  const { data: payItems = [] } = useQuery({
    queryKey: ["physician-payroll-items", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("physician_service_pay_items")
        .select("staff_role_id, category, completed_at, service_name, cost_at_time, rate_percent, amount, patient_first_name, patient_last_name")
        .gte("completed_at", periodStartISO)
        .lt("completed_at", periodEndISO)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayItem[];
    },
    enabled: !!user && !!year && !!month,
  });

  const itemsByPhysician = useMemo(() => {
    const map = new Map<string, PayItem[]>();
    payItems.forEach((item) => {
      const list = map.get(item.staff_role_id) ?? [];
      list.push(item);
      map.set(item.staff_role_id, list);
    });
    return map;
  }, [payItems]);

  const allConfirmed = rows.length > 0 && rows.every((r) => r.is_confirmed);
  const anyConfirmed = rows.some((r) => r.is_confirmed);
  const monthLabel = new Date(year, (month || 1) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

  const handleConfirm = async () => {
    if (!user) return;
    setConfirming(true);
    try {
      const { error } = await supabase.rpc("confirm_physician_payroll", {
        p_hospital_id: user.hospitalId,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      toast.success("Payroll confirmed. These amounts are now locked for this month.");
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["physician-payroll", user.hospitalId, year, month] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payroll.");
    } finally {
      setConfirming(false);
    }
  };

  const columns = useMemo<ColumnDef<PayrollRow, any>[]>(() => [
    { id: "full_name", header: "Physician", accessorFn: (r) => r.full_name, enableColumnFilter: false, enableHiding: false },
    { id: "base_pay_amount", header: "Base Pay", accessorFn: (r) => fmt(r.base_pay_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "own_service_amount", header: "Own-Service", accessorFn: (r) => fmt(r.own_service_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "referral_amount", header: "Referral", accessorFn: (r) => fmt(r.referral_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "department_bucket_amount", header: "Dept. Bucket", accessorFn: (r) => fmt(r.department_bucket_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    {
      id: "total_amount",
      header: "Total",
      accessorFn: (r) => fmt(r.total_amount),
      meta: { align: "right" },
      enableColumnFilter: false,
      enableHiding: false,
      cell: ({ row }) => <span className="font-semibold">{fmt(row.original.total_amount)}</span>,
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => (r.is_confirmed ? "Confirmed" : "Preliminary"),
      enableColumnFilter: false,
      enableHiding: false,
      cell: ({ row }) =>
        row.original.is_confirmed ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100">
            Confirmed
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            Preliminary
          </span>
        ),
    },
  ], []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="No physicians found for this period."
        getRowId={(r) => r.staff_role_id}
        getRowCanExpand={(r) => (itemsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0}
        renderSubRow={(r) => {
          const items = itemsByPhysician.get(r.staff_role_id) ?? [];
          return (
            <div className="px-4 py-3">
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No itemized own-service or referral entries this period.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left font-medium py-1 pr-3">Patient</th>
                      <th className="text-left font-medium py-1 pr-3">Service</th>
                      <th className="text-left font-medium py-1 pr-3">Date</th>
                      <th className="text-left font-medium py-1 pr-3">Category</th>
                      <th className="text-right font-medium py-1 pr-3">%</th>
                      <th className="text-right font-medium py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-3 whitespace-nowrap">
                          {[item.patient_last_name, item.patient_first_name].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="py-1 pr-3 whitespace-nowrap">{item.service_name}</td>
                        <td className="py-1 pr-3 whitespace-nowrap">{format(new Date(item.completed_at), "dd.MM.yyyy")}</td>
                        <td className="py-1 pr-3 whitespace-nowrap">{item.category === "own_service" ? "Own-Service" : "Referral"}</td>
                        <td className="py-1 pr-3 text-right whitespace-nowrap">{item.rate_percent ?? 0}%</td>
                        <td className="py-1 text-right whitespace-nowrap">{fmt(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        }}
        rightSlot={
          <div className="flex items-center gap-2">
            {anyConfirmed && !allConfirmed && (
              <span className="text-xs text-amber-700 dark:text-amber-400">
                Some physicians already confirmed
              </span>
            )}
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="h-8 text-xs w-auto"
            />
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setConfirmOpen(true)}
              disabled={allConfirmed || rows.length === 0}
            >
              <Lock className="h-3.5 w-3.5" />
              {allConfirmed ? "All Confirmed" : "Confirm Payroll"}
            </Button>
          </div>
        }
        renderFooter={(table) => {
          const visibleIds = table.getVisibleLeafColumns().map((c) => c.id);
          const totalIndex = visibleIds.indexOf("total_amount");
          return (
            <TableRow>
              <TableCell colSpan={1 + (totalIndex === -1 ? visibleIds.length : totalIndex)} className="font-semibold">
                Grand Total
              </TableCell>
              {totalIndex !== -1 && <TableCell className="text-right font-semibold">{fmt(grandTotal)}</TableCell>}
              {totalIndex !== -1 && visibleIds.slice(totalIndex + 1).map((id) => <TableCell key={id} />)}
            </TableRow>
          );
        }}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm payroll for {monthLabel}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This locks the calculated amounts for every physician not already confirmed this month.</p>
              <p>Locked amounts cannot be changed afterward, even if underlying records change later.</p>
              <p>This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={confirming}>
              {confirming ? "Confirming…" : "Confirm & Lock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
