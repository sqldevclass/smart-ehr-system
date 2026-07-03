import { useState, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";


const ORDER_TYPE_LABELS: Record<string, string> = {
  diet: "Диета",
  activity_mode: "Режим активности",
  care: "Уход",
};

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  patientName: string;
  onClose: () => void;
}

type Mode = "current" | "history";

function Toggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded border overflow-hidden text-xs">
      {(["current", "history"] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "px-2 py-0.5",
            mode === m ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted"
          )}
        >
          {m === "current" ? "Текущая" : "История"}
        </button>
      ))}
    </div>
  );
}

function ServiceColumn({
  title,
  typeCode,
  hospitalizationId,
  patientId,
  hospitalId,
}: {
  title: string;
  typeCode: "laboratory" | "consultation";
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}) {
  const [mode, setMode] = useState<Mode>("current");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["care-plan-services", typeCode, patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select(`
          id, created_at, hospitalization_id,
          services!inner(name, service_type_id, service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId);
      if (error) throw error;
      return (data || []).filter(
        (r: any) => r.services?.service_types?.code === typeCode
      );
    },
  });

  const { current, history } = useMemo(() => {
    const cur: any[] = [];
    const hist: any[] = [];
    for (const r of rows as any[]) {
      if (r.hospitalization_id === hospitalizationId) cur.push(r);
      else hist.push(r);
    }
    return { current: cur, history: hist };
  }, [rows, hospitalizationId]);

  const list = mode === "current" ? current : history;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{title}</div>
        <Toggle mode={mode} onChange={setMode} />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : list.length === 0 ? (
          <div className="text-xs text-muted-foreground">Нет записей</div>
        ) : (
          list.map((r: any) => (
            <div key={r.id} className="border rounded p-1.5 text-xs space-y-0.5">
              <div className="font-medium leading-snug">{r.services?.name}</div>
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-muted">
                  {r.service_statuses?.name_ru}
                </span>
                <span>
                  {r.created_at ? format(new Date(r.created_at), "dd.MM.yy HH:mm") : "—"}
                </span>
                {mode === "history" && r.hospitalization_id === null && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    Амб.
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CareColumn({
  hospitalizationId,
  patientId,
  hospitalId,
}: {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}) {
  const [mode, setMode] = useState<Mode>("current");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["care-plan-orders", patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value, ordered_at, is_active,
          hospitalization_id,
          profiles!ordered_by(full_name),
          hospitalizations!inner(patient_id)
        `)
        .eq("hospital_id", hospitalId)
        .eq("hospitalizations.patient_id", patientId)
        .order("ordered_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { current, history } = useMemo(() => {
    const cur: any[] = [];
    const hist: any[] = [];
    for (const r of rows as any[]) {
      if (r.hospitalization_id === hospitalizationId) cur.push(r);
      else hist.push(r);
    }
    return { current: cur, history: hist };
  }, [rows, hospitalizationId]);

  const list = mode === "current" ? current : history;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Уход</div>
        <Toggle mode={mode} onChange={setMode} />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Загрузка…</div>
        ) : list.length === 0 ? (
          <div className="text-xs text-muted-foreground">Нет записей</div>
        ) : (
          list.map((r: any) => (
            <div key={r.id} className="border rounded p-1.5 text-xs space-y-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-muted text-[11px]">
                  {ORDER_TYPE_LABELS[r.order_type] || r.order_type}
                </span>
                {!r.is_active && (
                  <span className="px-1.5 py-0.5 rounded bg-muted text-[11px] text-muted-foreground">
                    Отменено
                  </span>
                )}
              </div>
              <div className="leading-snug">{r.order_value}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.ordered_at ? format(new Date(r.ordered_at), "dd.MM.yy HH:mm") : "—"}
                {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TreatmentCarePlanModal({
  hospitalizationId,
  patientId,
  hospitalId,
  patientName,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg flex flex-col"
        style={{ width: "calc(100vw - 32px)", height: "calc(100vh - 32px)" }}
      >
        <div className="flex items-center gap-4 p-4 border-b">
          <div className="flex-1">
            <div className="text-lg font-semibold">План лечения и ухода</div>
            <div className="text-sm text-muted-foreground">{patientName}</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-full md:divide-x">
            <div className="md:pr-4 h-full min-h-0 flex flex-col">
              <ServiceColumn
                title="Лаборатория"
                typeCode="laboratory"
                hospitalizationId={hospitalizationId}
                patientId={patientId}
                hospitalId={hospitalId}
              />
            </div>
            <div className="md:px-4 h-full min-h-0 flex flex-col">
              <div className="text-sm font-semibold mb-2">
                Инструментальные исследования
              </div>
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Инструментальные — в разработке
              </div>
            </div>
            <div className="md:px-4 h-full min-h-0 flex flex-col">
              <ServiceColumn
                title="Консультации"
                typeCode="consultation"
                hospitalizationId={hospitalizationId}
                patientId={patientId}
                hospitalId={hospitalId}
              />
            </div>
            <div className="md:pl-4 h-full min-h-0 flex flex-col">
              <CareColumn
                hospitalizationId={hospitalizationId}
                patientId={patientId}
                hospitalId={hospitalId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
