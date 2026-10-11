import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

interface RevenueItem {
  visit_service_id: string;
  report_date: string;
  revenue: number;
  service_name: string | null;
  service_group_name: string | null;
  service_subgroup_name: string | null;
  op_ip: "inpatient" | "outpatient";
  department_id: string | null;
  physician_name: string | null;
  payment_status: "paid" | "in_progress" | "not_paid";
}

const GROUP_BY_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "service", label: "Service" },
  { value: "service_group", label: "Service Group" },
  { value: "service_subgroup", label: "Service Sub-group" },
  { value: "physician", label: "Physician" },
  { value: "department", label: "Department" },
  { value: "op_ip", label: "OP / IP" },
] as const;

type GroupByKey = typeof GROUP_BY_OPTIONS[number]["value"];

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FinanceRevenueReport({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupByKey>("service_group");
  const [opIpFilter, setOpIpFilter] = useState<"all" | "inpatient" | "outpatient">("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  const { data: departments = [] } = useQuery({
    queryKey: ["finance-departments-lookup", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const deptNameById = useMemo(
    () => new Map(departments.map((d: any) => [d.id, d.name])),
    [departments],
  );

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["finance-revenue-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select(`
          visit_service_id, report_date, revenue,
          service_name, service_group_name, service_subgroup_name,
          op_ip, department_id, physician_name, payment_status
        `)
        .eq("hospital_id", user.hospitalId)
        .gte("report_date", from)
        .lte("report_date", to);
      if (error) throw error;
      return (data || []) as unknown as RevenueItem[];
    },
    enabled: !!user,
  });

  const filtered = items.filter((i) => {
    if (opIpFilter !== "all" && i.op_ip !== opIpFilter) return false;
    if (departmentFilter !== "all" && (i.department_id ?? "none") !== departmentFilter) return false;
    return true;
  });

  const groupLabel = (i: RevenueItem): string => {
    switch (groupBy) {
      case "date":
        return format(new Date(i.report_date), "dd.MM.yyyy");
      case "service":
        return i.service_name || "—";
      case "service_group":
        return i.service_group_name || "—";
      case "service_subgroup":
        return i.service_subgroup_name || "—";
      case "physician":
        return i.physician_name || "Not assigned";
      case "department":
        return i.department_id ? deptNameById.get(i.department_id) || "Unknown" : "Unassigned";
      case "op_ip":
        return i.op_ip === "inpatient" ? "Inpatient" : "Outpatient";
      default:
        return "—";
    }
  };

  const rowsMap = new Map<
    string,
    { label: string; paid: number; inProgress: number; notPaid: number }
  >();

  filtered.forEach((i) => {
    const label = groupLabel(i);
    const row = rowsMap.get(label) || { label, paid: 0, inProgress: 0, notPaid: 0 };
    const amount = Number(i.revenue || 0);
    if (i.payment_status === "paid") row.paid += amount;
    else if (i.payment_status === "in_progress") row.inProgress += amount;
    else row.notPaid += amount;
    rowsMap.set(label, row);
  });

  const rows = Array.from(rowsMap.values())
    .map((r) => ({ ...r, total: r.paid + r.inProgress + r.notPaid }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce(
    (acc, r) => ({
      paid: acc.paid + r.paid,
      inProgress: acc.inProgress + r.inProgress,
      notPaid: acc.notPaid + r.notPaid,
      total: acc.total + r.total,
    }),
    { paid: 0, inProgress: 0, notPaid: 0, total: 0 },
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByKey)}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">OP/IP</span>
          <Select value={opIpFilter} onValueChange={(v) => setOpIpFilter(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="outpatient">Outpatient</SelectItem>
              <SelectItem value="inpatient">Inpatient</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Department</span>
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {departments.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No services in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.label}</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">In Progress</TableHead>
                <TableHead className="text-right">Not Paid</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right">{fmt(r.paid)}</TableCell>
                  <TableCell className="text-right">{fmt(r.inProgress)}</TableCell>
                  <TableCell className="text-right">{fmt(r.notPaid)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell className="text-right font-semibold">{fmt(grandTotal.paid)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(grandTotal.inProgress)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(grandTotal.notPaid)}</TableCell>
                <TableCell className="text-right font-semibold">{fmt(grandTotal.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
