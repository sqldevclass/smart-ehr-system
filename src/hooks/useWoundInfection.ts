import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHospitalTimezone } from "@/hooks/useHospitalTimezone";
import { WOUND_INFECTION_SIGNS } from "@/lib/deviceForms";
import { summarizeWoundInfection, type WoundRecord } from "@/lib/woundInfection";

export interface WoundInfectionRow {
  hospitalizationId: string;
  hospitalizationNumber: string | null;
  patientName: string;
  patientNumber: string | null;
  department: string;
  firstSignAt: string | null;
  lastSignAt: string | null;
  signLabels: string[];
  flaggedEntries: number;
  entries: number;
  lastEntryPositive: boolean;
  cultureTaken: boolean;
  cultureNote: string | null;
  antibioticProphylaxis: boolean | null;
}

type Rec = WoundRecord & {
  hospitalizations: { hospitalization_number: string | null; departments: { name: string } | null } | null;
  patients: { first_name: string | null; last_name: string | null; patient_number: string | null } | null;
};

export function useWoundInfection(from: string, to: string) {
  const { user } = useAuth();
  const tz = useHospitalTimezone();
  const { data = [], isLoading } = useQuery({
    queryKey: ["wound-infection-report", user?.hospitalId, from, to, tz],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nurse_device_monitoring_records")
        .select("hospitalization_id, recorded_at, responses, hospitalizations(hospitalization_number, departments(name)), patients(first_name, last_name, patient_number)")
        .eq("hospital_id", user!.hospitalId)
        .eq("form_type", "postop_wound")
        .gte("recorded_at", from)
        .lte("recorded_at", to);
      if (error) throw error;
      return (data || []) as unknown as Rec[];
    },
  });

  return useMemo(() => {
    const summary = summarizeWoundInfection(data);
    const info = new Map<string, Rec>();
    data.forEach((r) => info.set(r.hospitalization_id, r));
    const labelOf = new Map(WOUND_INFECTION_SIGNS.map((c) => [c.code, c.label]));
    let flagged = 0;
    const rows: WoundInfectionRow[] = [];
    summary.forEach((s, id) => {
      if (s.flaggedEntries < 1) return;
      flagged += 1;
      const r = info.get(id);
      rows.push({
        hospitalizationId: id,
        hospitalizationNumber: r?.hospitalizations?.hospitalization_number ?? null,
        patientName: [r?.patients?.last_name, r?.patients?.first_name].filter(Boolean).join(" ") || "—",
        patientNumber: r?.patients?.patient_number ?? null,
        department: r?.hospitalizations?.departments?.name ?? "—",
        firstSignAt: s.firstSignAt,
        lastSignAt: s.lastSignAt,
        signLabels: s.signCodes.map((c) => labelOf.get(c) ?? c),
        flaggedEntries: s.flaggedEntries,
        entries: s.entries,
        lastEntryPositive: s.lastEntryPositive,
        cultureTaken: s.cultureTaken,
        cultureNote: s.cultureNote,
        antibioticProphylaxis: s.antibioticProphylaxis,
      });
    });
    rows.sort((a, b) => (b.lastSignAt ?? "").localeCompare(a.lastSignAt ?? ""));
    return { rows, monitored: summary.size, flagged, isLoading };
  }, [data, isLoading]);
}
