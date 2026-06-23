import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Printer, Bold, Italic, Underline } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import DocumentPatientHeader from "./DocumentPatientHeader";
import DocumentSection from "./DocumentSection";
import DiagnosisTab from "./DiagnosisTab";
import AssignmentsSection from "./AssignmentsSection";
import TemplatePanel from "./TemplatePanel";
import HospRecommendationSection from "./HospRecommendationSection";


interface InnerProps {
  visitServiceId: string;
  patientId: string;
  visitId: string;
  hospitalId: string;
  documentTypeId: string;
  serviceStatusCode: string;
  onClose: () => void;
  onComplete?: (documentId: string) => void;
  sectionsData: any[];
  fieldsData: any[];
  patient: any;
  documentType: any;
  mainServices: any[];
  childServices: any[];
  pendingOrders: any[];
  physicianNameMap: Record<string, string>;
  visitDate: Date;
  hospitalName: string;
  physicianId: string | null;
  isConsultation: boolean;
  visitData: any;
  refetchVisit: () => void;
  hospitalizationId?: string;
  existingDocumentId?: string;
  onDocumentCreated?: (documentId: string) => void;
}

export default function DocumentWorkspaceInner({
  visitServiceId, patientId, visitId, hospitalId, documentTypeId, serviceStatusCode, onClose, onComplete,
  sectionsData, fieldsData, patient,
  documentType, mainServices, childServices, pendingOrders, physicianNameMap,
  visitDate, hospitalName, physicianId,
  isConsultation, visitData, refetchVisit, hospitalizationId, existingDocumentId,
  onDocumentCreated,
}: InnerProps) {


  const { user } = useAuth();
  const isPhysician = user?.roles?.includes("physician") ?? false;
  const queryClient = useQueryClient();


  const [documentId, setDocumentId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [statusLoading, setStatusLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(true);
  const [completedBy, setCompletedBy] = useState<string | null>(null);
  const [docCreatedBy, setDocCreatedBy] = useState<string | null>(null);
  const [docStatus, setDocStatus] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState("0");
  const [hasDiagnosis, setHasDiagnosis] = useState(false);
  const [activeEditable, setActiveEditable] = useState<{
    el: HTMLDivElement;
    onChange: (val: string) => void;
  } | null>(null);

  const handleFocusEditable = (
    el: HTMLDivElement,
    onChange: (val: string) => void
  ) => {
    setActiveEditable({ el, onChange });
  };


  const execOnActive = (command: string) => {
    if (!activeEditable) return;
    activeEditable.el.focus();
    document.execCommand(command, false);
    const text = activeEditable.el.innerText?.trim() ?? "";
    const html = activeEditable.el.innerHTML;
    activeEditable.onChange(text === "" ? "" : html);
  };

  // Refs always hold latest values for async callbacks
  const valuesRef = useRef(values);
  const documentIdRef = useRef<string | null>(documentId);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  // Two-phase load: status first (establishes read-only), then field values
  useEffect(() => {
    const loadDocumentStatus = async () => {
      try {
        if (existingDocumentId) {
          const { data: doc } = await supabase
            .from("patient_documents")
            .select("id, status, completed_by, completed_at, created_by")
            .eq("id", existingDocumentId)
            .single();
          if (doc) {
            setDocumentId(doc.id);
            documentIdRef.current = doc.id;
            setDocStatus(doc.status);
            setDocCreatedBy(doc.created_by);
            setCompletedAt(doc.completed_at);
            if (doc.completed_by) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", doc.completed_by)
                .single();
              setCompletedBy(profile?.full_name ?? null);
            }
          }
        } else if (visitServiceId && visitServiceId.length > 0) {
          const { data: doc } = await supabase
            .from("patient_documents")
            .select("id, status, completed_by, completed_at, created_by")
            .eq("hospital_id", hospitalId)
            .eq("document_type_id", documentTypeId)
            .eq("visit_service_id", visitServiceId)
            .maybeSingle();
          if (doc) {
            setDocumentId(doc.id);
            documentIdRef.current = doc.id;
            setDocStatus(doc.status);
            setDocCreatedBy(doc.created_by);
            setCompletedAt(doc.completed_at);
            if (doc.completed_by) {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", doc.completed_by)
                .single();
              setCompletedBy(profile?.full_name ?? null);
            }
          }
        }
      } finally {
        setStatusLoading(false);
      }
    };

    const loadDocumentFields = async () => {
      try {
        const docId = documentIdRef.current;
        if (!docId) return;
        const { data: fieldValues } = await supabase
          .from("patient_document_field_values")
          .select("field_definition_id, value")
          .eq("patient_document_id", docId);
        const map: Record<string, string> = {};
        (fieldValues || []).forEach((v: any) => {
          map[v.field_definition_id] = v.value ?? "";
        });
        setValues(map);
        valuesRef.current = map;
      } finally {
        setFieldsLoading(false);
      }
    };

    loadDocumentStatus().then(() => {
      loadDocumentFields();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hospitalizationId && !visitId) return;
    const column = hospitalizationId ? "hospitalization_id" : "visit_id";
    const value = hospitalizationId || visitId;
    supabase
      .from("patient_diagnoses")
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .then(({ count }) => {
        setHasDiagnosis((count ?? 0) > 0);
      });
  }, [hospitalizationId, visitId, documentId]);

  const isReadOnly = (() => {
    if (docStatus === "completed") return true;
    if (docStatus === "preliminary" && docCreatedBy !== user?.id) return true;
    if (!hospitalizationId &&
        serviceStatusCode !== "ready_for_execution" &&
        serviceStatusCode !== "completed") return true;
    return false;
  })();




  const sections = useMemo(() => {
    return [...sectionsData]
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        id: s.document_sections.id,
        code: s.document_sections.code,
        name_ru: s.document_sections.name_ru,
        fields: [...fieldsData]
          .filter((f: any) =>
            f.section_id === s.document_sections.id && f.is_visible !== false
          )
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((f: any) => ({
            is_mandatory: f.is_mandatory,
            def: f.field_definitions,
          })),
      }))
      .filter((s) => s.fields.length > 0);
  }, [sectionsData, fieldsData]);

  const isOnDiagnosisTab = sections[parseInt(activeTab)]?.code === "diagnosis";

  const allMandatoryFilled = useMemo(() => {
    for (const s of sections) {
      for (const f of s.fields) {
        if (f.is_mandatory) {
          const v = values[f.def.id];
          if (v === undefined || v === null || String(v).trim() === "") return false;
        }
      }
    }
    return true;
  }, [sections, values]);

  const setVal = (id: string, val: string) => {
    setValues((p) => ({ ...p, [id]: val }));
    setIsDirty(true);
  };

  // Save field values to DB
  const persistValues = useCallback(async (
    docId: string,
    vals: Record<string, string>
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from("patient_document_field_values")
      .upsert(
        Object.entries(vals).map(([fieldId, value]) => ({
          patient_document_id: docId,
          field_definition_id: fieldId,
          hospital_id: hospitalId,
          value,
          recorded_by: session.user.id,
        })),
        { onConflict: "patient_document_id,field_definition_id" }
      );
  }, [hospitalId]);

  // Create document row if it doesn't exist yet
  const ensureDocument = useCallback(async (): Promise<string | null> => {
    if (documentIdRef.current) {
      return documentIdRef.current;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: doc, error } = await supabase
      .from("patient_documents")
      .insert({
        patient_id: patientId,
        hospital_id: hospitalId,
        document_type_id: documentTypeId,
        visit_service_id: visitServiceId && visitServiceId.length > 0 ? visitServiceId : null,
        hospitalization_id: hospitalizationId || null,
        status: "preliminary",
        created_by: session.user.id,
      })
      .select("id")
      .single();
    if (error || !doc) return null;
    setDocumentId(doc.id);
    documentIdRef.current = doc.id;
    onDocumentCreated?.(doc.id);
    return doc.id;
  }, [patientId, hospitalId, documentTypeId, visitServiceId, hospitalizationId, onDocumentCreated]);


  // Debounced autosave — 2s after last change
  useEffect(() => {
    if (!isDirty || isReadOnly) return;
    const timer = setTimeout(async () => {
      const vals = valuesRef.current;
      let docId = documentIdRef.current;
      if (!docId) {
        docId = await ensureDocument();
        if (!docId) return;
      }
      await persistValues(docId, vals);
      setIsDirty(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [values, isDirty, isReadOnly, ensureDocument, persistValues]);

  // Create document immediately on mount for new docs
  useEffect(() => {
    if (!existingDocumentId && !isReadOnly) {
      ensureDocument();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      let docId = documentIdRef.current;
      if (!docId) {
        docId = await ensureDocument();
        if (!docId) {
          toast.error("Не удалось создать документ. Попробуйте ещё раз.");
          return;
        }
      }
      await persistValues(docId, valuesRef.current);
      setIsDirty(false);
      const { error } = await supabase.rpc("complete_document", { p_document_id: docId });
      if (error) {
        const raw = error.message || "";
        let friendly = raw;
        const prefixMatch = raw.match(/complete_document failed: (.+)/);
        if (prefixMatch) friendly = prefixMatch[1];
        if (friendly.includes("pending child services")) {
          const servicesMatch = friendly.match(/pending child services: (.+)/);
          const serviceList = servicesMatch ? servicesMatch[1] : "";
          toast.error(
            `Невозможно подтвердить документ. Следующие услуги ещё не завершены: ${serviceList}`,
            { duration: 6000 }
          );
        } else if (friendly.includes("Mandatory fields not filled")) {
          const fieldsMatch = friendly.match(/Mandatory fields not filled: (.+)/);
          const fieldList = fieldsMatch ? fieldsMatch[1] : "";
          toast.error(`Заполните обязательные поля: ${fieldList}`, { duration: 6000 });
        } else {
          toast.error(friendly, { duration: 6000 });
        }
        return;
      }
      toast.success("Документ подтверждён");
      setDocStatus("completed");
      setCompletedAt(new Date().toISOString());
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", session.user.id)
          .single();
        setCompletedBy(profile?.full_name ?? null);
      }
      queryClient.invalidateQueries({ queryKey: ["physician-schedule"] });
      if (docId) onComplete?.(docId);
      // Do NOT call onClose() — component stays mounted
      // and re-renders with isReadOnly = true from docStatus
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm =
    isDirty && !isReadOnly && allMandatoryFilled && !isConfirming;

  // TEMP DEBUG
  console.log("canConfirm debug:", {
    isDirty,
    isReadOnly,
    allMandatoryFilled,
    isConfirming,
    docStatus,
    docCreatedBy,
    userId: user?.id,
    sameUser: docCreatedBy === user?.id,
    hospitalizationId,
    serviceStatusCode,
    mandatoryFields: sections.flatMap(s =>
      s.fields.filter((f: any) => f.is_mandatory).map((f: any) => ({
        id: f.def?.id,
        label: f.def?.label_ru,
        value: values[f.def?.id],
        filled: !!(values[f.def?.id]?.trim())
      }))
    )
  });

  if (statusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">

      {serviceStatusCode === "preliminary" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-800 text-sm">
          <span>⏳</span>
          <span>Услуга ожидает оплаты. Документ доступен только для просмотра.</span>
        </div>
      )}
      {/* Toolbar */}
      <div className="document-toolbar flex items-center justify-between border-b px-4 py-2 bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Назад
          </Button>
          <span
            className="font-heading font-semibold"
            style={{ color: documentType?.color || undefined }}
          >
            {documentType?.name_ru}
          </span>
          {isReadOnly && serviceStatusCode !== "preliminary" && (
            <Badge className="bg-green-600 hover:bg-green-600 text-white">Завершено</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 pr-2 mr-1 border-r print:hidden">
            <button
              type="button"
              disabled={!activeEditable}
              onMouseDown={(e) => { e.preventDefault(); execOnActive("bold"); }}
              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title="Жирный (Ctrl+B)"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!activeEditable}
              onMouseDown={(e) => { e.preventDefault(); execOnActive("italic"); }}
              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title="Курсив (Ctrl+I)"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!activeEditable}
              onMouseDown={(e) => { e.preventDefault(); execOnActive("underline"); }}
              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title="Подчёркнутый (Ctrl+U)"
            >
              <Underline className="h-3.5 w-3.5" />
            </button>
          </div>
          {isDirty && !isReadOnly && (
            <span className="text-xs text-muted-foreground">
              Сохранение...
            </span>
          )}
          {!isDirty && documentId && !isReadOnly && (
            <span className="text-xs text-muted-foreground">
              Сохранено
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Печать
          </Button>
          {!isReadOnly && (
            <Button size="sm" onClick={handleConfirm} disabled={!canConfirm}>
              {isConfirming ? "..." : "Подтвердить"}
            </Button>
          )}

        </div>
      </div>


      {/* Tabs */}
      <div className="document-tabs-bar border-b bg-card px-4 overflow-x-auto">
        <div className="flex">
          {sections.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveTab(String(i))}
              className={cn(
                "px-4 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                activeTab === String(i)
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {s.name_ru}
            </button>
          ))}
        </div>
      </div>

      {/* A4 Document Area */}
      <div className="document-page-bg flex-1 overflow-y-auto bg-muted/30 p-6 document-print-area">
        <div className="flex gap-4 justify-center items-start">
        <div className="document-a4-card max-w-[210mm] w-full bg-card rounded-md shadow-sm border p-8">
          <DocumentPatientHeader />


          {sections.map((s, i) => {
            const hasFilledFields = s.fields.some(
              (f: any) => values[f.def.id]?.trim()
            );
            const baseClass =
              activeTab === String(i)
                ? "document-print-section"
                : "document-print-section document-section-hidden-for-print hidden print:block";
            return (
              <div
                key={s.id}
                className={cn(
                  baseClass,
                  isReadOnly && !hasFilledFields && "print-hide-empty"
                )}
              >
                {i === 0 ? (
                  <div
                    className="mb-4 pb-4 border-b border-gray-200 print-patient-header"
                    style={{ display: "none" }}
                  >
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div>
                        <span className="text-gray-500">Пациент: </span>
                        <span className="font-medium">
                          {patient.last_name} {patient.first_name} {patient.middle_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">П#: </span>
                        <span>{patient.patient_number}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">ДР: </span>
                        <span>
                          {patient.date_of_birth
                            ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Пол: </span>
                        <span>{patient.gender || "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Телефон: </span>
                        <span>{patient.phone || "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Визит: </span>
                        <span>{format(visitDate, "dd.MM.yyyy")}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-xs text-gray-400 mb-3 print-patient-compact"
                    style={{ display: "none" }}
                  >
                    {patient.last_name} {patient.first_name} | ДР:{" "}
                    {patient.date_of_birth
                      ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
                      : "—"}
                  </div>
                )}
                {s.code === "diagnosis" ? (
                  <DiagnosisTab
                    hospitalizationId={hospitalizationId}
                    visitId={visitId}
                    patientId={patientId}
                    hospitalId={hospitalId}
                    documentId={documentId}
                    documentTypeId={documentTypeId}
                    isReadOnly={isReadOnly}
                    currentUserId={user!.id}
                  />
                ) : (
                  <DocumentSection
                    section={s}
                    values={values}
                    setVal={setVal}
                    isReadOnly={isReadOnly}
                    onFocusEditable={handleFocusEditable}
                    
                  />
                )}
                {s.code === "treatment_plan" && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <AssignmentsSection
                      mainServices={mainServices}
                      childServices={childServices}
                      pendingOrders={pendingOrders}
                      physicianNameMap={physicianNameMap}
                      isReadOnly={isReadOnly}
                      patientId={patientId}
                      hospitalId={hospitalId}
                      visitId={visitId}
                      visitServiceId={visitServiceId}
                      onOrderCreated={() => {
                        queryClient.invalidateQueries({ queryKey: ["doc-ws-main", visitId, hospitalId] });
                        queryClient.invalidateQueries({ queryKey: ["doc-ws-child", visitId, hospitalId] });
                        queryClient.invalidateQueries({ queryKey: ["doc-ws-pending", visitServiceId, hospitalId] });
                      }}
                    />
                    {isConsultation && (
                      <HospRecommendationSection
                        visitId={visitId}
                        hospitalId={hospitalId}
                        isReadOnly={isReadOnly}
                        visitData={visitData}
                        onSaved={refetchVisit}
                      />
                    )}
                  </div>
                )}

              </div>
            );
          })}

          {!sections.some((s) => s.code === "treatment_plan") && (
            <div
              className={
                activeTab === String(sections.length - 1)
                  ? "document-print-section mt-8 pt-6 border-t border-gray-200"
                  : "document-print-section document-section-hidden-for-print hidden print:block mt-8 pt-6 border-t border-gray-200"
              }
            >
              <AssignmentsSection
                mainServices={mainServices}
                childServices={childServices}
                pendingOrders={pendingOrders}
                physicianNameMap={physicianNameMap}
                isReadOnly={isReadOnly}
                patientId={patientId}
                hospitalId={hospitalId}
                visitId={visitId}
                visitServiceId={visitServiceId}
                onOrderCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ["doc-ws-main", visitId, hospitalId] });
                  queryClient.invalidateQueries({ queryKey: ["doc-ws-child", visitId, hospitalId] });
                  queryClient.invalidateQueries({ queryKey: ["doc-ws-pending", visitServiceId, hospitalId] });
                }}
              />
            </div>
          )}

          {isReadOnly && completedAt && (
            <div className="mt-8 pt-4 border-t flex items-end justify-between text-sm">
              <div>
                <span className="text-muted-foreground">Подтверждено: </span>
                <span className="font-medium">
                  {completedBy ?? "—"}
                </span>
              </div>
              <div className="text-muted-foreground">
                {format(new Date(completedAt), "dd.MM.yyyy HH:mm")}
              </div>
            </div>
          )}
        </div>
        {(!isReadOnly || (physicianId !== null)) && (
          <div className="w-56 shrink-0 print:hidden">
            {isOnDiagnosisTab ? (
              <DiagnosisHistoryPanel
                patientId={patientId}
                hospitalizationId={hospitalizationId ?? ""}
                hospitalId={hospitalId}
                isReadOnly={isReadOnly}
                onCopy={async (d) => {
                  await supabase.from("patient_diagnoses").insert({
                    patient_id: patientId,
                    hospital_id: hospitalId,
                    hospitalization_id: hospitalizationId || null,
                    icd10_code: d.icd10_code,
                    diagnosis_type: d.diagnosis_type,
                    notes: d.notes || null,
                    recorded_by: user!.id,
                  });
                }}
              />
            ) : (
              <TemplatePanel
                documentTypeId={documentTypeId}
                hospitalId={hospitalId}
                physicianId={physicianId}
                patientId={patientId}
                currentDocumentId={documentId}
                values={values}
                sections={sections}
                onApply={(templateValues) => {
                  setValues((prev) => ({ ...prev, ...templateValues }));
                  setIsDirty(true);
                }}
                isReadOnly={isReadOnly}
              />
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function DiagnosisHistoryPanel({
  patientId, hospitalizationId, hospitalId, isReadOnly, onCopy,
}: {
  patientId: string;
  hospitalizationId: string;
  hospitalId: string;
  isReadOnly: boolean;
  onCopy: (d: any) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [copying, setCopying] = useState<string | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["doc-diag-history", patientId, hospitalizationId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name),
          hospitalizations!hospitalization_id(
            hospitalization_number, admitted_at
          )
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .neq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  const { data: otherPhysicianDiags = [] } = useQuery({
    queryKey: ["doc-diag-other-physicians", hospitalizationId],
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name)
        `)
        .eq("hospital_id", hospitalId)
        .eq("hospitalization_id", hospitalizationId)
        .neq("recorded_by", session.user.id)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  const diagTypeLabel = (t: string) => ({
    main: "Основной", complication: "Осложнение",
    competing: "Конкурирующий", background: "Фоновый",
    comorbid: "Сопутствующий",
  }[t] ?? t);

  const handleCopy = async (d: any) => {
    setCopying(d.id);
    try {
      await onCopy(d);
      qc.invalidateQueries({ queryKey: ["doc-diagnoses"] });
    } finally {
      setCopying(null);
    }
  };

  const renderDiag = (d: any, showHosp = false) => (
    <div key={d.id} className="border rounded p-2 mb-2 text-xs space-y-0.5 group relative">
      <div className="text-[10px] text-muted-foreground uppercase">
        {diagTypeLabel(d.diagnosis_type)}
      </div>
      <div className="font-medium leading-tight">
        {d.icd10_codes?.code} — {d.icd10_codes?.name_ru}
      </div>
      <div className="text-muted-foreground text-[10px]">
        {d.profiles?.full_name}
        {showHosp && d.hospitalizations && (
          <span> · {d.hospitalizations.hospitalization_number}</span>
        )}
      </div>
      {!isReadOnly && (
        <button
          onClick={() => handleCopy(d)}
          disabled={copying === d.id}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-primary text-[10px] border rounded px-1.5 py-0.5 bg-white hover:bg-primary hover:text-white transition-all disabled:opacity-50"
        >
          {copying === d.id ? "..." : "+ Добавить"}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3 text-xs">
      <div className="font-semibold text-sm">История диагнозов</div>
      {otherPhysicianDiags.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase mb-1">
            Текущая госпитализация
          </div>
          {otherPhysicianDiags.map((d: any) => renderDiag(d, false))}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase mb-1">
            Предыдущие госпитализации
          </div>
          {history.map((d: any) => renderDiag(d, true))}
        </div>
      )}
      {history.length === 0 && otherPhysicianDiags.length === 0 && (
        <p className="text-muted-foreground text-xs">История пуста</p>
      )}
    </div>
  );
}
