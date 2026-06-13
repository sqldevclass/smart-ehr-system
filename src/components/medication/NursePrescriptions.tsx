import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import PrescriptionGrid from "@/components/medication/PrescriptionGrid";
import PrnPrescriptionList from "@/components/medication/PrnPrescriptionList";


interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  isReadOnly?: boolean;
}

export default function NursePrescriptions({ hospitalizationId, hospitalId, isReadOnly = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: prescriptions = [] } = useQuery({
    queryKey: ["nurse-prescriptions", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_prescriptions")
        .select(`
          id, dose, dose_unit, route,
          schedule_times, duration_days,
          food_rule, prescription_type,
          prn_condition, notes, status_code,
          prescribed_at, is_drafted,
          is_patient_own_drug, custom_drug_name, custom_inn,
          drug_formulary!drug_formulary_id(trade_name, inn),
          profiles!prescribed_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_drafted", false)
        .neq("status_code", "cancelled")
        .order("prescribed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allSlots = [] } = useQuery({
    queryKey: ["nurse-admin-slots", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, prescription_id, scheduled_at,
          administered_at, dose_given, override_dose,
          original_scheduled_at, status, notes,
          dispense_status, dept_batch_id,
          profiles!administered_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const invalidateSlots = () =>
    queryClient.invalidateQueries({
      queryKey: ["nurse-admin-slots", hospitalizationId],
    });

  const handleAdministerSlot = async (
    slotId: string,
    doseGiven: string,
    notes: string,
  ) => {
    const { error } = await supabase
      .from("drug_administration_slots")
      .update({
        status: "done",
        administered_at: new Date().toISOString(),
        administered_by: user!.id,
        dose_given: doseGiven || null,
        notes: notes || null,
      })
      .eq("id", slotId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Выполнено");
    invalidateSlots();
  };

  const handleSkipSlot = async (slotId: string) => {
    const { error } = await supabase
      .from("drug_administration_slots")
      .update({ status: "skipped" })
      .eq("id", slotId);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidateSlots();
  };

  return (
    <div className="space-y-3">
      
      <h3 className="font-semibold">Назначения</h3>
      <PrescriptionGrid
        prescriptions={prescriptions.filter(
          (p: any) => p.prescription_type !== "prn",
        )}
        slots={allSlots}
        viewerRole="nurse"
        isReadOnly={isReadOnly}
        hospitalId={hospitalId}
        hospitalizationId={hospitalizationId}
        onExtend={() => {}}
        onCancelDay={() => {}}
        onAdministerSlot={handleAdministerSlot}
        onSkipSlot={handleSkipSlot}
      />
      <PrnPrescriptionList
        prescriptions={prescriptions}
        slots={allSlots}
        viewerRole="nurse"
        isReadOnly={isReadOnly}
        hospitalId={hospitalId}
        hospitalizationId={hospitalizationId}
        onAdministerSlot={handleAdministerSlot}
        onSkipSlot={handleSkipSlot}
      />
    </div>
  );
}
