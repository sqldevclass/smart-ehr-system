import HighlightMatch from "@/components/shared/HighlightMatch";
import PatientDobCell from "@/components/shared/PatientDobCell";
import type { PatientSearchFields } from "@/lib/patientSearch";

// Two-line patient label for search dropdowns: name, then П# · DOB · phone,
// all with matches in bold, so the reason a patient matched is always visible.
export default function PatientMatchSummary({ patient, term }: { patient: PatientSearchFields; term: string }) {
  const name = [patient.last_name, patient.first_name].filter(Boolean).join(" ");
  return (
    <div className="min-w-0">
      <div className="font-medium truncate">
        <HighlightMatch text={name} term={term} />
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
        {patient.patient_number && (
          <span>
            П# <HighlightMatch text={patient.patient_number} term={term} />
          </span>
        )}
        {patient.date_of_birth && (
          <span>
            <PatientDobCell dob={patient.date_of_birth} term={term} />
          </span>
        )}
        {patient.phone && (
          <span>
            <HighlightMatch text={patient.phone} term={term} />
          </span>
        )}
      </div>
    </div>
  );
}

