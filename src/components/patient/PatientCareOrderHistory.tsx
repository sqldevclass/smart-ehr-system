import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  patientId: string;
  hospitalId: string;
}

const orderTypeLabels: Record<string, string> = {
  diet: "Диета",
  activity_mode: "Режим",
  care: "Уход",
};

export default function PatientCareOrderHistory({ patientId, hospitalId }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["patient-care-order-history", patientId],
    queryFn: async () => {
      const { data: hosps, error: hErr } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, discharged_at")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .order("admitted_at", { ascending: false });
      if (hErr) throw hErr;

      const hospIds = (hosps || []).map((h: any) => h.id);
      if (hospIds.length === 0) return [];

      const { data: orders, error } = await supabase
        .from("hospitalization_orders")
        .select(
          "id, hospitalization_id, order_type, order_value, ordered_at, is_active, cancelled_at"
        )
        .in("hospitalization_id", hospIds)
        .order("ordered_at", { ascending: false });
      if (error) throw error;

      const byHosp = new Map<string, any>();
      for (const h of hosps || []) {
        byHosp.set(h.id, {
          key: h.id,
          label: `Госпитализация № ${h.hospitalization_number}`,
          hospitalization: h,
          orders: [],
        });
      }
      for (const o of orders || []) {
        byHosp.get(o.hospitalization_id)?.orders.push(o);
      }
      return Array.from(byHosp.values()).filter((g: any) => g.orders.length > 0);
    },
    enabled: !!patientId && !!hospitalId,
  });

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Нет назначений по уходу.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g: any) => {
        const isOpen = expandedGroup === g.key;
        return (
          <div key={g.key} className="border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedGroup(isOpen ? null : g.key)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-medium">{g.label}</span>
                {g.hospitalization?.admitted_at && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(g.hospitalization.admitted_at), "dd.MM.yyyy")}
                    {g.hospitalization?.discharged_at &&
                      ` – ${format(new Date(g.hospitalization.discharged_at), "dd.MM.yyyy")}`}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {isOpen ? "▲" : "▼"}
              </span>
            </button>
            {isOpen && (
              <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
                {g.orders.map((o: any) => (
                  <div
                    key={o.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm"
                  >
                    <div>
                      <span className="font-medium text-foreground">
                        {orderTypeLabels[o.order_type] ?? o.order_type}
                      </span>
                      <span className="text-foreground"> — {o.order_value}</span>
                      {!o.is_active && (
                        <span className="ml-2 text-xs text-red-600">Отменено</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {o.ordered_at ? format(new Date(o.ordered_at), "dd.MM.yyyy") : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
