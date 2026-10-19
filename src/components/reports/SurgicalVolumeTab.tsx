import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const OPERATION_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000011";
const SURG_URGENCY_FIELD_ID = "b1000000-0000-0000-0000-000000000120";
const SURG_IS_REPEAT_FIELD_ID = "b1000000-0000-0000-0000-000000000121";

export default function SurgicalVolumeTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: docs = [] } = useQuery({
    queryKey: ["surgical-volume-docs", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select("id")
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as { id: string }[];
    },
    enabled: !!user,
  });

  const docIds = useMemo(() => docs.map((d) => d.id), [docs]);

  const { data: fieldValues = [] } = useQuery({
    queryKey: ["surgical-volume-fields", user?.hospitalId, docIds.join(",")],
    queryFn: async () => {
      if (!user || docIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_document_field_values")
        .select("patient_document_id, field_definition_id, value")
        .eq("hospital_id", user.hospitalId)
        .in("field_definition_id", [SURG_URGENCY_FIELD_ID, SURG_IS_REPEAT_FIELD_ID])
        .in("patient_document_id", docIds);
      if (error) throw error;
      return (data || []) as { patient_document_id: string; field_definition_id: string; value: string | null }[];
    },
    enabled: !!user && docIds.length > 0,
  });

  const stats = useMemo(() => {
    const total = docs.length;
    let emergency = 0;
    let planned = 0;
    let repeat = 0;
    const byDoc = new Map<string, { urgency: string | null; isRepeat: boolean }>();
    fieldValues.forEach((fv) => {
      const entry = byDoc.get(fv.patient_document_id) || { urgency: null, isRepeat: false };
      if (fv.field_definition_id === SURG_URGENCY_FIELD_ID) entry.urgency = fv.value;
      if (fv.field_definition_id === SURG_IS_REPEAT_FIELD_ID) entry.isRepeat = fv.value === "true";
      byDoc.set(fv.patient_document_id, entry);
    });
    byDoc.forEach((v) => {
      if (v.urgency === "emergency") emergency += 1;
      if (v.urgency === "planned") planned += 1;
      if (v.isRepeat) repeat += 1;
    });
    return { total, emergency, planned, repeat };
  }, [docs, fieldValues]);

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Total Operations" value={stats.total} />
        <MetricTile label="Planned" value={stats.planned} />
        <MetricTile label="Emergency" value={stats.emergency} highlight={stats.emergency > 0} />
        <MetricTile label="Repeat Operations" value={stats.repeat} highlight={stats.repeat > 0} />
      </SummaryCard>
      <p className="text-xs text-muted-foreground">
        Based on Протокол операции records created in this period. Urgency/repeat is unset for a protocol until that field is filled in — unset rows aren't counted in Planned/Emergency/Repeat.
      </p>
    </div>
  );
}
