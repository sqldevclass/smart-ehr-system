import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PeriodState, getDateBounds } from "@/components/shared/PeriodFilter";

const VIEW_KEY = "finance_services_columns";

interface ServiceRow {
  visit_service_id: string;
  report_date: string;
  revenue: number;
  service_name: string | null;
  service_group_name: string | null;
  op_ip: "inpatient" | "outpatient";
  payment_status: "paid" | "in_progress" | "not_paid";
  service_status_code: string | null;
  service_status_name: string | null;
  patient_number: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_dob: string | null;
  hospitalization_number: string | null;
  invoice_number: string | null;
  referred_by_name: string | null;
  rendered_by_name: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  paid: "Оплачено",
  in_progress: "В процессе",
  not_paid: "Не оплачено",
};
const PAYMENT_DOT: Record<string, string> = {
  paid: "bg-green-500",
  in_progress: "bg-orange-400",
  not_paid: "bg-red-500",
};
const SERVICE_STATUS_DOT: Record<string, string> = {
  completed: "bg-green-500",
  in_progress: "bg-orange-400",
  ready_for_execution: "bg-blue-500",
  preliminary: "bg-slate-400",
  reservation: "bg-purple-400",
  cancelled: "bg-red-500",
};
const OP_IP_LABELS: Record<string, string> = {
  inpatient: "Стационар",
  outpatient: "Амбулаторно",
};

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  period: PeriodState;
  onPeriodChange: (s: PeriodState) => void;
}

export default function FinanceServicesTab({ period, onPeriodChange }: Props) {
  const { user } = useAuth();
  const { from, to } = getDateBounds(period);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["finance-services-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select(`
          visit_service_id, report_date, revenue,
          service_name, service_group_name, op_ip, payment_status,
          service_status_code, service_status_name,
          patient_number, patient_first_name, patient_last_name, patient_dob,
          hospitalization_number, invoice_number,
          referred_by_name, rendered_by_name
        `)
        .eq("hospital_id", user.hospitalId)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ServiceRow[];
    },
    enabled: !!user,
  });

  const columns = useMemo<ColumnDef<ServiceRow, any>[]>(() => [
    {
      id: "service_status",
      header: "Состояние",
      accessorFn: (r) => r.service_status_name || r.service_status_code || "",
      cell: ({ row }) => (
        <span
          className={cn("inline-block w-2.5 h-2.5 rounded-full", SERVICE_STATUS_DOT[row.original.service_status_code ?? ""] || "bg-muted-foreground")}
          title={row.original.service_status_name ?? ""}
        />
      ),
    },
    {
      id: "payment_status",
      header: "Оплата",
      accessorFn: (r) => PAYMENT_LABELS[r.payment_status] || r.payment_status,
      cell: ({ row }) => (
        <span
          className={cn("inline-block w-2.5 h-2.5 rounded-full", PAYMENT_DOT[row.original.payment_status])}
          title={PAYMENT_LABELS[row.original.payment_status]}
        />
      ),
    },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospitalization_number || "" },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patient_number || "" },
    { id: "patient_last_name", header: "Фамилия", accessorFn: (r) => r.patient_last_name || "" },
    { id: "patient_first_name", header: "Имя", accessorFn: (r) => r.patient_first_name || "" },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => (r.patient_dob ? format(new Date(r.patient_dob), "dd.MM.yyyy") : "") },
    { id: "date", header: "Дата", accessorFn: (r) => (r.report_date ? format(new Date(r.report_date), "dd.MM.yyyy HH:mm") : "") },
    { id: "group", header: "Группа", accessorFn: (r) => r.service_group_name || "" },
    { id: "service", header: "Услуга", accessorFn: (r) => r.service_name || "" },
    { id: "referred_by", header: "Направил", accessorFn: (r) => r.referred_by_name || "" },
    { id: "rendered_by", header: "Исполнитель", accessorFn: (r) => r.rendered_by_name || "" },
    { id: "op_ip", header: "IP/OP", accessorFn: (r) => OP_IP_LABELS[r.op_ip] || r.op_ip },
    { id: "sum", header: "Сумма", accessorFn: (r) => fmt(r.revenue), meta: { align: "right" } },
    { id: "invoice_number", header: "№ счета", accessorFn: (r) => r.invoice_number || "" },
  ], []);

  return (
    <DataTable
      columns={columns}
      data={items}
      isLoading={isLoading}
      emptyMessage="No services in this period."
      viewKey={VIEW_KEY}
      getRowId={(r) => r.visit_service_id}
      rightSlot={
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-8 text-xs w-auto"
            value={period.customFrom ?? ""}
            onChange={(e) =>
              onPeriodChange({ period: "custom", customFrom: e.target.value, customTo: period.customTo ?? e.target.value })
            }
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            className="h-8 text-xs w-auto"
            value={period.customTo ?? ""}
            onChange={(e) =>
              onPeriodChange({ period: "custom", customFrom: period.customFrom ?? e.target.value, customTo: e.target.value })
            }
          />
        </div>
      }
      renderFooter={(table) => {
        const visibleIds = table.getVisibleLeafColumns().map((c) => c.id);
        const sumIndex = visibleIds.indexOf("sum");
        const sumTotal = table.getFilteredRowModel().rows.reduce(
          (acc, row) => acc + Number(row.original.revenue || 0),
          0,
        );
        return (
          <TableRow>
            <TableCell colSpan={1 + (sumIndex === -1 ? visibleIds.length : sumIndex)} className="font-semibold">
              Итого
            </TableCell>
            {sumIndex !== -1 && <TableCell className="text-right font-semibold">{fmt(sumTotal)}</TableCell>}
            {sumIndex !== -1 && visibleIds.slice(sumIndex + 1).map((id) => <TableCell key={id} />)}
          </TableRow>
        );
      }}
    />
  );
}
