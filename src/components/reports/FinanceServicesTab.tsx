import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import ColumnFilterDropdown from "@/components/reports/ColumnFilterDropdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Columns3, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
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
  patient_full_name: string | null;
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

interface ColumnDef {
  id: string;
  label: string;
  value: (r: ServiceRow) => string;
  align?: "right";
}

interface Props {
  period: PeriodState;
  onPeriodChange: (s: PeriodState) => void;
}

export default function FinanceServicesTab({ period, onPeriodChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { from, to } = getDateBounds(period);
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const { data: savedPrefs } = useQuery({
    queryKey: ["user-view-preferences", VIEW_KEY, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_view_preferences")
        .select("preferences")
        .eq("user_id", user.id)
        .eq("view_key", VIEW_KEY)
        .maybeSingle();
      if (error) throw error;
      return data?.preferences as { visible_columns?: string[] } | null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (prefsLoaded) return;
    if (savedPrefs === undefined) return;
    if (savedPrefs?.visible_columns) {
      const visible = new Set(savedPrefs.visible_columns);
      setHiddenColumns(new Set(columns.map((c) => c.id).filter((id) => !visible.has(id))));
    }
    setPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPrefs]);

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
    { id: "service_status", label: "Состояние", value: (r) => r.service_status_name || r.service_status_code || "" },
    { id: "payment_status", label: "Оплата", value: (r) => PAYMENT_LABELS[r.payment_status] || r.payment_status },
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

  const visibleColumnList = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.id)),
    [columns, hiddenColumns],
  );

  const hasActiveFilters = Object.values(filters).some((f) => f !== null && f !== undefined);

  const resetFilters = () => setFilters({});

  const toggleColumn = (id: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveAsDefault = async () => {
    if (!user) return;
    const visible_columns = columns.map((c) => c.id).filter((id) => !hiddenColumns.has(id));
    const { error } = await supabase
      .from("user_view_preferences")
      .upsert(
        { user_id: user.id, hospital_id: user.hospitalId, view_key: VIEW_KEY, preferences: { visible_columns } },
        { onConflict: "user_id,view_key" },
      );
    if (error) {
      toast.error("Не удалось сохранить вид по умолчанию.");
      return;
    }
    toast.success("Сохранено как вид по умолчанию.");
    queryClient.invalidateQueries({ queryKey: ["user-view-preferences", VIEW_KEY, user.id] });
  };

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
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold text-foreground">Finance</h1>
        <span className="text-sm font-medium text-muted-foreground bg-muted px-2 py-1 rounded">Услуги</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          disabled={!hasActiveFilters}
          onClick={resetFilters}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Сбросить фильтры
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Columns3 className="h-3.5 w-3.5" />
              Столбцы
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {columns.map((col) => (
                <label
                  key={col.id}
                  className="flex items-center gap-2 text-xs cursor-pointer px-1 py-1 rounded hover:bg-muted"
                >
                  <Checkbox
                    checked={!hiddenColumns.has(col.id)}
                    onCheckedChange={() => toggleColumn(col.id)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
            <div className="border-t mt-2 pt-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline px-1"
                onClick={saveAsDefault}
              >
                <Save className="h-3.5 w-3.5" />
                Сохранить как вид по умолчанию
              </button>
            </div>
          </PopoverContent>
        </Popover>

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
      </div>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No services in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumnList.map((col) => (
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
                <TableCell colSpan={visibleColumnList.length} className="text-center text-sm text-muted-foreground py-6">
                  No rows match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((r) => (
                <TableRow key={r.visit_service_id}>
                  {visibleColumnList.map((col) => (
                    <TableCell key={col.id} className={cn(col.align === "right" && "text-right")}>
                      {col.id === "service_status" ? (
                        <span
                          className={cn("inline-block w-2.5 h-2.5 rounded-full", SERVICE_STATUS_DOT[r.service_status_code ?? ""] || "bg-muted-foreground")}
                          title={r.service_status_name ?? ""}
                        />
                      ) : col.id === "payment_status" ? (
                        <span
                          className={cn("inline-block w-2.5 h-2.5 rounded-full", PAYMENT_DOT[r.payment_status])}
                          title={PAYMENT_LABELS[r.payment_status]}
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
    </div>
  );
}
