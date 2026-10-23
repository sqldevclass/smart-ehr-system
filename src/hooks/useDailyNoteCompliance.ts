import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import {
  DAILY_NOTE_EXCLUDED_JOB_TITLE_CODE,
  PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID,
  localDayKey,
  requiredNoteDays,
  stayDayCount,
} from "@/lib/physicianDailyNotes";
import { OPERATION_PROTOCOL_DOC_TYPE_ID } from "@/lib/documentTypeIds";
import { formatStaffShortName } from "@/lib/staffName";

// Persons whose notes don't count (active employment as Анестезиолог-Реаниматолог).
export function useExcludedNoteAuthorPersonIds() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ["daily-note-excluded-persons", user?.hospitalId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employments")
        .select("person_id, job_titles!inner(code)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .eq("job_titles.code", DAILY_NOTE_EXCLUDED_JOB_TITLE_CODE);
      if (error) throw error;
      return (data || []).map((r: any) => r.person_id as string);
    },
  });
  const excludedPersonIds = useMemo(() => new Set(data), [data]);
  return { excludedPersonIds, isLoading };
}

export interface MissingNotesRow {
  hospitalizationId: string;
  hospitalizationNumber: string | null;
  patientName: string;
  patientNumber: string | null;
  department: string;
  admittedAt: string;
  dischargedAt: string | null;
  physician: string;
  hadSurgery: boolean;
  stayDays: number;
  notes: number;
  missingDays: string[];
}

// All inpatient stays overlapping [from, to] and the days they are missing a
// completed physician daily note.
export function useMissingDailyNotes(from: string, to: string, excludedPersonIds: Set<string>) {
  const { user } = useAuth();
  const tz = useHospitalTimezone();
  const hospitalId = user?.hospitalId;

  const { data: stays = [], isLoading } = useQuery({
    queryKey: ["daily-note-inpatient-stays", hospitalId, from, to],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(
          "id, hospitalization_number, admitted_at, discharged_at, departments(name), patients(first_name, last_name, patient_number), physician:staff_roles!hospitalizations_primary_staff_role_id_fkey(person:persons(first_name, last_name)), patient_documents(created_at, document_type_id, author:profiles!patient_documents_created_by_fkey(person_id))"
        )
        .eq("hospital_id", hospitalId!)
        .lte("admitted_at", to)
        .or(`discharged_at.is.null,discharged_at.gte."${from}"`)
        .in("patient_documents.document_type_id", [PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID, OPERATION_PROTOCOL_DOC_TYPE_ID])
        .eq("patient_documents.status", "completed");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const rows = useMemo<MissingNotesRow[]>(() => {
    const fromKey = format(new Date(from), "yyyy-MM-dd");
    const toKey = format(new Date(to), "yyyy-MM-dd");
    const now = new Date();
    const opts = { now, tz, fromKey, toKey };

    return stays
      .map((s: any): MissingNotesRow => {
        const docs: any[] = s.patient_documents || [];
        const noteDocs = docs.filter(
          (d) =>
            d.document_type_id === PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID &&
            !(d.author?.person_id && excludedPersonIds.has(d.author.person_id))
        );
        const hadSurgery = docs.some((d) => d.document_type_id === OPERATION_PROTOCOL_DOC_TYPE_ID);
        const stay = { admittedAt: s.admitted_at, dischargedAt: s.discharged_at };
        const required = requiredNoteDays(stay, opts);
        const covered = new Set(noteDocs.map((d) => localDayKey(d.created_at, tz)));
        const missingDays = required.filter((d) => !covered.has(d));
        const admitKey = localDayKey(s.admitted_at, tz);
        const endKey = localDayKey(s.discharged_at ?? now, tz);
        const lo = admitKey > fromKey ? admitKey : fromKey;
        const hi = endKey < toKey ? endKey : toKey;
        const notes = noteDocs.filter((d) => {
          const k = localDayKey(d.created_at, tz);
          return k >= lo && k <= hi;
        }).length;
        return {
          hospitalizationId: s.id,
          hospitalizationNumber: s.hospitalization_number,
          patientName: [s.patients?.last_name, s.patients?.first_name].filter(Boolean).join(" ") || "—",
          patientNumber: s.patients?.patient_number ?? null,
          department: s.departments?.name ?? "—",
          admittedAt: s.admitted_at,
          dischargedAt: s.discharged_at,
          physician: formatStaffShortName({ person: s.physician?.person }) || "—",
          hadSurgery,
          stayDays: stayDayCount(stay, opts),
          notes,
          missingDays,
        };
      })
      .filter((r) => r.missingDays.length > 0)
      .sort((a, b) => b.missingDays.length - a.missingDays.length);
  }, [stays, excludedPersonIds, from, to, tz]);

  return { rows, inpatientsInPeriod: stays.length, isLoading };
}

