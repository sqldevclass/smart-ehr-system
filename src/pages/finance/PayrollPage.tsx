import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import FinancePayrollCharts from "@/components/finance/FinancePayrollCharts";

interface PayrollRow {
  staff_role_id: string;
  full_name: string;
  base_pay_amount: number;
  own_service_amount: number;
  referral_amount: number;
  department_bucket_amount: number;
  bonus_amount: number;
  advance_amount: number;
  discount_correction_amount: number;
  carried_in_amount: number;
  carried_out_amount: number;
  total_amount: number;
  is_confirmed: boolean;
}

interface BasePayItem {
  staff_role_id: string;
  amount: number;
  description: string | null;
}

interface PayItem {
  discount_percent: number | null;
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
  discount_percent: number | null;
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

// A physician/month can now have several bonus and several advance
// entries -- each one is permanent once created (insert-only; no edit).
interface AdjustmentItem {
  adjustment_id: string;
  staff_role_id: string;
  type: "bonus" | "advance";
  amount: number;
  description: string | null;
  created_at: string;
  approved_by_name: string | null;
}

interface CorrectionItem {
  correction_id: string;
  staff_role_id: string;
  source: "own_service" | "referral" | "bucket";
  bucket_name: string | null;
  service_name: string;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_number: string | null;
  service_month: string;
  rate_percent: number;
  discount_percent_before: number | null;
  discount_percent_after: number | null;
  amount: number;
  created_at: string;
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const patientName = (first: string | null, last: string | null) =>
  [last, first].filter(Boolean).join(" ") || "—";

function withDiscountLabel(name: string, percent: number | null | undefined): string {
  return percent == null ? name : `${name} (${Number(percent)}% discount)`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// One row of the unified detail table (matches the Patient ID |
// Patient/Staff | Service | Date | Category | % | Amount layout,
// sectioned with subtotals).
interface DetailRow {
  patientId: string;
  patient: string;
  service: string;
  date: string;
  category: string;
  percent: string;
  amount: number;
  adjustmentId?: string;
}

export default function PayrollPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthValue, setMonthValue] = useState(currentMonthValue());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentStaffRoleId, setAdjustmentStaffRoleId] = useState<string | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"bonus" | "advance">("bonus");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdjustmentItem | null>(null);
  const [deletingAdjustment, setDeletingAdjustment] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("all");

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
        .select("staff_role_id, category, completed_at, service_name, cost_at_time, rate_percent, amount, patient_first_name, patient_last_name, patient_number, discount_percent")
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
        .select("staff_role_id, bucket_name, member_percent, completed_at, service_name, cost_at_time, amount, patient_first_name, patient_last_name, patient_number, discount_percent")
        .gte("completed_at", periodStartISO)
        .lt("completed_at", periodEndISO)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BucketPayItem[];
    },
    enabled: !!user && !!year && !!month,
  });

  // Bonus/advance entries for this period. Several rows per
  // staff_role_id/type are expected now -- each one is a separate,
  // permanent entry.
  const { data: adjustmentItems = [] } = useQuery({
    queryKey: ["physician-payroll-adjustments", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("payroll_adjustment_items")
        .select("adjustment_id, staff_role_id, type, amount, description, created_at, approved_by_name")
        .eq("year", year)
        .eq("month", month)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as AdjustmentItem[];
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

  const { data: correctionItems = [] } = useQuery({
    queryKey: ["physician-payroll-corrections", user?.hospitalId, year, month],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_payroll_correction_items", {
        p_hospital_id: user.hospitalId,
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return (data || []) as CorrectionItem[];
    },
    enabled: !!user && !!year && !!month,
  });

  const correctionsByPhysician = useMemo(() => {
    const map = new Map<string, CorrectionItem[]>();
    correctionItems.forEach((item) => {
      const list = map.get(item.staff_role_id) ?? [];
      list.push(item);
      map.set(item.staff_role_id, list);
    });
    return map;
  }, [correctionItems]);

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

  // Keyed by `${staff_role_id}-${type}` -- now a LIST, since a
  // physician can have several bonus/advance entries in one month.
  const adjustmentsByKey = useMemo(() => {
    const map = new Map<string, AdjustmentItem[]>();
    adjustmentItems.forEach((item) => {
      const key = `${item.staff_role_id}-${item.type}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [adjustmentItems]);

  // Тип персонала per staff_role_id, to drive the tab filter below --
  // get_physician_payroll doesn't return it, so it's fetched separately.
  const { data: staffTypeRows = [] } = useQuery({
    queryKey: ["physician-staff-types", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data: staffRoles, error } = await supabase
        .from("staff_roles")
        .select("id, person_id")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician");
      if (error) throw error;
      const personIds = (staffRoles || []).map((r: any) => r.person_id).filter(Boolean);
      const { data: employments } = await supabase
        .from("employments")
        .select("person_id, staff_type_id")
        .in("person_id", personIds.length > 0 ? personIds : [""]);
      const staffTypeByPerson = new Map((employments || []).map((e: any) => [e.person_id, e.staff_type_id]));
      return (staffRoles || []).map((r: any) => ({
        staff_role_id: r.id,
        staff_type_id: staffTypeByPerson.get(r.person_id) ?? null,
      }));
    },
    enabled: !!user,
  });

  const staffTypeByStaffRole = useMemo(() => {
    const map = new Map<string, string | null>();
    staffTypeRows.forEach((r: any) => map.set(r.staff_role_id, r.staff_type_id));
    return map;
  }, [staffTypeRows]);

  // Tabs: "All" plus one per active Тип персонала.
  const { data: staffTypesForTabs = [] } = useQuery({
    queryKey: ["staff-types-tabs", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("staff_types")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filteredRows = selectedTab === "all"
    ? rows
    : rows.filter((r) => staffTypeByStaffRole.get(r.staff_role_id) === selectedTab);

  // Confirmation state and the Confirm Payroll action always apply to
  // every physician for the month, regardless of which tab is selected --
  // only the displayed total below follows the current tab.
  const allConfirmed = rows.length > 0 && rows.every((r) => r.is_confirmed);
  const anyConfirmed = rows.some((r) => r.is_confirmed);
  const monthLabel = new Date(year, (month || 1) - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const grandTotal = filteredRows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

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
      queryClient.invalidateQueries({ queryKey: ["physician-payroll-corrections", user.hospitalId, year, month] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm payroll.");
    } finally {
      setConfirming(false);
    }
  };

  // Always opens empty -- adding a new entry, never editing an
  // existing one (entries are immutable once saved).
  const openAdjustmentDialog = (staffRoleId: string, type: "bonus" | "advance") => {
    setAdjustmentStaffRoleId(staffRoleId);
    setAdjustmentType(type);
    setAdjustmentAmount("");
    setAdjustmentDescription("");
    setAdjustmentDialogOpen(true);
  };

  const handleSaveAdjustment = async () => {
    if (!adjustmentStaffRoleId) return;
    const amountNum = Number(adjustmentAmount);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      toast.error("Enter a valid, non-negative amount.");
      return;
    }
    setSavingAdjustment(true);
    try {
      const { error } = await supabase.rpc("set_payroll_adjustment", {
        p_staff_role_id: adjustmentStaffRoleId,
        p_year: year,
        p_month: month,
        p_type: adjustmentType,
        p_amount: amountNum,
        p_description: adjustmentDescription || null,
      });
      if (error) throw error;
      toast.success(`${adjustmentType === "bonus" ? "Bonus" : "Advance"} added.`);
      setAdjustmentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["physician-payroll", user?.hospitalId, year, month] });
      queryClient.invalidateQueries({ queryKey: ["physician-payroll-adjustments", user?.hospitalId, year, month] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSavingAdjustment(false);
    }
  };

  // Deleting an entry is an admin-only action; the RPC itself enforces
  // this (finance.delete_payroll_adjustment), so a non-admin simply
  // gets an error toast if they try.
  const handleDeleteAdjustment = async () => {
    if (!deleteTarget) return;
    setDeletingAdjustment(true);
    try {
      const { error } = await supabase.rpc("remove_payroll_adjustment", {
        p_adjustment_id: deleteTarget.adjustment_id,
      });
      if (error) throw error;
      toast.success("Entry deleted.");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["physician-payroll", user?.hospitalId, year, month] });
      queryClient.invalidateQueries({ queryKey: ["physician-payroll-adjustments", user?.hospitalId, year, month] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete entry.");
    } finally {
      setDeletingAdjustment(false);
    }
  };

  const columns = useMemo<ColumnDef<PayrollRow, any>[]>(() => [
    { id: "full_name", header: "Physician", accessorFn: (r) => r.full_name, enableColumnFilter: false, enableHiding: false },
    { id: "base_pay_amount", header: "Base Pay", accessorFn: (r) => fmt(r.base_pay_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "own_service_amount", header: "Own-Service", accessorFn: (r) => fmt(r.own_service_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "referral_amount", header: "Referral", accessorFn: (r) => fmt(r.referral_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    { id: "department_bucket_amount", header: "Bucket", accessorFn: (r) => fmt(r.department_bucket_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    {
      id: "bonus_amount",
      header: "Bonus",
      accessorFn: (r) => fmt(r.bonus_amount),
      meta: { align: "right" },
      enableColumnFilter: false,
      enableHiding: false,
      cell: ({ row }) => {
        const items = adjustmentsByKey.get(`${row.original.staff_role_id}-bonus`) ?? [];
        return (
          <button
            type="button"
            disabled={row.original.is_confirmed}
            onClick={(e) => {
              e.stopPropagation();
              openAdjustmentDialog(row.original.staff_role_id, "bonus");
            }}
            className="w-full text-right hover:underline disabled:no-underline disabled:cursor-default disabled:opacity-60"
          >
            {items.length > 0 ? items.map((i) => fmt(i.amount)).join("; ") : "—"}
          </button>
        );
      },
    },
    {
      id: "advance_amount",
      header: "Advance",
      accessorFn: (r) => fmt(r.advance_amount),
      meta: { align: "right" },
      enableColumnFilter: false,
      enableHiding: false,
      cell: ({ row }) => {
        const items = adjustmentsByKey.get(`${row.original.staff_role_id}-advance`) ?? [];
        return (
          <button
            type="button"
            disabled={row.original.is_confirmed}
            onClick={(e) => {
              e.stopPropagation();
              openAdjustmentDialog(row.original.staff_role_id, "advance");
            }}
            className="w-full text-right hover:underline disabled:no-underline disabled:cursor-default disabled:opacity-60"
          >
            {items.length > 0 ? items.map((i) => fmt(i.amount)).join("; ") : "—"}
          </button>
        );
      },
    },
    { id: "discount_correction_amount", header: "Discount Adj.", accessorFn: (r) => fmt(r.discount_correction_amount + r.carried_in_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
    {
      id: "total_amount",
      header: "Total",
      accessorFn: (r) => fmt(r.total_amount),
      meta: { align: "right" },
      enableColumnFilter: false,
      enableHiding: false,
      cell: ({ row }) => <span className="font-semibold">{fmt(row.original.total_amount)}</span>,
    },
    { id: "carried_out_amount", header: "Carried Over", accessorFn: (r) => fmt(r.carried_out_amount), meta: { align: "right" }, enableColumnFilter: false, enableHiding: false },
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
  ], [adjustmentsByKey]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-3">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {staffTypesForTabs.map((t: any) => (
            <TabsTrigger key={t.id} value={t.id}>{t.name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable
        columns={columns}
        data={filteredRows}
        isLoading={isLoading}
        emptyMessage="No physicians in this group for this period."
        getRowId={(r) => r.staff_role_id}
        getRowCanExpand={(r) =>
          (basePayByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          (itemsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          (bucketItemsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          (adjustmentsByKey.get(`${r.staff_role_id}-bonus`)?.length ?? 0) > 0 ||
          (adjustmentsByKey.get(`${r.staff_role_id}-advance`)?.length ?? 0) > 0 ||
          (correctionsByPhysician.get(r.staff_role_id)?.length ?? 0) > 0 ||
          r.carried_in_amount !== 0 ||
          r.carried_out_amount !== 0
        }
        renderSubRow={(r) => {
          const basePay = basePayByPhysician.get(r.staff_role_id) ?? [];
          const items = itemsByPhysician.get(r.staff_role_id) ?? [];
          const bucketItems = bucketItemsByPhysician.get(r.staff_role_id) ?? [];
          const referralItems = items.filter((i) => i.category === "referral");
          const ownServiceItems = items.filter((i) => i.category === "own_service");
          const bonusItems = adjustmentsByKey.get(`${r.staff_role_id}-bonus`) ?? [];
          const advanceItems = adjustmentsByKey.get(`${r.staff_role_id}-advance`) ?? [];
          const physicianCorrections = correctionsByPhysician.get(r.staff_role_id) ?? [];

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
                service: withDiscountLabel(item.service_name, item.discount_percent),
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
                service: withDiscountLabel(item.service_name, item.discount_percent),
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
                service: withDiscountLabel(item.service_name, item.discount_percent),
                date: format(new Date(item.completed_at), "dd.MM.yyyy"),
                category: `${bucketName} bucket`,
                percent: `${item.member_percent}%`,
                amount: Number(item.amount),
              })),
              total: bucketRows.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          });

          if (bonusItems.length > 0) {
            sections.push({
              rows: bonusItems.map((item) => ({
                patientId: "—",
                patient: item.approved_by_name || "—",
                service: item.description || "Bonus",
                date: format(new Date(item.created_at), "dd.MM.yyyy"),
                category: "Bonus",
                percent: "—",
                amount: Number(item.amount),
                adjustmentId: item.adjustment_id,
              })),
              total: bonusItems.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          }

          if (advanceItems.length > 0) {
            sections.push({
              rows: advanceItems.map((item) => ({
                patientId: "—",
                patient: item.approved_by_name || "—",
                service: item.description || "Advance",
                date: format(new Date(item.created_at), "dd.MM.yyyy"),
                category: "Advance",
                percent: "—",
                amount: -Number(item.amount),
                adjustmentId: item.adjustment_id,
              })),
              total: -advanceItems.reduce((sum, i) => sum + Number(i.amount), 0),
            });
          }

          if (physicianCorrections.length > 0) {
            sections.push({
              rows: physicianCorrections.map((item) => {
                const label = item.discount_percent_after != null
                  ? `${Number(item.discount_percent_after)}% discount applied`
                  : "discount removed";
                return {
                  patientId: item.patient_number || "—",
                  patient: patientName(item.patient_first_name, item.patient_last_name),
                  service: `${item.service_name} (${label}), ${format(parseISO(item.service_month), "MMM yyyy")}`,
                  date: format(new Date(item.created_at), "dd.MM.yyyy"),
                  category: item.source === "bucket"
                    ? `${item.bucket_name} bucket – discount correction`
                    : item.source === "referral"
                      ? "Referral – discount correction"
                      : "Own-Service – discount correction",
                  percent: `${item.rate_percent}%`,
                  amount: Number(item.amount),
                };
              }),
              total: physicianCorrections.reduce((sum, item) => sum + Number(item.amount), 0),
            });
          }

          if (r.carried_in_amount !== 0 || r.carried_out_amount !== 0) {
            const carryRows: DetailRow[] = [];
            if (r.carried_in_amount !== 0) {
              carryRows.push({
                patientId: "—",
                patient: "—",
                service: "Carried over from previous month",
                date: "—",
                category: "Carry-over",
                percent: "—",
                amount: r.carried_in_amount,
              });
            }
            if (r.carried_out_amount !== 0) {
              carryRows.push({
                patientId: "—",
                patient: "—",
                service: "Deferred to next month (payable total cannot be negative)",
                date: "—",
                category: "Carry-over",
                percent: "—",
                amount: -r.carried_out_amount,
              });
            }
            sections.push({ rows: carryRows, total: r.carried_in_amount - r.carried_out_amount });
          }

          const grand = sections.reduce((sum, s) => sum + s.total, 0);
          const adjustmentsById = new Map<string, AdjustmentItem>(
            [...bonusItems, ...advanceItems].map((item) => [item.adjustment_id, item])
          );

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
                    <th className="text-left font-medium py-1 pr-3">Patient/Staff</th>
                    <th className="text-left font-medium py-1 pr-3">Service</th>
                    <th className="text-left font-medium py-1 pr-3">Date</th>
                    <th className="text-left font-medium py-1 pr-3">Category</th>
                    <th className="text-right font-medium py-1 pr-3">%</th>
                    <th className="text-right font-medium py-1 pr-3">Amount</th>
                    <th className="w-8"></th>
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
                          <td className="py-1 pr-3 text-right whitespace-nowrap">{fmt(row.amount)}</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            {row.adjustmentId && !r.is_confirmed && (
                              <button
                                type="button"
                                onClick={() => {
                                  const item = adjustmentsById.get(row.adjustmentId!);
                                  if (item) setDeleteTarget(item);
                                }}
                                className="text-muted-foreground hover:text-destructive"
                                title="Delete entry (admin only)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr key={`${sIdx}-subtotal`} className="font-medium border-b">
                        <td colSpan={6} className="py-1 pr-3 text-right">Total:</td>
                        <td className="py-1 pr-3 text-right whitespace-nowrap">{fmt(section.total)}</td>
                        <td></td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="font-semibold">
                    <td colSpan={6} className="py-1 pr-3 text-right">Grand Total:</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap">{fmt(grand)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
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

      {filteredRows.length > 0 && <FinancePayrollCharts rows={filteredRows} year={year} month={month} />}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm payroll for {monthLabel}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>This locks the calculated amounts for every physician not already confirmed this month.</p>
              <p>Locked amounts cannot be changed afterward, even if underlying records change later.</p>
              <p>This action cannot be undone.</p>
              <p>Discount corrections for earlier months and any carried-over balance are included in these amounts.</p>
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

      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add {adjustmentType === "bonus" ? "Bonus" : "Advance"} — {monthLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="adjustmentAmount">Amount</Label>
              <Input
                id="adjustmentAmount"
                type="number"
                min={0}
                step="0.01"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adjustmentDescription">Description</Label>
              <Textarea
                id="adjustmentDescription"
                value={adjustmentDescription}
                onChange={(e) => setAdjustmentDescription(e.target.value)}
                placeholder={adjustmentType === "bonus" ? "e.g. Performance bonus" : "e.g. Advance against November pay"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(false)} disabled={savingAdjustment}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdjustment} disabled={savingAdjustment}>
              {savingAdjustment ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {deleteTarget?.type} entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Amount {fmt(deleteTarget.amount)}{deleteTarget.description ? ` — ${deleteTarget.description}` : ""}. This cannot be undone. Only an admin can delete a bonus/advance entry.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAdjustment}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAdjustment} disabled={deletingAdjustment}>
              {deletingAdjustment ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
