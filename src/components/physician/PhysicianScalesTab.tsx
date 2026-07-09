import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  cvc: "Мониторинг ЦВК",
  tracheostomy: "Мониторинг трахеостомы",
  ventilator: "Мониторинг пациента на ИВЛ",
  urinary_catheter: "Мониторинг мочевого катетера",
  postop_wound: "Мониторинг послеоперационной раны",
};

const fmt = (d: string | Date) => format(new Date(d), "dd.MM HH:mm");

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">
      {children}
    </div>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between text-sm py-1 border-b last:border-0", className)}>
      {children}
    </div>
  );
}

export default function PhysicianScalesTab({ hospitalizationId }: Props) {
  const { data: assessments = [] } = useQuery({
    queryKey: ["phys-scales-assessments", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_assessments")
        .select("id, total_score, risk_level, assessed_at, assessment_scales!inner(code, name_ru)")
        .eq("hospitalization_id", hospitalizationId)
        .order("assessed_at", { ascending: false });
      return data || [];
    },
  });

  const { data: latestGlucose } = useQuery({
    queryKey: ["phys-scales-glucose", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("blood_glucose_readings")
        .select("value_mmol, recorded_at")
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: fluidEntries = [] } = useQuery({
    queryKey: ["phys-scales-fluid", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fluid_balance_entries")
        .select("entry_type, volume_ml, recorded_at")
        .eq("hospitalization_id", hospitalizationId);
      return data || [];
    },
  });

  const { data: deviceRecords = [] } = useQuery({
    queryKey: ["phys-scales-devices", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nurse_device_monitoring_records")
        .select("form_type, device_label, recorded_at, criticality_flag")
        .eq("hospitalization_id", hospitalizationId)
        .is("removed_at", null)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  const { data: dailyNotes = [] } = useQuery({
    queryKey: ["phys-scales-notes", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nursing_daily_notes")
        .select("note_text, recorded_at")
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false })
        .limit(3);
      return data || [];
    },
  });

  // Latest per scale
  const latestAssessments = (() => {
    const map = new Map<string, any>();
    for (const a of assessments as any[]) {
      const code = a.assessment_scales?.code;
      if (!code) continue;
      if (!map.has(code)) map.set(code, a);
    }
    return Array.from(map.values());
  })();

  // Fluid balance
  let fluidRow: { intake: number; output: number; latest: string } | null = null;
  if (fluidEntries.length > 0) {
    let intake = 0;
    let output = 0;
    let latest = fluidEntries[0].recorded_at as string;
    for (const f of fluidEntries as any[]) {
      if (f.entry_type === "intake") intake += Number(f.volume_ml) || 0;
      if (f.entry_type === "output") output += Number(f.volume_ml) || 0;
      if (new Date(f.recorded_at) > new Date(latest)) latest = f.recorded_at;
    }
    fluidRow = { intake, output, latest };
  }

  // Latest device per (form_type, device_label)
  const latestDevices = (() => {
    const map = new Map<string, any>();
    for (const r of deviceRecords as any[]) {
      const key = `${r.form_type}::${r.device_label ?? ""}`;
      if (!map.has(key)) map.set(key, r);
    }
    return Array.from(map.values());
  })();

  const truncate = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "…" : s);

  const hasAssessments = latestAssessments.length > 0;
  const hasGlucose = !!latestGlucose;
  const hasFluid = !!fluidRow;
  const hasDevices = latestDevices.length > 0;
  const hasNotes = dailyNotes.length > 0;

  return (
    <div className="p-4 space-y-4">
      {hasAssessments && (
        <div>
          <SectionHeader>Оценки</SectionHeader>
          {latestAssessments.map((a: any) => (
            <Row key={a.id}>
              <span>
                {a.assessment_scales?.name_ru}: {a.total_score} баллов
                {a.risk_level ? ` (${a.risk_level})` : ""}
              </span>
              <span className="text-muted-foreground">{fmt(a.assessed_at)}</span>
            </Row>
          ))}
        </div>
      )}

      {hasGlucose && (
        <div>
          <SectionHeader>Глюкоза крови</SectionHeader>
          <Row>
            <span>{(latestGlucose as any).value_mmol} ммоль/л</span>
            <span className="text-muted-foreground">
              {fmt((latestGlucose as any).recorded_at)}
            </span>
          </Row>
        </div>
      )}

      {hasFluid && fluidRow && (
        <div>
          <SectionHeader>Баланс жидкости</SectionHeader>
          <Row>
            <span>
              Введено {fluidRow.intake} мл / Выделено {fluidRow.output} мл
            </span>
            <span className="text-muted-foreground">{fmt(fluidRow.latest)}</span>
          </Row>
        </div>
      )}

      {hasDevices && (
        <div>
          <SectionHeader>Мониторинг</SectionHeader>
          {latestDevices.map((r: any, i: number) => {
            const label = FORM_TYPE_LABELS[r.form_type] ?? r.form_type;
            const suffix = r.device_label ? ` (${r.device_label})` : "";
            return (
              <Row
                key={`${r.form_type}-${r.device_label ?? ""}-${i}`}
                className={r.criticality_flag ? "text-red-700" : ""}
              >
                <span>{label}{suffix}</span>
                <span className={r.criticality_flag ? "" : "text-muted-foreground"}>
                  {fmt(r.recorded_at)}
                </span>
              </Row>
            );
          })}
        </div>
      )}

      {hasNotes && (
        <div>
          <SectionHeader>Дневниковые записи</SectionHeader>
          {(dailyNotes as any[]).map((n, i) => (
            <Row key={i}>
              <span>
                <span className="text-muted-foreground">{fmt(n.recorded_at)}:</span>{" "}
                {truncate(n.note_text ?? "")}
              </span>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}
