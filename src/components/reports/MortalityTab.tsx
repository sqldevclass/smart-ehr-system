import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const OPERATION_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000011";

interface DischargeItem {
  id: string;
  discharge_type: string | null;
  admitted_at: string | null;
  discharged_at: string | null;
  department_id: string | null;
  departments: { name: string } | null;
}

export default function MortalityTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["mortality-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, discharge_type, admitted_at, discharged_at, department_id, departments(name)")
        .eq("hospital_id", user.hospitalId)
        .not("discharge_type", "is", null)
        .gte("discharged_at", from)
        .lte("discharged_at", to);
      if (error) throw error;
      return (data || []) as unknown as DischargeItem[];
    },
    enabled: !!user,
  });

  const deceasedIds = useMemo(
    () => items.filter((i) => i.discharge_type === "deceased").map((i) => i.id),
    [items]
  );

  const { data: deceasedWithOp = [] } = useQuery({
    queryKey: ["mortality-postop-docs", user?.hospitalId, deceasedIds.join(",")],
    queryFn: async () => {
      if (!user || deceasedIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select("hospitalization_id")
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
        .eq("status", "completed")
        .in("hospitalization_id", deceasedIds);
      if (error) throw error;
      return (data || []) as { hospitalization_id: string }[];
    },
    enabled: !!user && deceasedIds.length > 0,
  });

  const rows = useMemo(() => {
    const byDept = new Map<string, { name: string; discharged: number; deceased: number }>();
    items.forEach((i) => {
      const key = i.department_id || "none";
      const row = byDept.get(key) || { name: i.departments?.name || "Не указано", discharged: 0, deceased: 0 };
      row.discharged += 1;
      if (i.discharge_type === "deceased") row.deceased += 1;
      byDept.set(key, row);
    });
    return Array.from(byDept.values()).sort((a, b) => b.discharged - a.discharged);
  }, [items]);

  const totalDischarged = rows.reduce((s, r) => s + r.discharged, 0);
  const totalDeceased = rows.reduce((s, r) => s + r.deceased, 0);

  const within24h = useMemo(() => {
    return items.filter((i) => {
      if (i.discharge_type !== "deceased" || !i.admitted_at || !i.discharged_at) return false;
      const hours = (new Date(i.discharged_at).getTime() - new Date(i.admitted_at).getTime()) / (1000 * 60 * 60);
      return hours <= 24;
    }).length;
  }, [items]);

  const postOpDeaths = useMemo(
    () => new Set(deceasedWithOp.map((d) => d.hospitalization_id)).size,
    [deceasedWithOp]
  );

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Всего умерших" value={totalDeceased} />
        <MetricTile label="Смерти в течение 24ч после поступления" value={within24h} highlight={within24h > 0} />
        <MetricTile label="Послеоперационные смерти" value={postOpDeaths} highlight={postOpDeaths > 0} />
        <MetricTile
          label="Общая летальность"
          value={totalDischarged > 0 ? `${((totalDeceased / totalDischarged) * 100).toFixed(1)}%` : "0.0%"}
        />
      </SummaryCard>
      <p className="text-xs text-muted-foreground">
        «Послеоперационная» = смерть во время госпитализации, в ходе которой был подтверждённый протокол операции, независимо от времени.
      </p>
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">За этот период выписок нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Отделение</TableHead>
                <TableHead className="text-right">Выписано</TableHead>
                <TableHead className="text-right">Умерло</TableHead>
                <TableHead className="text-right">Летальность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.discharged}</TableCell>
                  <TableCell className="text-right">{r.deceased}</TableCell>
                  <TableCell className="text-right">
                    {((r.deceased / r.discharged) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Итого</TableCell>
                <TableCell className="text-right font-semibold">{totalDischarged}</TableCell>
                <TableCell className="text-right font-semibold">{totalDeceased}</TableCell>
                <TableCell className="text-right font-semibold">
                  {totalDischarged > 0 ? ((totalDeceased / totalDischarged) * 100).toFixed(1) : "0.0"}%
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
