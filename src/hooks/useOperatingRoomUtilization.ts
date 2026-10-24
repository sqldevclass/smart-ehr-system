import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRoomOptions } from "@/hooks/useRoomOptions";
import { ROOM_FIELD_CONFIG } from "@/lib/roomFields";
import { OPERATION_PROTOCOL_DOC_TYPE_ID } from "@/lib/documentTypeIds";
import {
  buildRoomUtilization,
  SURG_START_DATETIME_FIELD_ID,
  SURG_END_DATETIME_FIELD_ID,
  SURG_OPERATING_BLOCK_FIELD_ID,
  type RoomUtilizationResult,
  type UtilizationOperation,
} from "@/lib/operatingRoomUtilization";

const PAGE_SIZE = 1000;
const ID_CHUNK = 200;

interface OperationDocRow {
  id: string;
  start: { value: string | null } | { value: string | null }[] | null;
  fields: { field_definition_id: string; value: string | null }[] | null;
}

// Primary approach: one paged query on patient_documents with an aliased
// double embed of patient_document_field_values (start value filtered in
// range via !inner, end/room values alongside).
async function fetchOperationsSingleQuery(
  hospitalId: string,
  fromKey: string,
  toKey: string
): Promise<UtilizationOperation[]> {
  const all: OperationDocRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("patient_documents")
      .select(
        "id, start:patient_document_field_values!inner(value), fields:patient_document_field_values(field_definition_id, value)"
      )
      .eq("hospital_id", hospitalId)
      .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
      .eq("status", "completed")
      .eq("start.field_definition_id", SURG_START_DATETIME_FIELD_ID)
      .gte("start.value", `${fromKey}T00:00`)
      .lte("start.value", `${toKey}T23:59`)
      .in("fields.field_definition_id", [SURG_END_DATETIME_FIELD_ID, SURG_OPERATING_BLOCK_FIELD_ID])
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as unknown as OperationDocRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all.map(mapDocRow);
}

function mapDocRow(d: OperationDocRow): UtilizationOperation {
  const start = Array.isArray(d.start) ? d.start[0] : d.start;
  const fields = d.fields ?? [];
  return {
    documentId: d.id,
    startLocal: start?.value ?? null,
    endLocal: fields.find((f) => f.field_definition_id === SURG_END_DATETIME_FIELD_ID)?.value ?? null,
    roomValue: fields.find((f) => f.field_definition_id === SURG_OPERATING_BLOCK_FIELD_ID)?.value ?? null,
  };
}

// Fallback when PostgREST rejects the aliased double embed: start values in
// range with !inner on patient_documents, then the other fields for those
// document ids in chunks.
async function fetchOperationsTwoQueries(
  hospitalId: string,
  fromKey: string,
  toKey: string
): Promise<UtilizationOperation[]> {
  const starts: { value: string | null; doc: { id: string } | { id: string }[] | null }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("patient_document_field_values")
      .select("value, doc:patient_documents!inner(id)")
      .eq("hospital_id", hospitalId)
      .eq("field_definition_id", SURG_START_DATETIME_FIELD_ID)
      .gte("value", `${fromKey}T00:00`)
      .lte("value", `${toKey}T23:59`)
      .eq("doc.document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
      .eq("doc.status", "completed")
      .order("value")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as unknown as typeof starts;
    starts.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const docIds = starts
    .map((s) => (Array.isArray(s.doc) ? s.doc[0]?.id : s.doc?.id))
    .filter((id): id is string => !!id);
  const startByDoc = new Map<string, string | null>();
  starts.forEach((s) => {
    const id = Array.isArray(s.doc) ? s.doc[0]?.id : s.doc?.id;
    if (id) startByDoc.set(id, s.value);
  });

  const otherByDoc = new Map<string, { endLocal: string | null; roomValue: string | null }>();
  for (let i = 0; i < docIds.length; i += ID_CHUNK) {
    const chunk = docIds.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from("patient_document_field_values")
      .select("patient_document_id, field_definition_id, value")
      .eq("hospital_id", hospitalId)
      .in("patient_document_id", chunk)
      .in("field_definition_id", [SURG_END_DATETIME_FIELD_ID, SURG_OPERATING_BLOCK_FIELD_ID]);
    if (error) throw error;
    for (const row of data || []) {
      const entry = otherByDoc.get(row.patient_document_id) ?? { endLocal: null, roomValue: null };
      if (row.field_definition_id === SURG_END_DATETIME_FIELD_ID) entry.endLocal = row.value;
      if (row.field_definition_id === SURG_OPERATING_BLOCK_FIELD_ID) entry.roomValue = row.value;
      otherByDoc.set(row.patient_document_id, entry);
    }
  }

  return docIds.map((id) => ({
    documentId: id,
    startLocal: startByDoc.get(id) ?? null,
    endLocal: otherByDoc.get(id)?.endLocal ?? null,
    roomValue: otherByDoc.get(id)?.roomValue ?? null,
  }));
}

export function useOperatingRoomUtilization(from: string, to: string) {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId;
  const fromKey = format(new Date(from), "yyyy-MM-dd");
  const toKey = format(new Date(to), "yyyy-MM-dd");

  const roomsQuery = useRoomOptions(ROOM_FIELD_CONFIG["surg.operating_block"]);

  const opsQuery = useQuery({
    queryKey: ["or-utilization-operations", hospitalId, fromKey, toKey],
    enabled: !!hospitalId,
    queryFn: async () => {
      try {
        return await fetchOperationsSingleQuery(hospitalId!, fromKey, toKey);
      } catch {
        return await fetchOperationsTwoQueries(hospitalId!, fromKey, toKey);
      }
    },
  });

  const result: RoomUtilizationResult | null = useMemo(() => {
    if (!roomsQuery.data || !opsQuery.data) return null;
    return buildRoomUtilization({
      rooms: roomsQuery.data,
      operations: opsQuery.data,
      fromKey,
      toKey,
    });
  }, [roomsQuery.data, opsQuery.data, fromKey, toKey]);

  return {
    result,
    isLoading: roomsQuery.isLoading || opsQuery.isLoading,
    error: (roomsQuery.error ?? opsQuery.error) as Error | null,
  };
}
