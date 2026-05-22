import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import DocumentPatientHeader from "./DocumentPatientHeader";
import DocumentSection from "./DocumentSection";
import AssignmentsSection from "./AssignmentsSection";
import TemplatePanel from "./TemplatePanel";

interface InnerProps {
  visitServiceId: string;
  patientId: string;
  visitId: string;
  hospitalId: string;
  documentTypeId: string;
  serviceStatusCode: string;
  onClose: () => void;
  existingDoc: any;
  sectionsData: any[];
  fieldsData: any[];
  existingValues: any[];
  patient: any;
  documentType: any;
  mainServices: any[];
  childServices: any[];
  pendingOrders: any[];
  physicianNameMap: Record<string, string>;
  completedByProfile: any;
  visitDate: Date;
  hospitalName: string;
  physicianId: string | null;
}

export default function DocumentWorkspaceInner({
  visitServiceId, patientId, visitId, hospitalId, documentTypeId, serviceStatusCode, onClose,
  existingDoc, sectionsData, fieldsData, existingValues, patient,
  documentType, mainServices, childServices, pendingOrders, physicianNameMap,
  completedByProfile, visitDate, hospitalName, physicianId,
}: InnerProps) {
  const { user } = useAuth();
  const isPhysician = user?.roles?.includes("physician") ?? false;
  const queryClient = useQueryClient();


  const [documentId, setDocumentId] = useState<string | null>(() => existingDoc?.id ?? null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (existingValues || []).forEach((v: any) => {
      m[v.field_definition_id] = v.value ?? "";
    });
    return m;
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState("0");

  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  const documentIdRef = useRef(documentId);
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  const isReadOnly =
    existingDoc?.status === "completed" ||
    (serviceStatusCode !== "ready_for_execution" &&
     serviceStatusCode !== "completed");

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

  const handleSave = async (silent = false): Promise<string | null> => {
    if (!user) return null;
    setIsSaving(true);
    try {
      let docId = documentId;
      if (!docId) {
        const { data: doc, error } = await supabase
          .from("patient_documents")
          .insert({
            patient_id: patientId,
            hospital_id: hospitalId,
            document_type_id: documentTypeId,
            visit_service_id: visitServiceId,
            status: "preliminary",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) { if (!silent) toast.error(error.message); return null; }
        docId = doc!.id;
        setDocumentId(docId);
      }

      const rows = Object.entries(values).map(([fieldId, value]) => ({
        patient_document_id: docId!,
        field_definition_id: fieldId,
        hospital_id: hospitalId,
        value,
        recorded_by: user.id,
      }));
      if (rows.length > 0) {
        const { error: upErr } = await supabase
          .from("patient_document_field_values")
          .upsert(rows, { onConflict: "patient_document_id,field_definition_id" });
        if (upErr) { if (!silent) toast.error(upErr.message); return null; }
      }
      setIsDirty(false);
      if (!silent) toast.success("Сохранено");
      return docId;
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const docId = await handleSave(true);
      if (!docId) return;
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
      queryClient.invalidateQueries({
        queryKey: ["doc-ws-existing", visitServiceId, hospitalId],
      });
      queryClient.invalidateQueries({ queryKey: ["physician-schedule"] });
      onClose();

    } finally {
      setIsConfirming(false);
    }
  };

  // Debounced autosave — fires 2s after last change
  useEffect(() => {
    if (!isDirty || isReadOnly) return;
    const timer = setTimeout(async () => {
      const currentValues = valuesRef.current;
      const currentDocId = documentIdRef.current;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      if (!currentDocId) {
        const { data: doc, error } = await supabase
          .from("patient_documents")
          .insert({
            patient_id: patientId,
            hospital_id: hospitalId,
            document_type_id: documentTypeId,
            visit_service_id: visitServiceId,
            status: "preliminary",
            created_by: session.user.id,
          })
          .select("id")
          .single();
        if (error || !doc) return;
        setDocumentId(doc.id);
        documentIdRef.current = doc.id;
        await supabase
          .from("patient_document_field_values")
          .upsert(
            Object.entries(currentValues).map(([fieldId, value]) => ({
              patient_document_id: doc.id,
              field_definition_id: fieldId,
              hospital_id: hospitalId,
              value,
              recorded_by: session.user.id,
            })),
            { onConflict: "patient_document_id,field_definition_id" }
          );
      } else {
        await supabase
          .from("patient_document_field_values")
          .upsert(
            Object.entries(currentValues).map(([fieldId, value]) => ({
              patient_document_id: currentDocId,
              field_definition_id: fieldId,
              hospital_id: hospitalId,
              value,
              recorded_by: session.user.id,
            })),
            { onConflict: "patient_document_id,field_definition_id" }
          );
      }
      setIsDirty(false);
      queryClient.invalidateQueries({
        queryKey: ["doc-ws-values", documentIdRef.current]
      });
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, isReadOnly]);

  const canConfirm =
    !isReadOnly && allMandatoryFilled && documentId !== null && !isSaving && !isConfirming;

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
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Печать
          </Button>
          {!isReadOnly && isPhysician && (
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
                <DocumentSection
                  section={s}
                  values={values}
                  setVal={setVal}
                  isReadOnly={isReadOnly}
                />
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

          {isReadOnly && existingDoc?.completed_at && (
            <div className="mt-8 pt-4 border-t flex items-end justify-between text-sm">
              <div>
                <span className="text-muted-foreground">Подтверждено: </span>
                <span className="font-medium">
                  {completedByProfile?.full_name ?? "—"}
                </span>
              </div>
              <div className="text-muted-foreground">
                {format(new Date(existingDoc.completed_at), "dd.MM.yyyy HH:mm")}
              </div>
            </div>
          )}
        </div>
        {(!isReadOnly || (physicianId !== null)) && (
          <div className="w-56 shrink-0 print:hidden">
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
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
