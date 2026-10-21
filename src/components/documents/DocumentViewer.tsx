import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";

interface DocumentViewerProps {
  documentId: string;
  onClose: () => void;
}

// Read-only full view of any document (IP or OP), filling its parent container.
// Scope (hospitalization / visit service) is derived by DocumentWorkspace from the
// document's own saved FK columns, so OP documents work too.
export default function DocumentViewer({ documentId, onClose }: DocumentViewerProps) {
  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["doc-view", documentId],
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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !doc) {
    if (error) console.error("DocumentViewer load error:", error);
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Документ не найден или недоступен для просмотра.
      </div>
    );
  }

  return (
    <InpatientDocumentWorkspace
      hospitalizationId={doc.hospitalization_id ?? ""}
      existingDocumentId={doc.id}
      documentTypeId={doc.document_type_id}
      patientId={doc.patient_id}
      hospitalId={doc.hospital_id}
      visitServiceId={doc.visit_service_id || undefined}
      forceReadOnly
      embedded
      onClose={onClose}
    />
  );
}
