import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";
import { formatOperationDuration } from "@/lib/operationDuration";

const VIEW_KEY = "surgical_volume_columns";
const OPERATION_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000011";

const SURG_START_FIELD_ID = "b1000000-0000-0000-0000-000000000124";
const SURG_END_FIELD_ID = "b1000000-0000-0000-0000-000000000125";
const SURG_URGENCY_FIELD_ID = "b1000000-0000-0000-0000-000000000120";
const SURG_IS_REPEAT_FIELD_ID = "b1000000-0000-0000-0000-000000000121";
const SURG_COMPLICATIONS_FIELD_ID = "b1000000-0000-0000-0000-000000000128";
const SURG_BLOOD_LOSS_FIELD_ID = "b1000000-0000-0000-0000-000000000129";
const SURG_MACROSCOPIC_FIELD_ID = "b1000000-0000-0000-0000-000000000130";
const SURG_INCISION_CLASS_FIELD_ID = "b1000000-0000-0000-0000-000000000131";

const FIELD_IDS = [
  SURG_START_FIELD_ID,
  SURG_END_FIELD_ID,
  SURG_URGENCY_FIELD_ID,
  SURG_IS_REPEAT_FIELD_ID,
  SURG_COMPLICATIONS_FIELD_ID,
  SURG_BLOOD_LOSS_FIELD_ID,
  SURG_MACROSCOPIC_FIELD_ID,
  SURG_INCISION_CLASS_FIELD_ID,
];

const URGENCY_LABELS: Record<string, string> = {
  planned: "Плановая",
  emergency: "Экстренная",
};

const INCISION_CLASS_LABELS: Record<string, string> = {
  class_1: "I Класс — Чистые",
  class_2: "II Класс — Условно-чистые",
  class_3: "III Класс — Загрязнённые",
  class_4: "IV Класс — Гнойные",
};

interface OperationDoc {
  id: string;
  created_at: string;
  hospitalization_id: string | null;
  hospitalizations: { hospitalization_number: string | null; departments: { name: string } | null } | null;
  patients: { first_name: string; last_name: string; patient_number: string; date_of_birth: string | null } | null;
  profiles: { full_name: string } | null;
}

interface FieldValueRow {
  patient_document_id: string;
  field_definition_id: string;
  value: string | null;
}

interface OperationRow {
  id: string;
  date: Date;
  duration: string | null;
  hospNumber: string;
  patientNumber: string;
  lastName: string;
  firstName: string;
  dob: string | null;
  opIp: "inpatient" | "outpatient";
  doctor: string;
  department: string;
  urgency: string | null;
  isRepeat: boolean;
  complications: boolean;
  bloodLoss: string | null;
  macroscopic: string | null;
  incisionClass: string | null;
}

