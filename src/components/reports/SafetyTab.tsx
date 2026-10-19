import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";

const VIEW_KEY = "safety_sedation_columns";
const ANESTHESIA_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000010";
const ANEST_SIDE_EFFECTS_FIELD_ID = "b1000000-0000-0000-0000-000000000163";

interface AnesthesiaDocRow {
  id: string;
  created_at: string;
  hospitalization_id: string | null;
  created_by: string | null;
  hospitalizations: { hospitalization_number: string | null } | null;
  patients: { first_name: string; last_name: string; patient_number: string; date_of_birth: string | null } | null;
  profiles: { full_name: string } | null;
}

export default function SafetyTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: anesthesiaDocs = [] } = useQuery({
    queryKey: ["safety-anesthesia-docs", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select(`
          id, created_at, hospitalization_id, created_by,
          hospitalizations(hospitalization_number),
          patients(first_name, last_name, patient_number, date_of_birth),
          profiles!created_by(full_name)
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", ANESTHESIA_PROTOCOL_DOC_TYPE_ID)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as unknown as AnesthesiaDocRow[];
    },
    enabled: !!user,
  });

  const docIds = useMemo(() => anesthesiaDocs.map((d) => d.id), [anesthesiaDocs]);

  const { data: sideEffectValues = [] } = useQuery({
    queryKey: ["safety-side-effects", user?.hospitalId, docIds.join(",")],
    queryFn: async () => {
      if (!user || docIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_document_field_values")
        .select("patient_document_id, value")
        .eq("hospital_id", user.hospitalId)
        .eq("field_definition_id", ANEST_SIDE_EFFECTS_FIELD_ID)
        .eq("value", "true")
        .in("patient_document_id", docIds);
      if (error) throw error;
      return (data || []) as { patient_document_id: string; value: string }[];
    },
    enabled: !!user && docIds.length > 0,
  });

  const sedationComplications = useMemo(() => {
    const flaggedIds = new Set(sideEffectValues.map((v) => v.patient_document_id));
    return anesthesiaDocs.filter((d) => flaggedIds.has(d.id));
  }, [anesthesiaDocs, sideEffectValues]);

  const columns: ColumnDef<AnesthesiaDocRow, any>[] = [
    { id: "date", header: "Дата", accessorFn: (d) => format(new Date(d.created_at), "dd.MM.yyyy HH:mm") },
    { id: "hosp_number", header: "№ истории", accessorFn: (d) => d.hospitalizations?.hospitalization_number || "" },
    { id: "patient_number", header: "ID пациента", accessorFn: (d) => d.patients?.patient_number || "" },
    { id: "last_name", header: "Фамилия", accessorFn: (d) => d.patients?.last_name || "" },
    { id: "first_name", header: "Имя", accessorFn: (d) => d.patients?.first_name || "" },
    { id: "dob", header: "Дата рождения", accessorFn: (d) => (d.patients?.date_of_birth ? format(new Date(d.patients.date_of_birth), "dd.MM.yyyy") : "") },
    { id: "side_effects", header: "Побочные эффекты анестезии", accessorFn: () => "Да" },
    { id: "op_ip", header: "IP/OP", accessorFn: (d) => (d.hospitalization_id ? "Стационар" : "Амбулаторно") },
    { id: "doctor", header: "Doctor", accessorFn: (d) => d.profiles?.full_name || "" },
  ];

  return (
    <div className="mt-4 h-[70vh] min-h-0">
      <DataTable
        columns={columns}
        data={sedationComplications}
        emptyMessage="No sedation complications recorded in this period."
        viewKey={VIEW_KEY}
        getRowId={(d) => d.id}
      />
    </div>
  );
}

