import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HospitalizationStay {
  id: string;
  admitted_at: string;
  discharged_at: string | null;
  departments: { name: string } | null;
}

interface Params {
  patientId: string;
  hospitalId: string;
  /** Excluded from the list. Omit it to list every stay, including the current one. */
  currentHospitalizationId?: string;
  enabled?: boolean;
}

/**
 * The patient's hospitalizations, newest first. Every history view on a page
 * uses the same query key, so the list is fetched once and shared.
 */
export function usePreviousHospitalizations({
  patientId,
  hospitalId,
  currentHospitalizationId,
  enabled = true,
}: Params) {
  return useQuery({
    queryKey: ["previous-hospitalizations", patientId, hospitalId, currentHospitalizationId ?? "all"],
    enabled: enabled && !!patientId && !!hospitalId,
    queryFn: async (): Promise<HospitalizationStay[]> => {
      let query = supabase
        .from("hospitalizations")
        .select("id, admitted_at, discharged_at, departments!department_id(name)")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId);
      if (currentHospitalizationId) query = query.neq("id", currentHospitalizationId);
      const { data, error } = await query.order("admitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HospitalizationStay[];
    },
  });
}
