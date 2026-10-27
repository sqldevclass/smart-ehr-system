import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { TableCell, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const VIEW_KEY = "cash_flow_columns";

type MovementType = "regular" | "deposit" | "settlement" | "deposit_refund";

interface CashFlowItem {
  id: string;
  hospital_id: string;
  occurred_at: string;
  movement_type: MovementType;
  amount: number | string;
  receipt_number: string | null;
  care_type: "OP" | "IP" | null;
  patient_id: string | null;
  patient_number: string | null;
  last_name: string | null;
  first_name: string | null;
  date_of_birth: string | null;
  hospitalization_number: string | null;
  invoice_number: string | null;
  payment_method_code: string | null;
  payment_method_name: string | null;
  kassa_id: string | null;
  kassa_name: string | null;
  pos_terminal_name: string | null;
  auth_code: string | null;
  staff_name: string | null;
  note: string | null;
}

const TYPE_LABELS: Record<MovementType, string> = {
  regular: "Оплата визита",
  settlement: "Оплата счёта",
  deposit: "Депозит",
  deposit_refund: "Возврат депозита",
};

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const s = (v: string | null | undefined) => v ?? "";

const negClass = (n: number) => (n < 0 ? "text-destructive" : undefined);

export default function CashInflowTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();
  const [kassaFilter, setKassaFilter] = useState("all");

  const { data: kassas = [] } = useQuery({
    queryKey: ["kassas-list", user?.hospitalId],
    enabled: !!user?.hospitalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("kassas").select("id, name")
        .eq("hospital_id", user!.hospitalId).order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["cash-flow-items", user?.hospitalId, from, to, kassaFilter],
    queryFn: async () => {
      if (!user) return [];
      let q = (supabase as any)
        .from("cash_flow_report_items")
        .select(
          "id, hospital_id, occurred_at, movement_type, amount, receipt_number, care_type, patient_id, patient_number, last_name, first_name, date_of_birth, hospitalization_number, invoice_number, payment_method_code, payment_method_name, kassa_id, kassa_name, pos_terminal_name, auth_code, staff_name, note",
        )
        .eq("hospital_id", user.hospitalId)
        .gte("occurred_at", from)
        .lte("occurred_at", to)
        .order("occurred_at", { ascending: false });
      if (kassaFilter === "none") q = q.is("kassa_id", null);
      else if (kassaFilter !== "all") q = q.eq("kassa_id", kassaFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CashFlowItem[];
    },
    enabled: !!user,
  });

  const stats = useMemo(() => {
    let inflow = 0;
    let refunds = 0;
    items.forEach((i) => {
      const a = Number(i.amount);
      if (a > 0) inflow += a;
      else if (a < 0) refunds += a;
    });
    const r = Math.abs(refunds);
    return { inflow, refunds: r, net: inflow - r };
  }, [items]);

  const columns: ColumnDef<CashFlowItem, any>[] = [
    { id: "date", header: "Дата", accessorFn: (r) => format(new Date(r.occurred_at), "dd.MM.yyyy HH:mm") },
    { id: "receipt", header: "№ квитанции", accessorFn: (r) => s(r.receipt_number) },
    { id: "type", header: "Тип операции", accessorFn: (r) => TYPE_LABELS[r.movement_type] ?? "" },
    {
      id: "op_ip",
      header: "IP/OP",
      accessorFn: (r) => (r.care_type === "IP" ? "Стационар" : r.care_type === "OP" ? "Амбулаторно" : "—"),
    },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => s(r.hospitalization_number) },
    { id: "invoice_number", header: "№ счёта", accessorFn: (r) => s(r.invoice_number) },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => s(r.patient_number) },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => s(r.last_name) },
    { id: "first_name", header: "Имя", accessorFn: (r) => s(r.first_name) },
    {
      id: "dob",
      header: "Дата рождения",
      accessorFn: (r) => (r.date_of_birth ? format(new Date(r.date_of_birth), "dd.MM.yyyy") : ""),
    },
    { id: "method", header: "Способ оплаты", accessorFn: (r) => s(r.payment_method_name) },
    { id: "kassa", header: "Касса", accessorFn: (r) => s(r.kassa_name) },
    { id: "terminal", header: "Терминал", accessorFn: (r) => s(r.pos_terminal_name) },
    { id: "auth_code", header: "Код авторизации", accessorFn: (r) => s(r.auth_code) },
    { id: "staff", header: "Кассир", accessorFn: (r) => s(r.staff_name) },
    { id: "note", header: "Основание", accessorFn: (r) => s(r.note) },
    {
      id: "amount",
      header: "Сумма",
      accessorFn: (r) => fmt(Number(r.amount)),
      cell: ({ row }) => {
        const a = Number(row.original.amount);
        return <span className={negClass(a)}>{fmt(a)}</span>;
      },
      meta: { align: "right" },
    },
  ];

  return (
    <div className="mt-4 space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="cash-flow-kassa">Касса</Label>
        <Select value={kassaFilter} onValueChange={setKassaFilter}>
          <SelectTrigger id="cash-flow-kassa" className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все кассы</SelectItem>
            {kassas.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
            <SelectItem value="none">Без кассы</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SummaryCard>
        <MetricTile label="Поступления" value={fmt(stats.inflow)} />
        <MetricTile label="Возвраты" value={fmt(stats.refunds)} />
        <MetricTile label="Итого (чистое)" value={fmt(stats.net)} />
      </SummaryCard>

      <div className="h-[65vh] min-h-0">
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          emptyMessage="За этот период движений денежных средств нет."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.id}
          renderFooter={(table) => {
            const filteredRows = table.getRowModel().rows;
            const sum = filteredRows.reduce((acc, r) => acc + Number(r.original.amount), 0);
            const totals: Record<string, React.ReactNode> = {
              type: `${filteredRows.length} операций`,
              amount: <span className={negClass(sum)}>{fmt(sum)}</span>,
            };
            return (
              <TableRow>
                <TableCell className="font-semibold">Итого</TableCell>
                {table.getVisibleLeafColumns().map((column) => (
                  <TableCell key={column.id} className="text-right font-semibold">
                    {totals[column.id] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            );
          }}
        />
      </div>
    </div>
  );
}
