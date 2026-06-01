import { useState } from "react";
import { Button } from "@/components/ui/button";
import AssessmentSection from "./AssessmentSection";

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
  const [patientType, setPatientType] = useState<
    "intubated" | "non_intubated" | null
  >(null);

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
            onClick={() => setPatientType(null)}
            className="text-xs text-primary underline"
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
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Выберите тип пациента:
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPatientType("intubated")}
            >
              Интубирован (ИВЛ)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPatientType("non_intubated")}
            >
              Не интубирован
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
