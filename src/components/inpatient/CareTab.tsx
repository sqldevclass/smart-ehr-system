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

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["care-orders", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value,
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

  const handleAddOrder = async () => {
    if (!careText.trim()) return;
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
          <div className="flex gap-2">
            <Button size="sm" disabled={!careText.trim()} onClick={handleAddOrder}>
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
        </div>
      ))}
    </div>
  );
}
