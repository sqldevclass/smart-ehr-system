import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";
import DocumentHistory from "@/components/documents/DocumentHistory";

interface Props {
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  isReadOnly?: boolean;
}

export default function PatientDocumentSidebar({
  hospitalizationId,
  patientId,
  hospitalId,
  userId,
  isReadOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const [activeDoc, setActiveDoc] = useState<{
    documentId: string | null;
    documentTypeId: string;
    forceReadOnly?: boolean;
  } | null>(null);
  const [showCreatePicker, setShowCreatePicker] = useState(false);

  const { data: thisDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ["patient-doc-sidebar-docs", hospitalizationId, hospitalId],
    enabled: !!hospitalizationId && !!hospitalId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at, completed_at, created_by,
          document_types!inner(id, name_ru, color)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("hospital_id", hospitalId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: documentTypes = [] } = useQuery({
    queryKey: ["doc-types-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color")
        .eq("is_active", true)
        .order("name_ru");
      return data || [];
    },
  });

  const { data: docPrivileges = [] } = useQuery({
    queryKey: ["user-doc-privileges", userId, hospitalId],
    enabled: !!userId && !!hospitalId,
    queryFn: async () => {
      // Resolve user → person → staff_roles → privileges
      const { data: profile } = await supabase
        .from("profiles")
        .select("person_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.person_id) return [];
      const { data: staffRoles } = await supabase
        .from("staff_roles")
        .select("id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", hospitalId)
        .eq("is_active", true);
      if (!staffRoles || staffRoles.length === 0) return [];
      const staffRoleIds = staffRoles.map((sr: any) => sr.id);
      const { data } = await supabase
        .from("physician_document_privileges")
        .select("document_type_id")
        .in("staff_role_id", staffRoleIds)
        .eq("hospital_id", hospitalId);
      return data || [];
    },
  });

  const allowedDocTypeIds = new Set(
    docPrivileges.map((p: any) => p.document_type_id)
  );
  const allowedDocTypes = documentTypes.filter((dt: any) =>
    allowedDocTypeIds.has(dt.id)
  );


  return (
    <div className="flex h-full w-full">
      {/* Left sidebar */}
      <div className="w-64 shrink-0 border-r flex flex-col">
        {!isReadOnly && (
          <div className="p-2 border-b relative">
            <button
              onClick={() => setShowCreatePicker(!showCreatePicker)}
              className="w-full text-sm px-2 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90"
            >
              + Создать
            </button>
            {showCreatePicker && (
              <div className="absolute left-2 right-2 top-full mt-1 z-10 bg-popover border rounded shadow-md p-1 max-h-64 overflow-y-auto">
                {allowedDocTypes.map((dt: any) => (
                  <button
                    key={dt.id}
                    onClick={() => {
                      setActiveDoc({
                        documentId: null,
                        documentTypeId: dt.id,
                      });
                      setShowCreatePicker(false);
                    }}
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: dt.color }}
                    />
                    {dt.name_ru}
                  </button>
                ))}
                {allowedDocTypes.length === 0 && (
                  <div className="text-xs text-muted-foreground p-2">
                    Нет доступных типов
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {thisDocs.length === 0 && (
            <div className="text-xs text-muted-foreground p-2">
              Нет документов
            </div>
          )}
          {thisDocs.map((doc: any) => {
            const isActive = activeDoc?.documentId === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() =>
                  setActiveDoc({
                    documentId: doc.id,
                    documentTypeId: doc.document_types?.id,
                  })
                }
                className={cn(
                  "w-full text-left px-2 py-2 rounded text-sm hover:bg-muted/50 mb-1",
                  isActive ? "bg-muted" : ""
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: doc.document_types?.color || "#888" }}
                  />
                  <span className="flex-1 truncate">
                    {doc.document_types?.name_ru}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 pl-4">
                  {format(new Date(doc.created_at), "dd.MM.yyyy HH:mm")}
                </div>
              </button>
            );
          })}

          {/* Historical hospitalizations */}
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
                              const isActive = activeDoc?.documentId === doc.id;
                              return (
                                <button
                                  key={doc.id}
                                  onClick={() =>
                                    setActiveDoc({
                                      documentId: doc.id,
                                      documentTypeId: doc.document_types?.id,
                                      forceReadOnly: true,
                                    })
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
        </div>
      </div>

      {/* Right — workspace */}
      <div className="flex-1 overflow-auto">
        {activeDoc ? (
          <InpatientDocumentWorkspace
            key={activeDoc.documentId ?? `new-${activeDoc.documentTypeId}`}
            hospitalizationId={hospitalizationId}
            existingDocumentId={activeDoc.documentId ?? undefined}
            documentTypeId={activeDoc.documentTypeId}
            patientId={patientId}
            hospitalId={hospitalId}
            forceReadOnly={isReadOnly || !!activeDoc?.forceReadOnly}
            onClose={() => {
              setActiveDoc(null);
              refetchDocs();
              queryClient.invalidateQueries({
                queryKey: ["patient-doc-sidebar-docs", hospitalizationId, hospitalId],
              });
            }}
            onDocumentCreated={(newDocId) => {
              setActiveDoc((prev) =>
                prev ? { ...prev, documentId: newDocId } : null
              );
              queryClient.invalidateQueries({
                queryKey: ["patient-doc-sidebar-docs", hospitalizationId, hospitalId],
              });
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">
              Выберите документ или нажмите "+ Создать"
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
