import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import DocumentTile from "@/components/documents/DocumentTile";
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

type HospEpisode = { kind: "hospitalization"; id: string; label: string; sortDate: string };
type VisitEpisode = { kind: "visit"; id: string; label: string; sortDate: string; docs: any[] };
type Episode = HospEpisode | VisitEpisode;

// visits.visit_date is a plain date (no time). new Date("2026-09-05") parses
// as UTC midnight, which a timezone behind UTC then rolls back a day when
// displayed. Parsing with an explicit local midnight avoids that shift.
const formatLocalDate = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("ru-RU");

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
  const [expandedHospitalization, setExpandedHospitalization] = useState<string | null>(null);
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

    const [{ data: hospRows, error: hospError }, { data: visitRows, error: visitError }] =
      await Promise.all([
        hospQuery.order("admitted_at", { ascending: false }),
        visitQuery.order("visit_date", { ascending: false }),
      ]);
    if (hospError) console.error("DocumentHistory hospitalizations error:", hospError);
    if (visitError) console.error("DocumentHistory visits error:", visitError);

    const hospEpisodes: HospEpisode[] = (hospRows || []).map((h: any) => ({
      kind: "hospitalization",
      id: h.id,
      label: `${new Date(h.admitted_at).toLocaleDateString("ru-RU")} — ${
        h.discharged_at ? new Date(h.discharged_at).toLocaleDateString("ru-RU") : "текущая"
      }`,
      sortDate: h.admitted_at,
    }));

    // OP visits have no collapse step -- their documents (any status, not
    // just completed, so a patient's in-progress consultations are visible
    // too) are fetched up front, alongside the episode list itself.
    const visitIds = (visitRows || []).map((v: any) => v.id);
    const visitDocsByVisit: Record<string, any[]> = {};
    if (visitIds.length > 0) {
      const { data: visitDocs, error: docsError } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at,
          document_types!inner(id, name_ru, color),
          author:profiles!patient_documents_created_by_fkey(full_name),
          visit_services!patient_documents_visit_service_id_fkey!inner(visit_id)
        `)
        .eq("hospital_id", hospitalId)
        .in("visit_services.visit_id", visitIds)
        .order("created_at", { ascending: false });
      if (docsError) {
        console.error("DocumentHistory OP docs error:", docsError);
      } else {
        (visitDocs || []).forEach((d: any) => {
          const vid = d.visit_services?.visit_id;
          if (!vid) return;
          if (!visitDocsByVisit[vid]) visitDocsByVisit[vid] = [];
          visitDocsByVisit[vid].push(d);
        });
      }
    }

    const visitEpisodes: VisitEpisode[] = (visitRows || []).map((v: any) => ({
      kind: "visit",
      id: v.id,
      label: formatLocalDate(v.visit_date),
      sortDate: v.visit_date,
      docs: visitDocsByVisit[v.id] || [],
    }));

    const merged: Episode[] = [...hospEpisodes, ...visitEpisodes].sort(
      (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
    );
    setEpisodes(merged);
    setHistoryLoading(false);
  };

  const handleExpandHospitalization = async (hospId: string) => {
    if (expandedHospitalization === hospId) {
      setExpandedHospitalization(null);
      return;
    }
    setExpandedHospitalization(hospId);
    if (historicDocs[hospId]) return;
    const { data, error } = await supabase
      .from("patient_documents")
      .select(`
        id, status, created_at,
        document_types!inner(id, name_ru, color),
        author:profiles!patient_documents_created_by_fkey(full_name)
      `)
      .eq("hospitalization_id", hospId)
      .eq("hospital_id", hospitalId)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    if (error) console.error("DocumentHistory hospitalization docs error:", error);
    setHistoricDocs((prev) => ({ ...prev, [hospId]: data || [] }));
  };

  const renderDocTile = (doc: any, isOp: boolean) => (
    <DocumentTile
      key={doc.id}
      doc={doc}
      isOp={isOp}
      isActive={activeDocumentId === doc.id}
      onSelect={() => onSelectDocument(doc.id, doc.document_types?.id)}
    />
  );

  return (
    <div className="pt-3 mt-2 border-t">
      <Button
        variant="ghost"
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
            if (episode.kind === "visit") {
              // Each OP document is its own box -- never merged, grouped by
              // date, or sharing a single background with other documents.
              if (episode.docs.length === 0) return null;
              return (
                <div key={`visit:${episode.id}`} className="space-y-2">
                  {episode.docs.map((doc: any) => renderDocTile(doc, true))}
                </div>
              );
            }

            const isExpanded = expandedHospitalization === episode.id;
            const docs = historicDocs[episode.id];
            return (
              <div key={`hosp:${episode.id}`} className="rounded-[5px] bg-blue-50 p-1.5">
                <Button
                  variant="ghost"
                  onClick={() => handleExpandHospitalization(episode.id)}
                  className="w-full flex items-center gap-1.5 text-xs px-1 py-1.5 rounded hover:bg-background/60 transition-colors"
                >
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                  />
                  <span className="flex-1 text-left font-medium text-muted-foreground">
                    {episode.label}
                  </span>
                  {docs && <span className="text-muted-foreground/60">{docs.length}</span>}
                </Button>
                {isExpanded && (
                  <div className="ml-4 space-y-2">
                    {!docs && (
                      <p className="text-xs text-muted-foreground px-1 py-1">Загрузка...</p>
                    )}
                    {docs && docs.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-1">
                        Нет подтверждённых документов
                      </p>
                    )}
                    {docs && docs.map((doc: any) => renderDocTile(doc, false))}
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
