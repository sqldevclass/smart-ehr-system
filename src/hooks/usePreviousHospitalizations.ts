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
  currentHospitalizationId: string;
  enabled?: boolean;
}

/**
 * The patient's other hospitalizations, newest first. Every history toggle on a
 * page uses the same query key, so the list is fetched once and shared.
 */
export function usePreviousHospitalizations({
  patientId,
  hospitalId,
  currentHospitalizationId,
  enabled = true,
}: Params) {
  return useQuery({
    queryKey: ["previous-hospitalizations", patientId, hospitalId, currentHospitalizationId],
    enabled: enabled && !!patientId && !!hospitalId && !!currentHospitalizationId,
    queryFn: async (): Promise<HospitalizationStay[]> => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, admitted_at, discharged_at, departments!department_id(name)")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .neq("id", currentHospitalizationId)
        .order("admitted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HospitalizationStay[];
    },
  });
}
