import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import DailyReportDepartmentChart from "@/components/reports/DailyReportDepartmentChart";

interface ServiceItem {
  department_id: string | null;
  bucket: "outpatient" | "inpatient" | "operating_room";
  cost_at_time: number;
}

const fmt = (n: number) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DailyReportByDepartmentTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: departments = [] } = useQuery({
    queryKey: ["departments-lookup", user?.hospitalId],
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

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["daily-report-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("daily_report_service_items")
        .select("department_id, bucket, cost_at_time")
        .eq("hospital_id", user.hospitalId)
        .gte("completed_at", from)
        .lte("completed_at", to);
      if (error) throw error;
      return (data || []) as unknown as ServiceItem[];
    },
    enabled: !!user,
  });

  const deptNames = new Map(departments.map((d: any) => [d.id, d.name]));
  const deptIds = Array.from(new Set([...departments.map((d: any) => d.id), ...items.map((i) => i.department_id ?? "none")]));

  const rows = deptIds
    .map((deptId) => {
      const deptItems = items.filter((i) => (i.department_id ?? "none") === deptId);
      const sumFor = (bucket: string) =>
        deptItems.filter((i) => i.bucket === bucket).reduce((sum, i) => sum + Number(i.cost_at_time || 0), 0);
      const outpatient = sumFor("outpatient");
      const inpatient = sumFor("inpatient");
      const operatingRoom = sumFor("operating_room");
      return {
        name: deptId === "none" ? "Unassigned" : deptNames.get(deptId) ?? "Unknown",
        outpatient,
        inpatient,
        operatingRoom,
        total: outpatient + inpatient + operatingRoom,
        count: deptItems.length,
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.total - a.total);

  const grandTotal = rows.reduce(
    (acc, r) => ({
      outpatient: acc.outpatient + r.outpatient,
      inpatient: acc.inpatient + r.inpatient,
      operatingRoom: acc.operatingRoom + r.operatingRoom,
      total: acc.total + r.total,
    }),
    { outpatient: 0, inpatient: 0, operatingRoom: 0, total: 0 },
  );

  return (
    <div className="mt-4 rounded-md border bg-card">
      {isLoading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No completed services in this period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Outpatient</TableHead>
              <TableHead className="text-right">Inpatient</TableHead>
              <TableHead className="text-right">Operating Room</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{fmt(r.outpatient)}</TableCell>
                <TableCell className="text-right">{fmt(r.inpatient)}</TableCell>
                <TableCell className="text-right">{fmt(r.operatingRoom)}</TableCell>
                <TableCell className="text-right">{fmt(r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">{fmt(grandTotal.outpatient)}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(grandTotal.inpatient)}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(grandTotal.operatingRoom)}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(grandTotal.total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
