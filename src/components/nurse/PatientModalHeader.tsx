import { ReactNode } from "react";
import { format, differenceInYears } from "date-fns";

interface Patient {
  last_name?: string | null;
  first_name?: string | null;
  date_of_birth?: string | null;
  patient_number?: string | number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
}

interface Props {
  title: string;
  patient: Patient | null | undefined;
  room?: string;
  allergies?: string[];
  extra?: ReactNode;
  onClose: () => void;
}

export default function PatientModalHeader({
  title,
  patient,
  room,
  allergies,
  extra,
  onClose,
}: Props) {
  return (
    <div className="flex items-start gap-4 p-4 border-b">
      <div className="flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-semibold">{title}</span>
          <span className="font-medium text-sm">
            {patient?.last_name} {patient?.first_name}
          </span>
          <span className="text-muted-foreground text-sm">
            {patient?.date_of_birth
              ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
              : "—"}
            {" · "}
            {patient?.date_of_birth
              ? differenceInYears(new Date(), new Date(patient.date_of_birth))
              : "—"}{" "}
            лет
          </span>
          <span className="text-muted-foreground text-sm">
            П# {patient?.patient_number}
          </span>
          {room && (
            <span className="text-muted-foreground text-sm">{room}</span>
          )}
          {patient?.weight_kg && (
            <span className="text-muted-foreground text-sm">
              {patient.weight_kg} кг
            </span>
          )}
          {patient?.height_cm && (
            <span className="text-muted-foreground text-sm">
              {patient.height_cm} см
            </span>
          )}
          {allergies && allergies.length > 0 && (
            <span className="text-red-700 font-semibold text-xs">
              ⚠ АЛЛЕРГИЯ: {allergies.join(", ")}
            </span>
          )}
        </div>
      </div>
      {extra}
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
