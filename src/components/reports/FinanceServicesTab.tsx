import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ColumnFilterDropdown from "@/components/reports/ColumnFilterDropdown";
import { cn } from "@/lib/utils";

interface ServiceRow {
  visit_service_id: string;
  report_date: string;
  revenue: number;
  service_name: string | null;
  service_group_name: string | null;
  op_ip: "inpatient" | "outpatient";
  payment_status: "paid" | "in_progress" | "not_paid";
  patient_number: string | null;
  patient_full_name: string | null;
  patient_dob: string | null;
  hospitalization_number: string | null;
  invoice_number: string | null;
  referred_by_name: string | null;
  rendered_by_name: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  paid: "Оплачено",
  in_progress: "В процессе",
  not_paid: "Не оплачено",
};
const STATUS_DOT: Record<string, string> = {
  paid: "bg-green-500",
  in_progress: "bg-orange-400",
  not_paid: "bg-red-500",
};
const OP_IP_LABELS: Record<string, string> = {
  inpatient: "Стационар",
  outpatient: "Амбулаторно",
};

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ColumnDef {
  id: string;
  label: string;
  value: (r: ServiceRow) => string;
  align?: "right";
}

export default function FinanceServicesTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["finance-services-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select(`
          visit_service_id, report_date, revenue,
          service_name, service_group_name, op_ip, payment_status,
          patient_number, patient_full_name, patient_dob,
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

  const columns: ColumnDef[] = useMemo(() => [
    { id: "status", label: "Состояние", value: (r) => STATUS_LABELS[r.payment_status] || r.payment_status },
    { id: "hosp_number", label: "№ истории", value: (r) => r.hospitalization_number || "" },
    { id: "patient_number", label: "ID пациента", value: (r) => r.patient_number || "" },
    { id: "patient_name", label: "Пациент", value: (r) => r.patient_full_name || "" },
    { id: "dob", label: "Дата рождения", value: (r) => (r.patient_dob ? format(new Date(r.patient_dob), "dd.MM.yyyy") : "") },
    { id: "date", label: "Дата", value: (r) => (r.report_date ? format(new Date(r.report_date), "dd.MM.yyyy HH:mm") : "") },
    { id: "group", label: "Группа", value: (r) => r.service_group_name || "" },
    { id: "service", label: "Услуга", value: (r) => r.service_name || "" },
    { id: "referred_by", label: "Направил", value: (r) => r.referred_by_name || "" },
    { id: "rendered_by", label: "Исполнитель", value: (r) => r.rendered_by_name || "" },
    { id: "op_ip", label: "IP/OP", value: (r) => OP_IP_LABELS[r.op_ip] || r.op_ip },
    { id: "price", label: "Цена", value: (r) => fmt(r.revenue), align: "right" },
    { id: "sum", label: "Сумма", value: (r) => fmt(r.revenue), align: "right" },
    { id: "invoice_number", label: "№ счета", value: (r) => r.invoice_number || "" },
  ], []);

  const optionsByColumn = useMemo(() => {
    const map: Record<string, string[]> = {};
    columns.forEach((col) => {
      const set = new Set<string>();
      items.forEach((r) => set.add(col.value(r)));
      map[col.id] = Array.from(set).sort((a, b) => a.localeCompare(b));
    });
    return map;
  }, [columns, items]);

  const filteredRows = useMemo(() => {
    return items.filter((r) =>
      columns.every((col) => {
        const activeFilter = filters[col.id];
        if (!activeFilter) return true;
        return activeFilter.has(col.value(r));
      }),
    );
  }, [items, columns, filters]);

  return (
    <div className="mt-4 rounded-md border bg-card overflow-x-auto">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No services in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.id} className={cn(col.align === "right" && "text-right")}>
                  <div className={cn("flex items-center", col.align === "right" && "justify-end")}>
                    <span>{col.label}</span>
                    <ColumnFilterDropdown
                      options={optionsByColumn[col.id] || []}
                      selected={filters[col.id] ?? null}
                      onChange={(next) => setFilters((prev) => ({ ...prev, [col.id]: next }))}
                    />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-sm text-muted-foreground py-6">
                  No rows match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={r.visit_service_id}>
                  {columns.map((col) => (
                    <TableCell key={col.id} className={cn(col.align === "right" && "text-right")}>
                      {col.id === "status" ? (
                        <span
                          className={cn("inline-block w-2.5 h-2.5 rounded-full", STATUS_DOT[r.payment_status])}
                          title={STATUS_LABELS[r.payment_status]}
                        />
                      ) : (
                        col.value(r)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
