import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  // The one OP visit already shown live in the main panel (if any) -- left
  // out of history so it isn't listed twice.
  excludeVisitId?: string;
  activeDocumentId?: string | null;
  onSelectDocument: (documentId: string, documentTypeId: string) => void;
}

type Episode = {
  kind: "hospitalization" | "visit";
  id: string;
  label: string;
};

export default function DocumentHistory({
  hospitalizationId,
  patientId,
  hospitalId,
  excludeVisitId,
  activeDocumentId,
  onSelectDocument,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedEpisode, setExpandedEpisode] = useState<string | null>(null);
  const [historicDocs, setHistoricDocs] = useState<Record<string, any[]>>({});

  const handleShowHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (episodes.length > 0) return;
    setHistoryLoading(true);

    let hospQuery = supabase
      .from("hospitalizations")
      .select("id, admitted_at, discharged_at")
      .eq("patient_id", patientId)
      .eq("hospital_id", hospitalId);
    if (hospitalizationId) hospQuery = hospQuery.neq("id", hospitalizationId);
    let visitQuery = supabase
      .from("visits")
      .select("id, visit_date")
      .eq("patient_id", patientId)
      .eq("hospital_id", hospitalId);
    if (excludeVisitId) visitQuery = visitQuery.neq("id", excludeVisitId);

    const [{ data: hospRows }, { data: visitRows }] = await Promise.all([
      hospQuery.order("admitted_at", { ascending: false }),
      visitQuery.order("visit_date", { ascending: false }),
    ]);

    const hospEpisodes: (Episode & { sortDate: string })[] = (hospRows || []).map(
      (h: any) => ({
        kind: "hospitalization",
        id: h.id,
        label: `${new Date(h.admitted_at).toLocaleDateString("ru-RU")} — ${
          h.discharged_at
            ? new Date(h.discharged_at).toLocaleDateString("ru-RU")
            : "текущая"
        }`,
        sortDate: h.admitted_at,
      })
    );
    const visitEpisodes: (Episode & { sortDate: string })[] = (visitRows || []).map(
      (v: any) => ({
        kind: "visit",
        id: v.id,
        label: new Date(v.visit_date).toLocaleDateString("ru-RU"),
        sortDate: v.visit_date,
      })
    );

    const merged = [...hospEpisodes, ...visitEpisodes].sort(
      (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );
    setEpisodes(merged);
    setHistoryLoading(false);
  };

  const handleExpandEpisode = async (episode: Episode) => {
    const key = `${episode.kind}:${episode.id}`;
    if (expandedEpisode === key) {
      setExpandedEpisode(null);
      return;
    }
    setExpandedEpisode(key);
    if (historicDocs[key]) return;

    let query = supabase
      .from("patient_documents")
      .select(`
        id, status, created_at,
        document_types!inner(id, name_ru, color)
        ${episode.kind === "visit" ? ", visit_services!inner(visit_id)" : ""}
      `)
      .eq("hospital_id", hospitalId)
      .eq("status", "completed");

    query =
      episode.kind === "hospitalization"
        ? query.eq("hospitalization_id", episode.id)
        : query.eq("visit_services.visit_id", episode.id);

    const { data } = await query.order("created_at", { ascending: false });
    setHistoricDocs((prev) => ({ ...prev, [key]: data || [] }));
  };

  return (
    <div className="pt-3 mt-2 border-t">
      <Button variant="ghost"
        onClick={handleShowHistory}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full px-1 py-1"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`}
        />
        {showHistory ? "Скрыть историю" : "История"}
      </Button>
      {showHistory && (
        <div className="mt-2 space-y-2">
          {historyLoading && (
            <p className="text-xs text-muted-foreground px-1">Загрузка...</p>
          )}
          {!historyLoading && episodes.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">
              Предыдущих госпитализаций и визитов нет
            </p>
          )}
          {episodes.map((episode) => {
            const key = `${episode.kind}:${episode.id}`;
            const isExpanded = expandedEpisode === key;
            const docs = historicDocs[key];
            const isOp = episode.kind === "visit";
            return (
              <div key={key} className="rounded-[5px] bg-primary/5 p-1.5">
                <Button variant="ghost"
                  onClick={() => handleExpandEpisode(episode)}
                  className="w-full flex items-center gap-1.5 text-xs px-1 py-1.5 rounded hover:bg-background/60 transition-colors"
                >
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                  {isOp && (
                    <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                      OP
                    </span>
                  )}
                  <span className="flex-1 text-left font-medium text-muted-foreground">
                    {episode.label}
                  </span>
                  {docs && (
                    <span className="text-muted-foreground/60">{docs.length}</span>
                  )}
                </Button>
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
                          <Button variant="ghost"
                            key={doc.id}
                            onClick={() =>
                              onSelectDocument(doc.id, doc.document_types?.id)
                            }
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded",
                              "text-xs hover:bg-background/60",
                              "text-muted-foreground",
                              isActive ? "bg-background" : ""
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 opacity-60"
                                style={{
                                  backgroundColor: doc.document_types?.color || "#888",
                                }}
                              />
                              {isOp && (
                                <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-primary/15 text-primary shrink-0">
                                  OP
                                </span>
                              )}
                              <span className="truncate">
                                {doc.document_types?.name_ru}
                              </span>
                            </div>
                            <div className="text-muted-foreground/60 mt-0.5 pl-3.5">
                              {format(new Date(doc.created_at), "dd.MM.yyyy")}
                            </div>
                          </Button>
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
