
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "physician_monthly_columns";

interface ServiceItem {
  visit_service_id: string;
  rendered_by_name: string | null;
  rendered_by_person_id: string | null;
  rendered_by_profile_id: string | null;
  report_date: string;
  revenue: number;
  service_name: string | null;
  op_ip: "inpatient" | "outpatient";
  patient_number: string | null;
  patient_last_name: string | null;
  patient_first_name: string | null;
}

interface Row {
  key: string;
  physician: string;
  month: string;
  count: number;
  revenue: number;
  services: ServiceItem[];
}

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Group by WHO rendered the service (person, else profile), never by name text:
// two staff profiles can share a full name.
const physicianKey = (i: ServiceItem) =>
  i.rendered_by_person_id ??
  (i.rendered_by_profile_id ? `profile:${i.rendered_by_profile_id}` : `name:${i.rendered_by_name ?? ""}`);

export default function PhysicianMonthlyTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["physician-monthly-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("finance_revenue_report_items")
        .select(
          "visit_service_id, rendered_by_name, rendered_by_person_id, rendered_by_profile_id, report_date, revenue, service_name, op_ip, patient_number, patient_last_name, patient_first_name"
        )
        .eq("hospital_id", user.hospitalId)
        // Performed services only -- cancelled / pending / preliminary are not "выполненные".
        .eq("service_status_code", "completed")
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: true });
      if (error) throw error;
      return (data || []) as ServiceItem[];
    },
    enabled: !!user,
  });

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    items.forEach((i) => {
      const month = format(new Date(i.report_date), "yyyy-MM");
      const key = `${physicianKey(i)}__${month}`;
      const row =
        byKey.get(key) ||
        { key, physician: i.rendered_by_name || "Не указан", month, count: 0, revenue: 0, services: [] };
      row.count += 1;
      row.revenue += Number(i.revenue || 0);
      row.services.push(i);
      byKey.set(key, row);
    });
    return Array.from(byKey.values()).sort(
      (a, b) => a.physician.localeCompare(b.physician) || a.month.localeCompare(b.month)
    );
  }, [items]);

  const columns: ColumnDef<Row, any>[] = [
    { id: "physician", header: "Врач", accessorFn: (r) => r.physician },
    { id: "month", header: "Месяц", accessorFn: (r) => r.month },
    { id: "count", header: "Услуги", accessorFn: (r) => r.count, meta: { align: "right" } },
    { id: "revenue", header: "Доход", accessorFn: (r) => fmt(r.revenue), meta: { align: "right" } },
  ];

  const renderServices = (r: Row) => (
    <div className="px-10 py-2">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left font-medium py-1">Дата</th>
            <th className="text-left font-medium py-1">Услуга</th>
            <th className="text-left font-medium py-1">Пациент</th>
            <th className="text-left font-medium py-1">IP/OP</th>
            <th className="text-right font-medium py-1">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {r.services.map((s) => (
            <tr key={s.visit_service_id} className="border-t border-border/50">
              <td className="py-1 whitespace-nowrap">{format(new Date(s.report_date), "dd.MM.yyyy HH:mm")}</td>
              <td className="py-1">{s.service_name || "—"}</td>
              <td className="py-1 whitespace-nowrap">
                {[s.patient_last_name, s.patient_first_name].filter(Boolean).join(" ") || "—"}
                {s.patient_number && <span className="ml-1 text-muted-foreground">({s.patient_number})</span>}
              </td>
              <td className="py-1">{s.op_ip === "inpatient" ? "Стационар" : "Амбулаторно"}</td>
              <td className="py-1 text-right whitespace-nowrap">{fmt(s.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        emptyMessage="За этот период выполненных услуг нет."
        viewKey={VIEW_KEY}
        getRowId={(r) => r.key}
        getRowCanExpand={(r) => r.services.length > 0}
        renderSubRow={renderServices}
      />
    </div>
  );
}

