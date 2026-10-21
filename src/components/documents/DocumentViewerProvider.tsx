import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import LargeModal from "@/components/shared/LargeModal";
import DocumentViewer from "@/components/documents/DocumentViewer";

interface DocumentViewerContextValue {
  openDocument: (documentId: string) => void;
}

const DocumentViewerContext = createContext<DocumentViewerContextValue | null>(null);

// One app-wide read-only document pop-up. Any component calls
// useDocumentViewer().openDocument(id) -- no prop drilling.
export function DocumentViewerProvider({ children }: { children: ReactNode }) {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const close = useCallback(() => setDocumentId(null), []);
  const value = useMemo(() => ({ openDocument: (id: string) => setDocumentId(id) }), []);

  return (
    <DocumentViewerContext.Provider value={value}>
      {children}
      <LargeModal open={!!documentId} onOpenChange={(o) => !o && close()} title="Просмотр документа">
        {/* key: fresh mount per document, unmounted on close -- no stale state */}
        {documentId && <DocumentViewer key={documentId} documentId={documentId} onClose={close} />}
      </LargeModal>
    </DocumentViewerContext.Provider>
  );
}

export function useDocumentViewer(): DocumentViewerContextValue {
  const ctx = useContext(DocumentViewerContext);
  if (!ctx) throw new Error("useDocumentViewer must be used inside DocumentViewerProvider");
  return ctx;
}
