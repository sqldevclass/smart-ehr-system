import HighlightMatch from "@/components/shared/HighlightMatch";
import { dobIsoDigits, formatDob } from "@/lib/patientSearch";

// DOB shown as dd.mm.yyyy with search highlighting (ISO-typed input bolds the whole date).
export default function PatientDobCell({ dob, term }: { dob?: string | null; term: string }) {
  return <HighlightMatch text={formatDob(dob)} term={term} alternates={[dobIsoDigits(dob)]} fallback="—" />;
}

