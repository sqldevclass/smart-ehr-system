import { Button } from "@/components/ui/button";
import AssessmentSection from "./AssessmentSection";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  isReadOnly?: boolean;
}

export default function CpotSection({
  hospitalizationId,
  patientId,
  hospitalId,
  isReadOnly = false,
}: Props) {
  const qc = useQueryClient();

  const { data: patientType = null } = useQuery({
    queryKey: ["cpot-patient-type", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hospitalizations")
        .select("cpot_patient_type")
        .eq("id", hospitalizationId)
        .maybeSingle();
      return ((data as any)?.cpot_patient_type as "intubated" | "non_intubated") ?? null;
    },
    enabled: !!hospitalizationId,
  });

  const selectPatientType = async (type: "intubated" | "non_intubated") => {
    await (supabase as any)
      .from("hospitalizations")
      .update({ cpot_patient_type: type })
      .eq("id", hospitalizationId);
    qc.invalidateQueries({ queryKey: ["cpot-patient-type", hospitalizationId] });
  };

  const clearPatientType = async () => {
    await (supabase as any)
      .from("hospitalizations")
      .update({ cpot_patient_type: null })
      .eq("id", hospitalizationId);
    qc.invalidateQueries({ queryKey: ["cpot-patient-type", hospitalizationId] });
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold">CPOT — Оценка боли</h4>
      {patientType && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">
            Тип пациента:{" "}
            {patientType === "intubated" ? "Интубирован" : "Не интубирован"}
          </span>
          <button
            onClick={clearPatientType}
            disabled={isReadOnly}
            className="text-xs text-primary underline disabled:opacity-50 disabled:no-underline"
          >
            Изменить
          </button>
        </div>
      )}
      {patientType ? (
        <AssessmentSection
          scaleCode="cpot"
          hospitalizationId={hospitalizationId}
          patientId={patientId}
          hospitalId={hospitalId}
          isReadOnly={isReadOnly}
          autoOpenForm={true}
          hiddenItemCodes={
            patientType === "intubated"
              ? ["vocalization"]
              : ["ventilator_compliance"]
          }
        />
      ) : isReadOnly ? (
        <p className="text-sm text-muted-foreground">Нет данных</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Выберите тип пациента:
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectPatientType("intubated")}
            >
              Интубирован (ИВЛ)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectPatientType("non_intubated")}
            >
              Не интубирован
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
