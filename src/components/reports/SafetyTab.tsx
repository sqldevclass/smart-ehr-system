import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

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

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile label="Sedation Complications" value={sedationComplications.length} highlight={sedationComplications.length > 0} />
        <MetricTile label="Diary Notes Recorded" value={diaryCount} />
      </SummaryCard>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Sedation Complications (Побочные эффекты анестезии)</h3>
        <div className="rounded-md border bg-card">
          {sedationComplications.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No sedation complications recorded in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Patient</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sedationComplications.map((d) => {
                  const patient = d.hospitalizations?.patients;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>{format(new Date(d.created_at), "dd.MM.yyyy HH:mm")}</TableCell>
                      <TableCell>{patient?.patient_number || ""}</TableCell>
                      <TableCell>{patient ? `${patient.last_name} ${patient.first_name}` : ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
