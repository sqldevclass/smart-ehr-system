import { useState, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import PatientModalHeader from "@/components/nurse/PatientModalHeader";
import DrawSampleDialog from "@/components/shared/DrawSampleDialog";
import EWSStatusDot from "@/components/ews/EWSStatusDot";
import { useCareOrderSchedule } from "@/hooks/useCareOrderSchedule";



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
  patient: any;
  room?: string;
  onClose: () => void;
}

function HistorySection({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-primary hover:underline"
      >
        {open ? "Скрыть историю" : `Показать историю${count ? ` (${count})` : ""}`}
      </button>
      {open && <div className="mt-2 space-y-1.5">{children}</div>}
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
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["care-plan-services", typeCode, patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select(`
          id, created_at, hospitalization_id, patient_id,
          patients(first_name, last_name, patient_number),
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

  const visitServiceIds = useMemo(() => (rows as any[]).map((r) => r.id), [rows]);

  const { data: sampleLinks = [] } = useQuery({
    queryKey: ["service-column-sample-links", typeCode, visitServiceIds],
    enabled: typeCode === "laboratory" && visitServiceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_sample_services")
        .select("sample_id, visit_service_id")
        .in("visit_service_id", visitServiceIds);
      if (error) throw error;
      return data || [];
    },
  });

  const sampleIdByVisitService = useMemo(() => {
    const map: Record<string, string> = {};
    for (const link of sampleLinks as any[]) {
      map[link.visit_service_id] = link.sample_id;
    }
    return map;
  }, [sampleLinks]);

  const { current, history } = useMemo(() => {
    const cur: any[] = [];
    const hist: any[] = [];
    for (const r of rows as any[]) {
      if (r.hospitalization_id === hospitalizationId) cur.push(r);
      else hist.push(r);
    }
    return { current: cur, history: hist };
  }, [rows, hospitalizationId]);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (sampleId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sampleId)) next.delete(sampleId);
      else next.add(sampleId);
      return next;
    });
  };

  const [drawTarget, setDrawTarget] = useState<any>(null);

  const renderRow = (r: any, isHistory: boolean) => (
    <div key={r.id} className="border rounded p-1.5 text-xs space-y-0.5">
      <div className="font-medium leading-snug">{r.services?.name}</div>
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
        {typeCode === "laboratory" && r.service_statuses?.code === "preliminary" && !isHistory ? (
          <button
            onClick={() => setDrawTarget(r)}
            className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/70 underline"
          >
            {r.service_statuses?.name_ru}
          </button>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-muted">
            {r.service_statuses?.name_ru}
          </span>
        )}
        <span>
          {r.created_at ? format(new Date(r.created_at), "dd.MM.yy HH:mm") : "—"}
        </span>
        {isHistory && r.hospitalization_id === null && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
            Амб.
          </span>
        )}
      </div>
    </div>
  );

  const renderGroupedList = (list: any[], isHistory: boolean) => {
    const shown = new Set<string>();
    return list.map((r: any) => {
      if (shown.has(r.id)) return null;
      const sampleId = typeCode === "laboratory" ? sampleIdByVisitService[r.id] : undefined;
      const group = sampleId
        ? list.filter((x: any) => sampleIdByVisitService[x.id] === sampleId)
        : [r];
      if (group.length <= 1) {
        shown.add(r.id);
        return renderRow(r, isHistory);
      }
      group.forEach((g: any) => shown.add(g.id));
      const isOpen = expandedGroups.has(sampleId!);
      return (
        <div key={sampleId}>
          <div className="relative">
            {renderRow(group[0], isHistory)}
            <button
              onClick={() => toggleGroup(sampleId!)}
              className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
            >
              {isOpen ? "▲" : `+${group.length - 1}`}
            </button>
          </div>
          {isOpen && (
            <div className="pl-2 mt-1 space-y-1.5 border-l-2 border-primary/20">
              {group.slice(1).map((g: any) => renderRow(g, isHistory))}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col min-h-0">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Загрузка…</div>
          ) : current.length === 0 ? (
            <div className="text-xs text-muted-foreground">Нет записей</div>
          ) : (
            renderGroupedList(current, false)
          )}
        </div>
        {!isLoading && history.length > 0 && (
          <HistorySection count={history.length}>
            {renderGroupedList(history, true)}
          </HistorySection>
        )}
      </div>
      <DrawSampleDialog
        open={!!drawTarget}
        onOpenChange={(open) => !open && setDrawTarget(null)}
        visitService={drawTarget}
        barcodePrefix="WARD"
        sampleStatus="drawn"
        hospitalId={hospitalId}
        onDrawn={async (visitServiceIds: string[]) => {
          const { data: readyStatus } = await supabase
            .from("service_statuses")
            .select("id")
            .eq("code", "ready_for_execution")
            .single();
          if (readyStatus) {
            await supabase
              .from("visit_services")
              .update({ status_id: readyStatus.id })
              .in("id", visitServiceIds);
          }
          queryClient.invalidateQueries({ queryKey: ["care-plan-services"] });
        }}
      />
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
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["care-plan-orders", patientId, hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value, ordered_at, is_active,
          hospitalization_id, surgical_context,
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

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { getHospitalizationStatus, getOccurrenceStatus } = useCareOrderSchedule(hospitalId);

  const { current, history } = useMemo(() => {
    const cur: any[] = [];
    const hist: any[] = [];
    for (const r of rows as any[]) {
      if (r.hospitalization_id === hospitalizationId) cur.push(r);
      else hist.push(r);
    }
    return { current: cur, history: hist };
  }, [rows, hospitalizationId]);

  const careOrderIds = useMemo(
    () => (rows as any[]).filter((r) => r.order_type === "care").map((r) => r.id),
    [rows],
  );

  const { data: occurrences = [] } = useQuery({
    queryKey: ["care-plan-occurrences", careOrderIds],
    enabled: careOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_order_occurrences")
        .select("id, order_id, scheduled_at, status, completed_at, completed_by, cancelled_at, cancelled_by, profiles!completed_by(full_name)")
        .in("order_id", careOrderIds)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const occurrencesByOrder = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const o of occurrences as any[]) {
      (map[o.order_id] ||= []).push(o);
    }
    return map;
  }, [occurrences]);

  const handleComplete = async (occurrenceId: string) => {
    const { error } = await supabase
      .from("hospitalization_order_occurrences")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: user?.id,
      })
      .eq("id", occurrenceId);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["care-plan-occurrences"] });
  };

  const renderRow = (r: any, isHistory = false) => (
    <div key={r.id} className="border rounded p-1.5 text-xs space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-muted text-[11px]">
          {ORDER_TYPE_LABELS[r.order_type] || r.order_type}
        </span>
        {r.order_type === "care" && r.surgical_context && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px]">
            {SURGICAL_CONTEXT_LABELS[r.surgical_context] || r.surgical_context}
          </span>
        )}
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
      {r.order_type === "care" && occurrencesByOrder[r.id]?.length > 0 && (
        <div className="mt-1 pt-1 border-t space-y-0.5">
          {occurrencesByOrder[r.id].map((o: any) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span>{format(new Date(o.scheduled_at), "dd.MM HH:mm")}</span>
              {o.status === "done" ? (
                <span className="text-muted-foreground truncate">
                  выполнено{" "}
                  {o.completed_at
                    ? format(new Date(o.completed_at), "dd.MM HH:mm")
                    : ""}
                  {o.profiles?.full_name ? ` · ${o.profiles.full_name}` : ""}
                </span>
              ) : o.status === "cancelled" ? (
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate">
                  Отменено
                  {o.cancelled_at ? " " + format(new Date(o.cancelled_at), "dd.MM HH:mm") : ""}
                </span>
              ) : isHistory ? (
                <span className="text-muted-foreground">ожидает</span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <EWSStatusDot status={getOccurrenceStatus(o.id)} pulse />
                  <button
                    onClick={() => handleComplete(o.id)}
                    className="text-blue-600 hover:underline"
                  >
                    Выполнить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col min-h-0">
      <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
        Уход
        <EWSStatusDot status={getHospitalizationStatus(hospitalizationId)} pulse />
      </div>
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Загрузка…</div>
          ) : current.length === 0 ? (
            <div className="text-xs text-muted-foreground">Нет записей</div>
          ) : (
            current.map((r) => renderRow(r, false))
          )}
        </div>
        {!isLoading && history.length > 0 && (
          <HistorySection count={history.length}>
            {history.map((r) => renderRow(r, true))}
          </HistorySection>
        )}
      </div>
    </div>
  );
}



export default function TreatmentCarePlanModal({
  hospitalizationId,
  patientId,
  hospitalId,
  patient,
  room,
  onClose,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg flex flex-col"
        style={{ width: "calc(100vw - 32px)", height: "calc(100vh - 32px)" }}
      >
        <PatientModalHeader
          title="План лечения и ухода"
          patient={patient}
          room={room}
          onClose={onClose}
        />
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
