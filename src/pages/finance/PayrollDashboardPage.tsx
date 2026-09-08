import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import FinancePayrollCharts from "@/components/finance/FinancePayrollCharts";

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

interface PayrollDetailItem {
  category: "own_service" | "referral";
  completed_at: string;
  service_name: string;
  cost_at_time: number;
  rate_percent: number | null;
  amount: number;
}

const fmt = (n: number) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayrollDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PayrollRow | null>(null);

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

  const { data: detailItems = [], isLoading: detailLoading } = useQuery({
    queryKey: ["physician-payroll-detail", selectedRow?.staff_role_id, year, month],
    queryFn: async () => {
      if (!selectedRow) return [];
      const { data, error } = await supabase
        .from("physician_service_pay_items")
        .select("category, completed_at, service_name, cost_at_time, rate_percent, amount")
        .eq("staff_role_id", selectedRow.staff_role_id)
        .gte("completed_at", periodStartISO)
        .lt("completed_at", periodEndISO)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollDetailItem[];
    },
    enabled: !!selectedRow,
  });

  const allConfirmed = rows.length > 0 && rows.every((r) => r.is_confirmed);
  const anyConfirmed = rows.some((r) => r.is_confirmed);
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

  const monthLabel = new Date(year, (month || 1) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Physician Payroll</h1>
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <Label htmlFor="payrollMonth">Period</Label>
            <Input
              id="payrollMonth"
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="w-40"
            />
          </div>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={allConfirmed || rows.length === 0}
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            {allConfirmed ? "All Confirmed" : "Confirm Payroll"}
          </Button>
        </div>
      </div>

      {anyConfirmed && !allConfirmed && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Some physicians below are already confirmed for {monthLabel} and will not be re-confirmed or changed.
        </div>
      )}

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-6 text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-muted-foreground">No physicians found for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Physician</TableHead>
                <TableHead className="text-right">Base Pay</TableHead>
                <TableHead className="text-right">Own-Service</TableHead>
                <TableHead className="text-right">Referral</TableHead>
                <TableHead className="text-right">Dept. Bucket</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.staff_role_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRow(r)}
                >
                  <TableCell className="font-medium">{r.full_name}</TableCell>
                  <TableCell className="text-right">{fmt(r.base_pay_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.own_service_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.referral_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.department_bucket_amount)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(r.total_amount)}</TableCell>
                  <TableCell>
                    {r.is_confirmed ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-100">
                        Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                        Preliminary
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Grand Total</TableCell>
                <TableCell colSpan={5} className="text-right font-semibold">{fmt(grandTotal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>

      {rows.length > 0 && <FinancePayrollCharts rows={rows} year={year} month={month} />}

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

      <Dialog open={!!selectedRow} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selectedRow?.full_name} — {monthLabel}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : detailItems.length === 0 ? (
            <p className="text-muted-foreground">No own-service or referral services completed this period.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Completed</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailItems.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{new Date(item.completed_at).toLocaleDateString()}</TableCell>
                      <TableCell>{item.service_name}</TableCell>
                      <TableCell>{item.category === "own_service" ? "Own-Service" : "Referral"}</TableCell>
                      <TableCell className="text-right">{fmt(item.cost_at_time)}</TableCell>
                      <TableCell className="text-right">{item.rate_percent ?? 0}%</TableCell>
                      <TableCell className="text-right">{fmt(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Total</TableCell>
                    <TableCell colSpan={4} />
                    <TableCell className="text-right font-semibold">
                      {fmt(detailItems.reduce((sum, item) => sum + Number(item.amount || 0), 0))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
