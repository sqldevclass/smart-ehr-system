import { format } from "date-fns";

interface Props {
  patient: {
    first_name: string | null;
    last_name: string | null;
    middle_name: string | null;
    date_of_birth: string | null;
    gender: string | null;
    phone: string | null;
    patient_number: string | null;
  };
  documentType: { name_ru: string | null; color: string | null };
  hospitalName: string;
  visitDate: Date;
}

export default function DocumentPatientHeader({
  patient, documentType, hospitalName, visitDate,
}: Props) {
  return (
    <div className="border-b pb-4 mb-6">
      <div className="text-center mb-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {hospitalName}
        </div>
        <h1
          className="font-heading text-xl font-bold mt-1"
          style={{ color: documentType.color || undefined }}
        >
          {documentType.name_ru}
        </h1>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-muted-foreground">Пациент: </span>
          <span className="font-medium">
            {patient.last_name} {patient.first_name} {patient.middle_name}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">П#: </span>
          <span className="font-mono">{patient.patient_number}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Дата рождения: </span>
          <span>
            {patient.date_of_birth
              ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Пол: </span>
          <span>{patient.gender || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Телефон: </span>
          <span>{patient.phone || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Дата визита: </span>
          <span>{format(visitDate, "dd.MM.yyyy")}</span>
        </div>
      </div>
    </div>
  );
}
