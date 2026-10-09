import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";

// Standalone, read-only document view -- opened in a new browser tab/window
// via the "eye" icon in the physician and nurse document lists (instead of
// the old in-page full-view overlay). Being a fresh page load every time
// means there's no stale component state to fight: it always renders the
// requested document in full-view/read-only mode, even when that same
// document is already open in the main app window.
export default function DocumentViewPage() {
  const { documentId } = useParams<{ documentId: string }>();

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["doc-view", documentId],
    enabled: !!documentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_documents")
        .select("id, patient_id, hospitalization_id, hospital_id, document_type_id, visit_service_id")
        .eq("id", documentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !doc || !doc.hospitalization_id) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Документ не найден или недоступен для просмотра.
      </div>
    );
  }

  return (
    <InpatientDocumentWorkspace
      hospitalizationId={doc.hospitalization_id}
      existingDocumentId={doc.id}
      documentTypeId={doc.document_type_id}
      patientId={doc.patient_id}
      hospitalId={doc.hospital_id}
      visitServiceId={doc.visit_service_id || undefined}
      forceReadOnly
      startInFullView
      onClose={() => window.close()}
    />
  );
