import PreviousHospitalizations from "@/components/shared/PreviousHospitalizations";
import StayScalesHistory from "@/components/assessments/StayScalesHistory";

interface Props {
  patientId: string;
  hospitalId: string;
}

/** Read-only scale history for every hospitalization of the patient, current one included. */
export default function PatientAssessmentHistory({ patientId, hospitalId }: Props) {
  return (
    <PreviousHospitalizations
      patientId={patientId}
      hospitalId={hospitalId}
      collapsible={false}
      renderStay={(stayId) => <StayScalesHistory hospitalizationId={stayId} />}
    />
  );
}
