import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";

const ORDER_TYPE_LABELS: Record<string, string> = {
  diet: "Диета",
  activity_mode: "Режим активности",
  care: "Уход",
};

const SURGICAL_CONTEXT_LABELS: Record<string, string> = {
  none: "Без операции",
  pre_op: "До операции",
  post_op: "После операции",
};

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  readOnly?: boolean;
}

export default function CareTab({
  hospitalizationId, hospitalId, userId, readOnly,
}: Props) {
  const queryClient = useQueryClient();
  const [careType, setCareType] = useState<"diet" | "activity_mode" | "care">("care");
  const [careText, setCareText] = useState("");
  const [surgicalContext, setSurgicalContext] =
    useState<"none" | "pre_op" | "post_op" | null>(null);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [dailyTime, setDailyTime] = useState("");

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["care-orders", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value, surgical_context,
          ordered_at, is_active,
          profiles!ordered_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("ordered_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospitalizationId && !!hospitalId,
  });

  const careOrderIds = (orders as any[])
    .filter((o) => o.order_type === "care")
    .map((o) => o.id);

  const { data: occurrences = [], refetch: refetchOccurrences } = useQuery({
    queryKey: ["care-order-occurrences", hospitalizationId, careOrderIds.join(",")],
    queryFn: async () => {
      if (careOrderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("hospitalization_order_occurrences")
        .select(`
          id, order_id, scheduled_at, status, completed_at,
          cancelled_at, cancelled_by,
          profiles!completed_by(full_name)
        `)
        .in("order_id", careOrderIds)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: careOrderIds.length > 0,
  });

  const occurrencesByOrder: Record<string, any[]> = {};
  for (const occ of occurrences as any[]) {
    (occurrencesByOrder[occ.order_id] ||= []).push(occ);
  }

  const rangeValid = !!rangeStart && !!rangeEnd && rangeEnd >= rangeStart;

  const canSave =
    careType === "care"
      ? !!careText.trim() &&
        surgicalContext !== null &&
        rangeValid &&
        !!dailyTime
      : !!careText.trim();

  const buildOccurrences = (start: string, end: string, time: string) => {
    const [hh, mm] = time.split(":").map(Number);
    const dates: string[] = [];
    const cursor = new Date(start);
    const last = new Date(end);
    while (cursor <= last) {
      const d = new Date(cursor);
      d.setHours(hh, mm, 0, 0);
      dates.push(d.toISOString());
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const handleAddOrder = async () => {
    if (!careText.trim()) return;

    if (careType === "care") {
      if (surgicalContext === null || !rangeValid || !dailyTime) return;

      const { data: newOrder, error } = await supabase
        .from("hospitalization_orders")
        .insert({
          hospitalization_id: hospitalizationId,
          hospital_id: hospitalId,
          order_type: careType,
          order_value: careText.trim(),
          ordered_by: userId,
          surgical_context: surgicalContext,
        })
        .select()
        .single();
      if (error || !newOrder) {
        toast.error(error?.message || "Не удалось создать назначение");
        return;
      }

      const occurrenceTimes = buildOccurrences(rangeStart, rangeEnd, dailyTime);
      const { error: occErr } = await supabase
        .from("hospitalization_order_occurrences")
        .insert(
          occurrenceTimes.map((scheduled_at) => ({
            hospital_id: hospitalId,
            hospitalization_id: hospitalizationId,
            order_id: newOrder.id,
            scheduled_at,
          }))
        );
      if (occErr) {
        toast.error(occErr.message);
        return;
      }

      setCareText("");
      setSurgicalContext(null);
      setRangeStart("");
      setRangeEnd("");
      setDailyTime("");
      refetchOrders();
      refetchOccurrences();
      queryClient.invalidateQueries({ queryKey: ["care-orders"] });
      queryClient.invalidateQueries({ queryKey: ["care-order-occurrences"] });
      return;
    }


    const { error } = await supabase
      .from("hospitalization_orders")
      .insert({
        hospitalization_id: hospitalizationId,
        hospital_id: hospitalId,
        order_type: careType,
        order_value: careText.trim(),
        ordered_by: userId,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCareText("");
    refetchOrders();
    queryClient.invalidateQueries({ queryKey: ["care-orders"] });
  };

  const handleCancelOrder = async (id: string) => {
    const { error } = await supabase
      .from("hospitalization_orders")
      .update({
        is_active: false,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetchOrders();
    queryClient.invalidateQueries({ queryKey: ["care-orders"] });
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">Назначения по уходу</h3>

      {!readOnly && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <Select value={careType} onValueChange={(v: any) => setCareType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="care">Уход</SelectItem>
              <SelectItem value="diet">Диета</SelectItem>
              <SelectItem value="activity_mode">Режим активности</SelectItem>
            </SelectContent>
          </Select>
          <textarea
            value={careText}
            onChange={(e) => setCareText(e.target.value)}
            placeholder="Введите назначение..."
            className="w-full text-sm border rounded px-2 py-1 resize-none"
            rows={3}
          />

          {careType === "care" && (
            <>
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Хирургический контекст
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(["none", "pre_op", "post_op"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSurgicalContext(v)}
                      className={`text-xs px-2.5 py-1 rounded border ${
                        surgicalContext === v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      {SURGICAL_CONTEXT_LABELS[v]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">
                  Расписание
                </div>
                <div className="flex gap-2 items-end flex-wrap">
                  <label className="flex flex-col text-xs gap-0.5">
                    <span className="text-muted-foreground">С</span>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col text-xs gap-0.5">
                    <span className="text-muted-foreground">По</span>
                    <input
                      type="date"
                      value={rangeEnd}
                      min={rangeStart || undefined}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    />
                  </label>
                  <label className="flex flex-col text-xs gap-0.5">
                    <span className="text-muted-foreground">Время</span>
                    <input
                      type="time"
                      value={dailyTime}
                      onChange={(e) => setDailyTime(e.target.value)}
                      className="text-sm border rounded px-2 py-1"
                    />
                  </label>
                </div>
                {rangeStart && rangeEnd && rangeEnd < rangeStart && (
                  <div className="text-xs text-destructive">
                    Дата окончания должна быть не раньше начала
                  </div>
                )}
              </div>
            </>
          )}


          <div className="flex gap-2">
            <Button size="sm" disabled={!canSave} onClick={handleAddOrder}>
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Назначений нет</p>
      ) : orders.map((o: any) => (
        <div key={o.id} className="border rounded p-3 space-y-1 group">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {ORDER_TYPE_LABELS[o.order_type as keyof typeof ORDER_TYPE_LABELS] ?? o.order_type}
                {o.order_type === "care" && o.surgical_context && (
                  <span className="ml-2 normal-case tracking-normal">
                    · {SURGICAL_CONTEXT_LABELS[o.surgical_context] ?? o.surgical_context}
                  </span>
                )}
              </span>
              <p className="text-sm mt-0.5">{o.order_value}</p>
            </div>
            <button
              onClick={() => handleCancelOrder(o.id)}
              className="text-muted-foreground hover:text-destructive text-xs opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
            >
              Отменить
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {o.profiles?.full_name} · {format(new Date(o.ordered_at), "dd.MM.yyyy HH:mm")}
          </div>

          {o.order_type === "care" && (occurrencesByOrder[o.id]?.length ?? 0) > 0 && (
            <div className="mt-2 pt-2 border-t space-y-1">
              {occurrencesByOrder[o.id].map((occ) => (
                <div
                  key={occ.id}
                  className="flex items-center justify-between text-xs"
                >
                  <span>
                    {format(new Date(occ.scheduled_at), "dd.MM.yyyy HH:mm")}
                  </span>
                  <span className="text-muted-foreground">
                    {occ.status === "done"
                      ? `выполнено${
                          occ.completed_at
                            ? " " + format(new Date(occ.completed_at), "dd.MM.yyyy HH:mm")
                            : ""
                        }${occ.profiles?.full_name ? " · " + occ.profiles.full_name : ""}`
                      : "ожидает"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
