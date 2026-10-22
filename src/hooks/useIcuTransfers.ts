import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import {
  buildIcuTransfers, ICU_DEPARTMENT_CODE, OPERATION_PROTOCOL_DOC_TYPE_ID,
  POSTOP_DESTINATION_FIELD_ID, SURG_END_DATETIME_FIELD_ID, TRANSFER_SUMMARY_DOC_TYPE_ID,
  type DeptStay, type ProtocolInfo, type TransferDoc,
} from "@/lib/icuTransfers";

interface RawStay {
  hospitalization_id: string;
  department_id: string;
  entered_at: string;
  left_at: string | null;
  departments: { name: string } | null;
  hospitalizations: {
    hospitalization_number: string | null;
    patients: { first_name: string; last_name: string; patient_number: string | null } | null;
  } | null;
}
interface RawProtocol {
  hospitalization_id: string;
  created_at: string;
  patient_document_field_values: { field_definition_id: string; value: unknown }[];
}

export function useIcuTransfers(from: string, to: string) {
  const { user } = useAuth();
  const tz = useHospitalTimezone();
  const hospitalId = user?.hospitalId;
  const departments = useQuery({
    queryKey: ["icu-transfer-departments", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      if (!hospitalId) return [];
      const { data, error } = await supabase.from("departments").select("id, code").eq("hospital_id", hospitalId);
      if (error) throw error;
      return data as { id: string; code: string | null }[];
    },
  });
  const icuId = departments.data?.find((d) => d.code?.toLowerCase() === ICU_DEPARTMENT_CODE)?.id;
  const candidates = useQuery({
    queryKey: ["icu-transfer-hospitalizations", hospitalId, icuId, from, to],
    enabled: !!hospitalId && !!icuId,
    queryFn: async () => {
      if (!hospitalId || !icuId) return [];
      const { data, error } = await supabase.from("hospitalization_department_history")
        .select("hospitalization_id").eq("hospital_id", hospitalId).eq("department_id", icuId)
        .gte("entered_at", from).lte("entered_at", to);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => String(r.hospitalization_id)))].sort();
    },
  });
  const ids = candidates.data ?? [];
  const details = useQuery({
    queryKey: ["icu-transfer-details", hospitalId, ids],
    enabled: !!hospitalId && ids.length > 0,
    queryFn: async () => {
      if (!hospitalId || ids.length === 0) return { stays: [], protocols: [], docs: [] };
      const [history, operations, summaries] = await Promise.all([
        supabase.from("hospitalization_department_history")
          .select("hospitalization_id, department_id, entered_at, left_at, departments(name), hospitalizations(hospitalization_number, patients(first_name, last_name, patient_number))")
          .eq("hospital_id", hospitalId).in("hospitalization_id", ids).order("entered_at", { ascending: true }),
        supabase.from("patient_documents")
          .select("id, hospitalization_id, created_at, patient_document_field_values(field_definition_id, value)")
          .eq("hospital_id", hospitalId).eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
          .in("hospitalization_id", ids)
          .in("patient_document_field_values.field_definition_id", [POSTOP_DESTINATION_FIELD_ID, SURG_END_DATETIME_FIELD_ID]),
        supabase.from("patient_documents").select("hospitalization_id, created_at, status")
          .eq("hospital_id", hospitalId).eq("document_type_id", TRANSFER_SUMMARY_DOC_TYPE_ID).in("hospitalization_id", ids),
      ]);
      if (history.error) throw history.error;
      if (operations.error) throw operations.error;
      if (summaries.error) throw summaries.error;
      const stays: DeptStay[] = (history.data as unknown as RawStay[]).map((s) => ({
        hospitalizationId: s.hospitalization_id, departmentId: s.department_id,
        departmentName: s.departments?.name ?? "—", enteredAt: s.entered_at, leftAt: s.left_at,
        hospitalizationNumber: s.hospitalizations?.hospitalization_number ?? null,
        patientName: [s.hospitalizations?.patients?.last_name, s.hospitalizations?.patients?.first_name].filter(Boolean).join(" "),
        patientNumber: s.hospitalizations?.patients?.patient_number ?? null,
      }));
      const protocols: ProtocolInfo[] = (operations.data as unknown as RawProtocol[]).map((p) => {
        const field = (id: string) => {
          const value = p.patient_document_field_values?.find((v) => v.field_definition_id === id)?.value;
          return typeof value === "string" && value ? value : null;
        };
        return { hospitalizationId: p.hospitalization_id, createdAt: p.created_at,
          endLocal: field(SURG_END_DATETIME_FIELD_ID), destination: field(POSTOP_DESTINATION_FIELD_ID) };
      });
      const docs: TransferDoc[] = (summaries.data ?? []).map((d) => ({
        hospitalizationId: d.hospitalization_id, createdAt: d.created_at, status: d.status,
      }));
      return { stays, protocols, docs };
    },
  });
  const result = useMemo(() => {
    if (!icuId || !details.data || ids.length === 0) return { rows: [], excludedPlanned: 0 };
    return buildIcuTransfers({ ...details.data, icuDepartmentId: icuId, tz, now: new Date(), from: new Date(from), to: new Date(to) });
  }, [icuId, details.data, ids.length, tz, from, to]);
  return {
    ...result,
    isLoading: !!hospitalId && (departments.isLoading || (!!icuId && candidates.isLoading) || (ids.length > 0 && details.isLoading)),
    icuMissing: departments.isSuccess && !icuId,
    error: departments.error ?? candidates.error ?? details.error,
  };
}