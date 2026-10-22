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
} from "@/lib/physicianDailyNotes";

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
  required: number;
  written: number;
  missingDays: string[];
}

// Surgical inpatients (>= 1 COMPLETED service of type Хирургия on the hospitalization)
// and the days in [from, to] they are missing a physician daily note.
export function useMissingDailyNotes(from: string, to: string, excludedPersonIds: Set<string>) {
  const { user } = useAuth();
  const tz = useHospitalTimezone();
  const hospitalId = user?.hospitalId;

  const { data: surgicalHospIds = [], isLoading: idsLoading } = useQuery({
    queryKey: ["surgical-hospitalization-ids", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select("hospitalization_id, services!inner(service_types!inner(code)), service_statuses!inner(code)")
        .eq("hospital_id", hospitalId!)
        .not("hospitalization_id", "is", null)
        .eq("services.service_types.code", "surgery")
        .eq("service_statuses.code", "completed");
      if (error) throw error;
      return Array.from(new Set((data || []).map((r: any) => r.hospitalization_id as string)));
    },
  });

  const { data: stays = [], isLoading: staysLoading } = useQuery({
    queryKey: ["surgical-stays", hospitalId, surgicalHospIds.join(","), from, to],
    enabled: !!hospitalId && surgicalHospIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, discharged_at, departments(name), patients(first_name, last_name, patient_number)")
        .eq("hospital_id", hospitalId!)
        .in("id", surgicalHospIds)
        .lte("admitted_at", to)
        .or(`discharged_at.is.null,discharged_at.gte."${from}"`);
      if (error) throw error;
      return data || [];
    },
  });

  const stayIds = useMemo(() => stays.map((s: any) => s.id as string), [stays]);

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["surgical-stay-daily-notes", hospitalId, stayIds.join(",")],
    enabled: !!hospitalId && stayIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_documents")
        .select("hospitalization_id, created_at, author:profiles!patient_documents_created_by_fkey(person_id)")
        .eq("hospital_id", hospitalId!)
        .eq("document_type_id", PHYSICIAN_DAILY_NOTE_DOC_TYPE_ID)
        .eq("status", "completed")
        .in("hospitalization_id", stayIds);
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo<MissingNotesRow[]>(() => {
    // Report period as the calendar dates the user picked.
    const fromKey = format(new Date(from), "yyyy-MM-dd");
    const toKey = format(new Date(to), "yyyy-MM-dd");
    const now = new Date();

    const coveredByStay = new Map<string, Set<string>>();
    notes.forEach((n: any) => {
      if (n.author?.person_id && excludedPersonIds.has(n.author.person_id)) return;
      const set = coveredByStay.get(n.hospitalization_id) || new Set<string>();
      set.add(localDayKey(n.created_at, tz));
      coveredByStay.set(n.hospitalization_id, set);
    });

    return stays
      .map((s: any): MissingNotesRow => {
        const required = requiredNoteDays(
          { admittedAt: s.admitted_at, dischargedAt: s.discharged_at },
          { now, tz, fromKey, toKey }
        );
        const covered = coveredByStay.get(s.id) || new Set<string>();
        const missingDays = required.filter((d) => !covered.has(d));
        return {
          hospitalizationId: s.id,
          hospitalizationNumber: s.hospitalization_number,
          patientName: [s.patients?.last_name, s.patients?.first_name].filter(Boolean).join(" ") || "—",
          patientNumber: s.patients?.patient_number ?? null,
          department: s.departments?.name ?? "—",
          admittedAt: s.admitted_at,
          dischargedAt: s.discharged_at,
          required: required.length,
          written: required.length - missingDays.length,
          missingDays,
        };
      })
      .filter((r) => r.missingDays.length > 0)
      .sort((a, b) => b.missingDays.length - a.missingDays.length);
  }, [stays, notes, excludedPersonIds, from, to, tz]);

  return {
    rows,
    surgicalStaysInPeriod: stays.length,
    isLoading: idsLoading || staysLoading || notesLoading,
  };
}

