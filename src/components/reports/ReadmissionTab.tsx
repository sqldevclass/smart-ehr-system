import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table/DataTable";
import { MetricTile, SummaryCard } from "@/components/shared/PeriodFilter";

const VIEW_KEY = "readmission_columns";
const READMISSION_WINDOW_DAYS = 30;

interface HospItem {
  id: string;
  patient_id: string;
  admitted_at: string;
  discharged_at: string | null;
  discharge_type: string | null;
  department_id: string | null;
  departments: { name: string } | null;
  hospitalization_number: string | null;
  primary_physician_id: string | null;
  patients: { first_name: string; last_name: string; patient_number: string; date_of_birth: string | null } | null;
  profiles: { full_name: string } | null;
}

interface MainDxItem {
  hospitalization_id: string;
  icd10_code: string;
  icd10_codes: { name_ru: string } | null;
}

interface ReadmissionRow {
  id: string;
  dischargedAt: Date;
  hospNumber: string;
  patientNumber: string;
  lastName: string;
  firstName: string;
  dob: string | null;
  department: string;
  doctor: string;
  mainDx: string;
  readmittedAny: boolean;
  readmittedSameDx: boolean;
  hasMainDx: boolean;
}

export default function ReadmissionTab({ from, to }: { from: string; to: string }) {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["readmission-all-hospitalizations", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, patient_id, admitted_at, discharged_at, discharge_type, department_id,
          departments(name), hospitalization_number, primary_physician_id,
          patients(first_name, last_name, patient_number, date_of_birth),
          profiles!primary_physician_id(full_name)
        `)
        .eq("hospital_id", user.hospitalId)
        .order("admitted_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as HospItem[];
    },
    enabled: !!user,
  });

  const { data: mainDiagnoses = [] } = useQuery({
    queryKey: ["readmission-main-diagnoses", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("patient_diagnoses")
        .select("hospitalization_id, icd10_code, icd10_codes(name_ru)")
        .eq("hospital_id", user.hospitalId)
        .eq("diagnosis_type", "main");
      if (error) throw error;
      return (data || []) as unknown as MainDxItem[];
    },
    enabled: !!user,
  });

  const mainDxByHosp = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    mainDiagnoses.forEach((d) => {
      if (!map.has(d.hospitalization_id)) {
        map.set(d.hospitalization_id, { code: d.icd10_code, name: d.icd10_codes?.name_ru || d.icd10_code });
      }
    });
    return map;
  }, [mainDiagnoses]);

  const rows = useMemo<ReadmissionRow[]>(() => {
    const byPatient = new Map<string, HospItem[]>();
    items.forEach((i) => {
      const arr = byPatient.get(i.patient_id) || [];
      arr.push(i);
      byPatient.set(i.patient_id, arr);
    });

    const windowMs = READMISSION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const result: ReadmissionRow[] = [];

    items.forEach((h) => {
      if (!h.discharged_at) return;
      if (h.discharge_type === "deceased") return;
      const dischargedAt = new Date(h.discharged_at);
      if (dischargedAt < new Date(from) || dischargedAt > new Date(to)) return;

      const siblings = byPatient.get(h.patient_id) || [];
      const indexDx = mainDxByHosp.get(h.id);

      const readmittedAny = siblings.some((other) => {
        if (other.id === h.id) return false;
        const admittedAt = new Date(other.admitted_at);
        return admittedAt > dischargedAt && admittedAt.getTime() - dischargedAt.getTime() <= windowMs;
      });

      const readmittedSameDx = indexDx
        ? siblings.some((other) => {
            if (other.id === h.id) return false;
            const admittedAt = new Date(other.admitted_at);
            const withinWindow = admittedAt > dischargedAt && admittedAt.getTime() - dischargedAt.getTime() <= windowMs;
            if (!withinWindow) return false;
            return mainDxByHosp.get(other.id)?.code === indexDx.code;
          })
        : false;

      result.push({
        id: h.id,
        dischargedAt,
        hospNumber: h.hospitalization_number || "",
        patientNumber: h.patients?.patient_number || "",
        lastName: h.patients?.last_name || "",
        firstName: h.patients?.first_name || "",
        dob: h.patients?.date_of_birth || null,
        department: h.departments?.name || "Не указано",
        doctor: h.profiles?.full_name || "",
        mainDx: indexDx ? `${indexDx.code} — ${indexDx.name}` : "",
        readmittedAny,
        readmittedSameDx,
        hasMainDx: !!indexDx,
      });
    });

    return result.sort((a, b) => b.dischargedAt.getTime() - a.dischargedAt.getTime());
  }, [items, mainDxByHosp, from, to]);

  const stats = useMemo(() => {
    const eligible = rows.length;
    const readmittedAny = rows.filter((r) => r.readmittedAny).length;
    const eligibleWithDx = rows.filter((r) => r.hasMainDx).length;
    const readmittedSameDx = rows.filter((r) => r.readmittedSameDx).length;
    return { eligible, readmittedAny, eligibleWithDx, readmittedSameDx };
  }, [rows]);

  const columns: ColumnDef<ReadmissionRow, any>[] = [
    { id: "date", header: "Дата", accessorFn: (r) => format(r.dischargedAt, "dd.MM.yyyy HH:mm") },
    { id: "hosp_number", header: "№ истории", accessorFn: (r) => r.hospNumber },
    { id: "patient_number", header: "ID пациента", accessorFn: (r) => r.patientNumber },
    { id: "last_name", header: "Фамилия", accessorFn: (r) => r.lastName },
    { id: "first_name", header: "Имя", accessorFn: (r) => r.firstName },
    { id: "dob", header: "Дата рождения", accessorFn: (r) => (r.dob ? format(new Date(r.dob), "dd.MM.yyyy") : "") },
    { id: "department", header: "Отделение", accessorFn: (r) => r.department },
    { id: "doctor", header: "Врач", accessorFn: (r) => r.doctor },
    { id: "main_dx", header: "Основной диагноз", accessorFn: (r) => r.mainDx },
    { id: "readmitted_any", header: `Повторная госпитализация (≤${READMISSION_WINDOW_DAYS} дней)`, accessorFn: (r) => (r.readmittedAny ? "Да" : "Нет") },
    { id: "readmitted_same_dx", header: `Повторная госпитализация, тот же диагноз (≤${READMISSION_WINDOW_DAYS} дней)`, accessorFn: (r) => (r.readmittedSameDx ? "Да" : "Нет") },
  ];

  return (
    <div className="mt-4 space-y-4">
      <SummaryCard>
        <MetricTile
          label={`Повторная госпитализация, любая причина (≤${READMISSION_WINDOW_DAYS} дней)`}
          value={
            stats.eligible > 0
              ? `${stats.readmittedAny} / ${stats.eligible} (${((stats.readmittedAny / stats.eligible) * 100).toFixed(1)}%)`
              : "—"
          }
          highlight={stats.readmittedAny > 0}
        />
        <MetricTile
          label={`Повторная госпитализация, тот же диагноз (≤${READMISSION_WINDOW_DAYS} дней)`}
          value={
            stats.eligibleWithDx > 0
              ? `${stats.readmittedSameDx} / ${stats.eligibleWithDx} (${((stats.readmittedSameDx / stats.eligibleWithDx) * 100).toFixed(1)}%)`
              : "—"
          }
          highlight={stats.readmittedSameDx > 0}
        />
      </SummaryCard>
      <p className="text-xs text-muted-foreground">
        Повторная госпитализация (любая причина) = тот же пациент повторно поступил в течение {READMISSION_WINDOW_DAYS} дней после выписки в этом периоде. Показатель по тому же диагнозу сравнивает основной диагноз при выписке с основным диагнозом при повторной госпитализации в течение того же окна; выписки без указанного основного диагноза исключены из этого знаменателя. Умершие при выписке исключены из обоих показателей.
      </p>
      <div className="h-[60vh] min-h-0">
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          emptyMessage="За этот период подходящих выписок нет."
          viewKey={VIEW_KEY}
          getRowId={(r) => r.id}
        />
      </div>
    </div>
  );
}