export default function SurgicalVolumeTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["surgical-volume-docs", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select(`
          id, created_at, hospitalization_id,
          hospitalizations(hospitalization_number, departments(name)),
          patients(first_name, last_name, patient_number, date_of_birth),
          profiles!created_by(full_name)
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
        .eq("status", "completed")
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as unknown as OperationDoc[];
    },
    enabled: !!user,
  });

  const docIds = useMemo(() => docs.map((d) => d.id), [docs]);

  const { data: fieldValues = [] } = useQuery({
    queryKey: ["surgical-volume-field-values", user?.hospitalId, docIds.join(",")],
    queryFn: async () => {
      if (!user || docIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_document_field_values")
        .select("patient_document_id, field_definition_id, value")
        .eq("hospital_id", user.hospitalId)
        .in("field_definition_id", FIELD_IDS)
        .in("patient_document_id", docIds);
      if (error) throw error;
      return (data || []) as FieldValueRow[];
    },
    enabled: !!user && docIds.length > 0,
  });

  const rows = useMemo<OperationRow[]>(() => {
    const byDoc = new Map<string, Record<string, string | null>>();
    fieldValues.forEach((fv) => {
      const entry = byDoc.get(fv.patient_document_id) || {};
      entry[fv.field_definition_id] = fv.value;
      byDoc.set(fv.patient_document_id, entry);
    });

    return docs.map((d): OperationRow => {
      const vals = byDoc.get(d.id) || {};
      const startRaw = vals[SURG_START_FIELD_ID];
      return {
        id: d.id,
        date: startRaw ? new Date(startRaw) : new Date(d.created_at),
        duration: formatOperationDuration(startRaw, vals[SURG_END_FIELD_ID]),
        hospNumber: d.hospitalizations?.hospitalization_number || "",
        patientNumber: d.patients?.patient_number || "",
        lastName: d.patients?.last_name || "",
        firstName: d.patients?.first_name || "",
        dob: d.patients?.date_of_birth || null,
        opIp: d.hospitalization_id ? "inpatient" : "outpatient",
        doctor: d.profiles?.full_name || "",
        department: d.hospitalizations?.departments?.name || "Не указано",
        urgency: vals[SURG_URGENCY_FIELD_ID] || null,
        isRepeat: vals[SURG_IS_REPEAT_FIELD_ID] === "true",
        complications: vals[SURG_COMPLICATIONS_FIELD_ID] === "true",
        bloodLoss: vals[SURG_BLOOD_LOSS_FIELD_ID] || null,
        macroscopic: vals[SURG_MACROSCOPIC_FIELD_ID] || null,
        incisionClass: vals[SURG_INCISION_CLASS_FIELD_ID] || null,
      };
    });
  }, [docs, fieldValues]);

  const stats = useMemo(() => {
    const total = rows.length;
    const planned = rows.filter((r) => r.urgency === "planned").length;
    const emergency = rows.filter((r) => r.urgency === "emergency").length;
    const repeat = rows.filter((r) => r.isRepeat).length;
    const complications = rows.filter((r) => r.complications).length;
    return { total, planned, emergency, repeat, complications };
  }, [rows]);

  const columns: ColumnDef<OperationRow, any>[] = [
    { id: "date", header: "Дата", accessorFn: (r) => format(r.date, "dd.MM.yyyy HH:mm") },
    { id: "duration", header: "Длительность операции", accessorFn: (r) => r.duration ?? "—", meta: { align: "right" } },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospNumber },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => r.lastName },
    { id: "first_name", header: "Имя", accessorFn: (r) => r.firstName },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => (r.dob ? format(new Date(r.dob), "dd.MM.yyyy") : "") },
    { id: "op_ip", header: "IP/OP", accessorFn: (r) => (r.opIp === "inpatient" ? "Стационар" : "Амбулаторно") },
    { id: "doctor", header: "Врач", accessorFn: (r) => r.doctor },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "urgency", header: "Тип операции", accessorFn: (r) => (r.urgency ? URGENCY_LABELS[r.urgency] || r.urgency : "") },
    { id: "is_repeat", header: "Повторная", accessorFn: (r) => (r.isRepeat ? "Да" : "Нет") },
    { id: "complications", header: "Осложнения", accessorFn: (r) => (r.complications ? "Да" : "Нет") },
    { id: "blood_loss", header: "Объём кровопотери (мл)", accessorFn: (r) => r.bloodLoss || "", meta: { align: "right" } },
    { id: "macroscopic", header: "Макроскопический препарат", accessorFn: (r) => r.macroscopic || "" },
    {
      id: "incision_class",
      header: "Классификация хирургического разреза",
      accessorFn: (r) => (r.incisionClass ? INCISION_CLASS_LABELS[r.incisionClass] || r.incisionClass : ""),
    },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Всего операций" value={stats.total} />
        <MetricTile label="Плановые" value={stats.planned} />
        <MetricTile label="Экстренные" value={stats.emergency} />
        <MetricTile label="Повторные" value={stats.repeat} />
        <MetricTile label="С осложнениями" value={stats.complications} />
      </SummaryCard>

      <div className="h-[65vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="За этот период операций не зарегистрировано."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.id}
        />
      </div>
    </div>
  );
}
