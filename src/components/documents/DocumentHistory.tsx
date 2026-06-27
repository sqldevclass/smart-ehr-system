import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  activeDocumentId?: string | null;
  onSelectDocument: (documentId: string, documentTypeId: string) => void;
}

export default function DocumentHistory({
  hospitalizationId,
  patientId,
  hospitalId,
  activeDocumentId,
  onSelectDocument,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [historicHospitalizations, setHistoricHospitalizations] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHospitalization, setExpandedHospitalization] = useState<string | null>(null);
  const [historicDocs, setHistoricDocs] = useState<Record<string, any[]>>({});

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
    if (historicDocs[hospId]) return;
    const { data } = await supabase
      .from("patient_documents")
      .select(`
        id, status, created_at,
        document_types!inner(id, name_ru, color)
      `)
      .eq("hospitalization_id", hospId)
      .eq("hospital_id", hospitalId)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    setHistoricDocs((prev) => ({ ...prev, [hospId]: data || [] }));
  };

  return (
    <div className="pt-3 mt-2 border-t">
      <button
        onClick={handleShowHistory}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full px-1 py-1"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`}
        />
        {showHistory ? "Скрыть историю" : "История госпитализаций"}
      </button>
      {showHistory && (
        <div className="mt-2 space-y-1">
          {historyLoading && (
            <p className="text-xs text-muted-foreground px-1">Загрузка...</p>
          )}
          {!historyLoading && historicHospitalizations.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Предыдущих госпитализаций нет
            </p>
          )}
          {historicHospitalizations.map((hosp) => {
            const admittedDate = new Date(hosp.admitted_at).toLocaleDateString("ru-RU");
            const dischargedDate = hosp.discharged_at
              ? new Date(hosp.discharged_at).toLocaleDateString("ru-RU")
              : "текущая";
            const isExpanded = expandedHospitalization === hosp.id;
            const docs = historicDocs[hosp.id];
            return (
              <div key={hosp.id}>
                <button
                  onClick={() => handleExpandHospitalization(hosp.id)}
                  className="w-full flex items-center gap-1.5 text-xs px-1 py-1.5 rounded hover:bg-muted/50 transition-colors"
                >
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                  <span className="flex-1 text-left font-medium text-muted-foreground">
                    {admittedDate} — {dischargedDate}
                  </span>
                  {docs && (
                    <span className="text-muted-foreground/60">{docs.length}</span>
                  )}
                </button>
                {isExpanded && (
                  <div className="ml-4 space-y-0.5">
                    {!docs && (
                      <p className="text-xs text-muted-foreground px-1 py-1">Загрузка...</p>
                    )}
                    {docs && docs.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-1">
                        Нет подтверждённых документов
                      </p>
                    )}
                    {docs &&
                      docs.map((doc: any) => {
                        const isActive = activeDocumentId === doc.id;
                        return (
                          <button
                            key={doc.id}
                            onClick={() =>
                              onSelectDocument(doc.id, doc.document_types?.id)
                            }
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded",
                              "text-xs hover:bg-muted/50",
                              "text-muted-foreground",
                              isActive ? "bg-muted" : ""
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 opacity-60"
                                style={{
                                  backgroundColor: doc.document_types?.color || "#888",
                                }}
                              />
                              <span className="truncate">
                                {doc.document_types?.name_ru}
                              </span>
                            </div>
                            <div className="text-muted-foreground/60 mt-0.5 pl-3.5">
                              {format(new Date(doc.created_at), "dd.MM.yyyy")}
                            </div>
                          </button>
                        );
                      })}
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
