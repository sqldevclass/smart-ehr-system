import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
}

export default function HospitalizationHistory({
  hospitalizationId,
  patientId,
  hospitalId,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [historicHospitalizations, setHistoricHospitalizations] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHospitalization, setExpandedHospitalization] = useState<string | null>(null);
  const [historicPrescriptions, setHistoricPrescriptions] = useState<Record<string, any[]>>({});

  const handleShowHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (historicHospitalizations.length > 0) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from("hospitalizations")
      .select("id, admitted_at, discharged_at")
      .eq("patient_id", patientId)
      .eq("hospital_id", hospitalId)
      .neq("id", hospitalizationId)
      .order("admitted_at", { ascending: false });
    setHistoricHospitalizations(data || []);
    setHistoryLoading(false);
  };

  const handleExpandHospitalization = async (hospId: string) => {
    if (expandedHospitalization === hospId) {
      setExpandedHospitalization(null);
      return;
    }
    setExpandedHospitalization(hospId);
    if (historicPrescriptions[hospId]) return;
    const { data } = await supabase
      .from("drug_prescriptions")
      .select(`
        id, dose, dose_unit, route, duration_days, schedule_times,
        drug_formulary!drug_formulary_id(trade_name, inn)
      `)
      .eq("hospitalization_id", hospId)
      .eq("is_drafted", false)
      .neq("status_code", "cancelled")
      .order("created_at", { ascending: true });
    setHistoricPrescriptions((prev) => ({
      ...prev,
      [hospId]: data || [],
    }));
  };

  return (
    <div className="pt-2">
      <button
        onClick={handleShowHistory}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`}
        />
        {showHistory ? "Скрыть историю" : "История госпитализаций"}
      </button>
      {showHistory && (
        <div className="mt-3 space-y-2">
          {historyLoading && (
            <p className="text-sm text-muted-foreground pl-2">Загрузка...</p>
          )}
          {!historyLoading && historicHospitalizations.length === 0 && (
            <p className="text-sm text-muted-foreground pl-2">
              Предыдущих госпитализаций нет
            </p>
          )}
          {historicHospitalizations.map((hosp) => {
            const admittedDate = new Date(hosp.admitted_at).toLocaleDateString("ru-RU");
            const dischargedDate = hosp.discharged_at
              ? new Date(hosp.discharged_at).toLocaleDateString("ru-RU")
              : "текущая";
            const isExpanded = expandedHospitalization === hosp.id;
            const prescriptions = historicPrescriptions[hosp.id];
            return (
              <div key={hosp.id} className="border rounded-md bg-muted/20">
                <button
                  onClick={() => handleExpandHospitalization(hosp.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors rounded-md"
                >
                  <span className="flex items-center gap-2">
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                    <span className="font-medium">
                      {admittedDate} — {dischargedDate}
                    </span>
                  </span>
                  {prescriptions && (
                    <span className="text-xs text-muted-foreground">
                      {prescriptions.length} назначений
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {!prescriptions && (
                      <p className="text-xs text-muted-foreground">Загрузка...</p>
                    )}
                    {prescriptions && prescriptions.length === 0 && (
                      <p className="text-xs text-muted-foreground">Нет назначений</p>
                    )}
                    {prescriptions &&
                      prescriptions.map((p: any) => (
                        <div
                          key={p.id}
                          className="flex items-baseline gap-2 text-sm text-muted-foreground py-1 border-b last:border-0"
                        >
                          <span className="font-medium text-foreground/70">
                            {p.drug_formulary?.trade_name ?? p.custom_drug_name}
                          </span>
                          <span className="text-xs">
                            {p.dose}
                            {p.dose_unit ? ` ${p.dose_unit}` : ""}
                          </span>
                          <span className="text-xs">·</span>
                          <span className="text-xs">{p.route}</span>
                          <span className="text-xs">·</span>
                          <span className="text-xs">{p.duration_days} дн.</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
