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

  if (!patientType) {
    return (
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">CPOT — Оценка боли</h3>
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
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Тип пациента:{" "}
          {patientType === "intubated"
            ? "Интубирован (ИВЛ)"
            : "Не интубирован"}
        </span>
        <button
          onClick={() => setPatientType(null)}
          className="text-xs text-primary underline"
        >
          Изменить
        </button>
      </div>
      <AssessmentSection
        scaleCode="cpot"
        hospitalizationId={hospitalizationId}
        patientId={patientId}
        hospitalId={hospitalId}
        isReadOnly={isReadOnly}
        hiddenItemCodes={
          patientType === "intubated"
            ? ["vocalization"]
            : ["ventilator_compliance"]
        }
      />
    </div>
  );
}
