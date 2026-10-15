import { Fragment, useMemo, useState } from "react";
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

interface BasePayItem {
  staff_role_id: string;
  amount: number;
  description: string | null;
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
  patient_number: string | null;
}

interface BucketPayItem {
  staff_role_id: string;
  bucket_name: string;
  member_percent: number;
  completed_at: string;
  service_name: string;
  cost_at_time: number;
  amount: number;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_number: string | null;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const patientName = (first: string | null, last: string | null) =>
  [last, first].filter(Boolean).join(" ") || "—";

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// One row of the unified detail table (matches the Patient ID | Patient |
// Service | Date | Category | % | Amount layout, sectioned with subtotals).
interface DetailRow {
  patientId: string;
  patient: string;
  service: string;
  date: string;
  category: string;
  percent: string;
  amount: number;
}

export default function PayrollPage() {
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

  const { data: basePayItems = [] } = useQuery({
    queryKey: ["physician-payroll-base-pay", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("physician_base_pay_items")
        .select("staff_role_id, amount, description");
      if (error) throw error;
      return (data || []) as BasePayItem[];
    },
    enabled: !!user,
  });

  // One query for every physician's itemized entries this period,
  // grouped client-side -- avoids an N+1 query per expanded row.
  const { data: payItems = [] } = useQuery({
    queryKey: ["physician-payroll-items", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("physician_service_pay_items")
        .select("staff_role_id, category, completed_at, service_name, cost_at_time, rate_percent, amount, patient_first_name, patient_last_name, patient_number")
        .gte("completed_at", periodStartISO)
        .lt("completed_at", periodEndISO)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayItem[];
    },
    enabled: !!user && !!year && !!month,
  });

  const { data: bucketPayItems = [] } = useQuery({
    queryKey: ["physician-payroll-bucket-items", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("payroll_bucket_pay_items")
        .select("staff_role_id, bucket_name, member_percent, completed_at, service_name, cost_at_time, amount, patient_first_name, patient_last_name, patient_number")
        .gte("completed_at", periodStartISO)
        .lt("completed_at", periodEndISO)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BucketPayItem[];
    },
    enabled: !!user && !!year && !!month,
  });

  const basePayByPhysician = useMemo(() => {
    const map = new Map<string, BasePayItem[]>();
    basePayItems.forEach((item) => {
      const list = map.get(item.staff_role_id) ?? [];
      list.push(item);
      map.set(item.staff_role_id, list);
    });
    return map;
  }, [basePayItems]);

  const itemsByPhysician = useMemo(() => {
    const map = new Map<string, PayItem[]>();
    payItems.forEach((item) => {
      const list = map.get(item.staff_role_id) ?? [];
      list.push(item);
      map.set(item.staff_role_id, list);
    });
    return map;
  }, [payItems]);

  const bucketItemsByPhysician = useMemo(() => {
    const map = new Map<string, BucketPayItem[]>();
    bucketPayItems.forEach((item) => {
      const list = map.get(item.staff_role_id) ?? [];
      list.push(item);
      map.set(item.staff_role_id, list);
    });
    return map;
  }, [bucketPayItems]);

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
    { id: "department_bucket_amount", header: "Bucket", accessorFn: (r) => fmt(r.department_bucket_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
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
        getRowCanExpand={(r) =>
          (basePayByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          (itemsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          (bucketItemsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0
        }
        renderSubRow={(r) => {
          const basePay = basePayByPhysician.get(r.staff_role_id) ?? [];
          const items = itemsByPhysician.get(r.staff_role_id) ?? [];
          const bucketItems = bucketItemsByPhysician.get(r.staff_role_id) ?? [];
          const referralItems = items.filter((i) => i.category === "referral");
          const ownServiceItems = items.filter((i) => i.category === "own_service");

          // Group bucket rows by bucket, labeling the Category column
          // with the bucket's own name rather than a generic "Bucket".
          const byBucket = new Map<string, BucketPayItem[]>();
          bucketItems.forEach((item) => {
            const list = byBucket.get(item.bucket_name) ?? [];
            list.push(item);
            byBucket.set(item.bucket_name, list);
          });

          type Section = { rows: DetailRow[]; total: number };
          const sections: Section[] = [];

          if (basePay.length > 0) {
            sections.push({
              rows: basePay.map((item) => ({
                patientId: "—",
                patient: "—",
                service: item.description || "Base Pay",
                date: "—",
                category: "Base-pay",
                percent: "—",
                amount: Number(item.amount),
              })),
              total: basePay.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          }

          if (referralItems.length > 0) {
            sections.push({
              rows: referralItems.map((item) => ({
                patientId: item.patient_number || "—",
                patient: patientName(item.patient_first_name, item.patient_last_name),
                service: item.service_name,
                date: format(new Date(item.completed_at), "dd.MM.yyyy"),
                category: "Referral",
                percent: `${item.rate_percent ?? 0}%`,
                amount: Number(item.amount),
              })),
              total: referralItems.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          }

          if (ownServiceItems.length > 0) {
            sections.push({
              rows: ownServiceItems.map((item) => ({
                patientId: item.patient_number || "—",
                patient: patientName(item.patient_first_name, item.patient_last_name),
                service: item.service_name,
                date: format(new Date(item.completed_at), "dd.MM.yyyy"),
                category: "Own-Service",
                percent: `${item.rate_percent ?? 0}%`,
                amount: Number(item.amount),
              })),
              total: ownServiceItems.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          }

          byBucket.forEach((bucketRows, bucketName) => {
            sections.push({
              rows: bucketRows.map((item) => ({
                patientId: item.patient_number || "—",
                patient: patientName(item.patient_first_name, item.patient_last_name),
                service: item.service_name,
                date: format(new Date(item.completed_at), "dd.MM.yyyy"),
                category: `${bucketName} bucket`,
                percent: `${item.member_percent}%`,
                amount: Number(item.amount),
              })),
              total: bucketRows.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          });

          const grand = sections.reduce((sum, s) => sum + s.total, 0);

          if (sections.length === 0) {
            return (
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground">No itemized entries this period.</p>
              </div>
            );
          }

          return (
            <div className="px-4 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left font-medium py-1 pr-3">ID пациента</th>
                    <th className="text-left font-medium py-1 pr-3">Patient</th>
                    <th className="text-left font-medium py-1 pr-3">Service</th>
                    <th className="text-left font-medium py-1 pr-3">Date</th>
                    <th className="text-left font-medium py-1 pr-3">Category</th>
                    <th className="text-right font-medium py-1 pr-3">%</th>
                    <th className="text-right font-medium py-1">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section, sIdx) => (
                    <Fragment key={sIdx}>
                      {section.rows.map((row, i) => (
                        <tr key={`${sIdx}-${i}`} className="border-b last:border-0">
                          <td className="py-1 pr-3 whitespace-nowrap">{row.patientId}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.patient}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.service}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.date}</td>
                          <td className="py-1 pr-3 whitespace-nowrap">{row.category}</td>
                          <td className="py-1 pr-3 text-right whitespace-nowrap">{row.percent}</td>
                          <td className="py-1 text-right whitespace-nowrap">{fmt(row.amount)}</td>
                        </tr>
                      ))}
                      <tr key={`${sIdx}-subtotal`} className="border-b font-medium">
                        <td colSpan={6} className="py-1 pr-3 text-right">Total:</td>
                        <td className="py-1 text-right whitespace-nowrap">{fmt(section.total)}</td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={6} className="py-1 pr-3 text-right">Grand Total:</td>
                    <td className="py-1 text-right whitespace-nowrap">{fmt(grand)}</td>
                  </tr>
                </tbody>
              </table>

NOTES:
- "ID пациента" matches the existing Patient ID column label used elsewhere in the app (FinanceServicesTab.tsx), for consistency.
- colSpan on the subtotal/grand-total rows bumped from 5 to 6 to account for the new leading column.
- Base-pay rows have no patient, so patientId stays "—" like patient does.
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
    </div>
  );
}

