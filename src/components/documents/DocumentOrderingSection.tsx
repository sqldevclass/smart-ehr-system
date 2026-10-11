import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import ServiceTab from "@/components/inpatient/ServiceTab";
import CareTab from "@/components/inpatient/CareTab";

type OrderButtonKey = "instrumental" | "laboratory" | "consultation" | "care";

const BUTTONS: { key: OrderButtonKey; label: string }[] = [
  { key: "instrumental", label: "Инструментальные" },
  { key: "laboratory", label: "Лаборатория" },
  { key: "consultation", label: "Консультации" },
  { key: "care", label: "Уход" },
];

interface Props {
  documentId: string | null;
  ensureDocumentId: () => Promise<string | null>;
  hospitalizationId?: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  isReadOnly: boolean;
}

// Inline ordering, embedded in a document's План лечения tab (currently
// primary_physician_exam only). Reuses the same ordering components as the
// general Инструментальные/Лаборатория/Консультация/Уход tabs, but tags
// each order with this document's id (source_document_id) so this list
// shows only what was ordered from here -- orders placed from the general
// tabs never show up here, while orders placed here still show in the
// general tabs too (those are unfiltered).
export default function DocumentOrderingSection({
  documentId, ensureDocumentId, hospitalizationId, patientId, hospitalId, userId, isReadOnly,
}: Props) {
  const queryClient = useQueryClient();
  const [openPanel, setOpenPanel] = useState<OrderButtonKey | null>(null);
  const [resolvedDocId, setResolvedDocId] = useState<string | null>(null);
  const effectiveDocId = documentId ?? resolvedDocId;

  const { data: orderedServices = [] } = useQuery({
    queryKey: ["doc-ordered-services", effectiveDocId],
    enabled: !!effectiveDocId,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select("id, created_at, services!inner(name, service_types!inner(code))")
        .eq("source_document_id", effectiveDocId!)
        .order("created_at");
      return data || [];
    },
  });

  const { data: orderedCare = [] } = useQuery({
    queryKey: ["doc-ordered-care", effectiveDocId],
    enabled: !!effectiveDocId,
    queryFn: async () => {
      const { data } = await supabase
        .from("hospitalization_orders")
        .select("id, ordered_at, order_value")
        .eq("source_document_id", effectiveDocId!)
        .eq("order_type", "care")
        .eq("is_active", true)
        .order("ordered_at");
      return data || [];
    },
  });

  const grouped: Record<OrderButtonKey, { id: string; name: string; date: string }[]> = {
    instrumental: [], laboratory: [], consultation: [], care: [],
  };
  (orderedServices as any[]).forEach((vs) => {
    const code = vs.services?.service_types?.code as OrderButtonKey | undefined;
    if (code && grouped[code]) {
      grouped[code].push({ id: vs.id, name: vs.services?.name, date: vs.created_at });
    }
  });
  (orderedCare as any[]).forEach((o) => {
    grouped.care.push({ id: o.id, name: o.order_value, date: o.ordered_at });
  });

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ["doc-ordered-services", effectiveDocId] });
    queryClient.invalidateQueries({ queryKey: ["doc-ordered-care", effectiveDocId] });
  };

  const handleToggle = async (key: OrderButtonKey) => {
    if (openPanel === key) {
      setOpenPanel(null);
      return;
    }
    if (!effectiveDocId) {
      const id = await ensureDocumentId();
      setResolvedDocId(id);
    }
    setOpenPanel(key);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-heading text-base font-semibold">Назначения из документа</h3>

      {BUTTONS.map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <Button
            type="button"
            variant={openPanel === key ? "secondary" : "outline"}
            size="sm"
            disabled={isReadOnly}
            onClick={() => handleToggle(key)}
          >
            {label}
          </Button>

          {grouped[key].length > 0 && (
            <ul className="text-sm space-y-1 pl-1">
              {grouped[key].map((item) => (
                <li key={item.id} className="flex items-center justify-between border-b py-1">
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(item.date), "dd.MM.yyyy HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {openPanel === key && !isReadOnly && effectiveDocId && (
            <div className="border rounded-md">
              {key === "care" ? (
                <CareTab
                  hospitalizationId={hospitalizationId ?? ""}
                  patientId={patientId}
                  hospitalId={hospitalId}
                  userId={userId}
                  lockedType="care"
                  sourceDocumentId={effectiveDocId}
                  onOrderPlaced={refreshLists}
                />
              ) : (
                <ServiceTab
                  hospitalizationId={hospitalizationId ?? ""}
                  patientId={patientId}
                  hospitalId={hospitalId}
                  userId={userId}
                  typeCode={key}
                  title={label}
                  sourceDocumentId={effectiveDocId}
                  onOrderPlaced={refreshLists}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
