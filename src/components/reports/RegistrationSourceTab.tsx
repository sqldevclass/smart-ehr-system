import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import DailyReportSummaryChart from "@/components/reports/DailyReportSummaryChart";

const SOURCE_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google_search: "Поиск Google",
  friend_recommendation: "Рекомендация друга",
  doctor_referral: "Направление врача",
  other: "Другое",
};

export default function RegistrationSourceTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["registration-source-items", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("visits")
        .select("registration_source")
        .eq("hospital_id", user.hospitalId)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as { registration_source: string | null }[];
    },
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const byKey = new Map<string, number>();
    items.forEach((i) => {
      const key = i.registration_source || "not_specified";
      byKey.set(key, (byKey.get(key) || 0) + 1);
    });
    const total = items.length || 1;
    return Array.from(byKey.entries())
      .map(([key, count]) => ({
        key,
        name: key === "not_specified" ? "Не указано" : (SOURCE_LABELS[key] || key),
        count,
        pct: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }, [items]);

  const total = items.length;

  return (
    <div className="mt-4 space-y-6">
      {rows.length > 0 && (
        <DailyReportSummaryChart
          data={rows.map((r) => ({ name: r.name, revenue: r.count }))}
          title="Визиты по источнику привлечения"
        />
      )}

      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">За этот период визитов не зарегистрировано.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Источник</TableHead>
                <TableHead className="text-right">Визиты</TableHead>
                <TableHead className="text-right">% от общего</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{r.pct.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Итого</TableCell>
                <TableCell className="text-right font-semibold">{total}</TableCell>
                <TableCell className="text-right font-semibold">100%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </div>
  );
}
