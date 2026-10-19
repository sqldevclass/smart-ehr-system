import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const VIEW_KEY = "safety_sedation_columns";
const ANESTHESIA_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000010";
const ANEST_SIDE_EFFECTS_FIELD_ID = "b1000000-0000-0000-0000-000000000163";
const DAILY_NOTE_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000002";

interface AnesthesiaDoc {
  id: string;
  created_at: string;
  hospitalization_id: string | null;
  hospitalizations: { patients: { first_name: string; last_name: string; patient_number: string } | null } | null;
}

export default function SafetyTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: anesthesiaDocs = [] } = useQuery({
    queryKey: ["safety-anesthesia-docs", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select("id, created_at, hospitalization_id, hospitalizations(patients(first_name, last_name, patient_number))")
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", ANESTHESIA_PROTOCOL_DOC_TYPE_ID)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return (data || []) as unknown as AnesthesiaDoc[];
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

  const { data: diaryCount = 0 } = useQuery({
    queryKey: ["safety-diary-count", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("patient_documents")
        .select("id", { count: "exact", head: true })
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", DAILY_NOTE_DOC_TYPE_ID)
        .gte("created_at", from)
        .lte("created_at", to);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const sedationComplications = useMemo(() => {
    const flaggedIds = new Set(sideEffectValues.map((v) => v.patient_document_id));
    return anesthesiaDocs.filter((d) => flaggedIds.has(d.id));
  }, [anesthesiaDocs, sideEffectValues]);

  const columns: ColumnDef<AnesthesiaDoc, any>[] = [
    { id: "date", header: "Date", accessorFn: (d) => format(new Date(d.created_at), "dd.MM.yyyy HH:mm") },
    { id: "patient_number", header: "Patient ID", accessorFn: (d) => d.hospitalizations?.patients?.patient_number || "" },
    {
      id: "patient",
      header: "Patient",
      accessorFn: (d) => {
        const p = d.hospitalizations?.patients;
        return p ? `${p.last_name} ${p.first_name}` : "";
      },
    },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Sedation Complications" value={sedationComplications.length} highlight={sedationComplications.length > 0} />
        <MetricTile label="Diary Notes Recorded" value={diaryCount} />
      </SummaryCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Sedation Complications (Побочные эффекты анестезии)</h3>
        <div className="h-[55vh] min-h-0">
          <DataTable
            columns={columns}
            data={sedationComplications}
            emptyMessage="No sedation complications recorded in this period."
            viewKey={VIEW_KEY}
            getRowId={(d) => d.id}
          />
        </div>
      </div>
    </div>
  );
}
