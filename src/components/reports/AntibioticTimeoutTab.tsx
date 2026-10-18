import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const OPERATION_PROTOCOL_DOC_TYPE_ID = "c1000000-0000-0000-0000-000000000011";
const SURG_START_FIELD_ID = "b1000000-0000-0000-0000-000000000124";
const SURG_NAME_FIELD_ID = "b1000000-0000-0000-0000-000000000126";
const HIGHLIGHT_THRESHOLD_MIN = 60;

interface SlotRow {
  id: string;
  administered_at: string;
  hospitalization_id: string;
  drug_prescriptions: {
    patient_id: string;
    patients: { first_name: string; last_name: string; patient_number: string } | null;
  } | null;
}

interface OperationCandidate {
  documentId: string;
  startDatetime: Date | null;
  operationName: string | null;
}

interface ReportRow {
  id: string;
  administeredAt: Date;
  patientLabel: string;
  patientNumber: string;
  operationName: string | null;
  startDatetime: Date | null;
  diffMinutes: number | null;
}

export default function AntibioticTimeoutTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: slots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ["antibiotic-timeout-slots", user?.hospitalId, from, to],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("drug_administration_slots")
        .select(`
          id, administered_at, hospitalization_id,
          drug_prescriptions!inner(prescription_type, patient_id, patients(first_name, last_name, patient_number))
        `)
        .eq("hospital_id", user.hospitalId)
        .eq("drug_prescriptions.prescription_type", "antibiotic_prophylaxis")
        .not("administered_at", "is", null)
        .gte("administered_at", from)
        .lte("administered_at", to);
      if (error) throw error;
      return (data || []) as unknown as SlotRow[];
    },
    enabled: !!user,
  });

  const hospIds = useMemo(
    () => Array.from(new Set(slots.map((s) => s.hospitalization_id))),
    [slots]
  );

  const { data: protocolDocs = [] } = useQuery({
    queryKey: ["antibiotic-timeout-protocols", user?.hospitalId, hospIds.join(",")],
    queryFn: async () => {
      if (!user || hospIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_documents")
        .select("id, hospitalization_id")
        .eq("hospital_id", user.hospitalId)
        .eq("document_type_id", OPERATION_PROTOCOL_DOC_TYPE_ID)
        .in("hospitalization_id", hospIds);
      if (error) throw error;
      return (data || []) as { id: string; hospitalization_id: string }[];
    },
    enabled: !!user && hospIds.length > 0,
  });

  const docIds = useMemo(() => protocolDocs.map((d) => d.id), [protocolDocs]);

  const { data: fieldValues = [] } = useQuery({
    queryKey: ["antibiotic-timeout-field-values", user?.hospitalId, docIds.join(",")],
    queryFn: async () => {
      if (!user || docIds.length === 0) return [];
      const { data, error } = await supabase
        .from("patient_document_field_values")
        .select("patient_document_id, field_definition_id, value")
        .eq("hospital_id", user.hospitalId)
        .in("field_definition_id", [SURG_START_FIELD_ID, SURG_NAME_FIELD_ID])
        .in("patient_document_id", docIds);
      if (error) throw error;
      return (data || []) as { patient_document_id: string; field_definition_id: string; value: string | null }[];
    },
    enabled: !!user && docIds.length > 0,
  });

  const isLoading = loadingSlots;

  const rows = useMemo(() => {
    const valuesByDoc = new Map<string, { start: string | null; name: string | null }>();
    fieldValues.forEach((fv) => {
      const entry = valuesByDoc.get(fv.patient_document_id) || { start: null, name: null };
      if (fv.field_definition_id === SURG_START_FIELD_ID) entry.start = fv.value;
      if (fv.field_definition_id === SURG_NAME_FIELD_ID) entry.name = fv.value;
      valuesByDoc.set(fv.patient_document_id, entry);
    });

    const candidatesByHosp = new Map<string, OperationCandidate[]>();
    protocolDocs.forEach((doc) => {
      const vals = valuesByDoc.get(doc.id);
      const arr = candidatesByHosp.get(doc.hospitalization_id) || [];
      arr.push({
        documentId: doc.id,
        startDatetime: vals?.start ? new Date(vals.start) : null,
        operationName: vals?.name || null,
      });
      candidatesByHosp.set(doc.hospitalization_id, arr);
    });

    return slots
      .map((s): ReportRow => {
        const administeredAt = new Date(s.administered_at);
        const candidates = (candidatesByHosp.get(s.hospitalization_id) || []).filter(
          (c) => c.startDatetime !== null
        );

        let best: OperationCandidate | null = null;
        if (candidates.length === 1) {
          best = candidates[0];
        } else if (candidates.length > 1) {
          best = candidates.reduce((closest, c) => {
            if (!closest.startDatetime) return c;
            if (!c.startDatetime) return closest;
            const closestDiff = Math.abs(closest.startDatetime.getTime() - administeredAt.getTime());
            const cDiff = Math.abs(c.startDatetime.getTime() - administeredAt.getTime());
            return cDiff < closestDiff ? c : closest;
          });
        }

        const diffMinutes = best?.startDatetime
          ? Math.round((administeredAt.getTime() - best.startDatetime.getTime()) / 60000)
          : null;

        const patient = s.drug_prescriptions?.patients;

        return {
          id: s.id,
          administeredAt,
          patientLabel: patient ? `${patient.last_name} ${patient.first_name}` : "",
          patientNumber: patient?.patient_number || "",
          operationName: best?.operationName || null,
          startDatetime: best?.startDatetime || null,
          diffMinutes,
        };
      })
      .sort((a, b) => b.administeredAt.getTime() - a.administeredAt.getTime());
  }, [slots, protocolDocs, fieldValues]);

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Time between antibiotic prophylaxis administration and the matched surgery's start time (Протокол операции → Проведённые вмешательства). Rows ≥{HIGHLIGHT_THRESHOLD_MIN} min off target are highlighted.
      </p>
      <div className="rounded-md border bg-card">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No antibiotic prophylaxis administrations in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient ID</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Administered At</TableHead>
                <TableHead>Surgery Start</TableHead>
                <TableHead className="text-right">Diff (min)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const flagged = r.diffMinutes !== null && Math.abs(r.diffMinutes) >= HIGHLIGHT_THRESHOLD_MIN;
                return (
                  <TableRow key={r.id} className={cn(flagged && "bg-destructive/10")}>
                    <TableCell>{r.patientNumber}</TableCell>
                    <TableCell>{r.patientLabel}</TableCell>
                    <TableCell>{r.operationName || "No operation protocol found"}</TableCell>
                    <TableCell>{format(r.administeredAt, "dd.MM.yyyy HH:mm")}</TableCell>
                    <TableCell>{r.startDatetime ? format(r.startDatetime, "dd.MM.yyyy HH:mm") : "—"}</TableCell>
                    <TableCell className={cn("text-right", flagged && "font-semibold text-destructive")}>
                      {r.diffMinutes !== null ? r.diffMinutes : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
