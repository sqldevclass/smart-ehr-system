import { useEffect, useMemo, useState } from "react";
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

interface InnerProps {
  visitServiceId: string;
  patientId: string;
  visitId: string;
  hospitalId: string;
  documentTypeId: string;
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
}

export default function DocumentWorkspaceInner({
  visitServiceId, patientId, visitId, hospitalId, documentTypeId, onClose,
  existingDoc, sectionsData, fieldsData, existingValues, patient,
  documentType, mainServices, childServices, pendingOrders, physicianNameMap,
  completedByProfile, visitDate, hospitalName,
}: InnerProps) {
  const { user } = useAuth();
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

  const isReadOnly = existingDoc?.status === "completed";

  const sections = useMemo(() => {
    return [...sectionsData]
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        id: s.document_sections.id,
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
      if (error) { toast.error(error.message); return; }
      toast.success("Документ подтверждён");
      onClose();
    } finally {
      setIsConfirming(false);
    }
  };

  // Debounced autosave — fires 2s after last change
  useEffect(() => {
    if (!isDirty || isReadOnly) return;
    const timer = setTimeout(async () => {
      if (isReadOnly) return;
      if (!documentId) {
        const { data: doc, error } = await supabase
          .from("patient_documents")
          .insert({
            patient_id: patientId,
            hospital_id: hospitalId,
            document_type_id: documentTypeId,
            visit_service_id: visitServiceId,
            status: "preliminary",
            created_by: user!.id,
          })
          .select("id")
          .single();
        if (error || !doc) return;
        setDocumentId(doc.id);
        await supabase
          .from("patient_document_field_values")
          .upsert(
            Object.entries(values).map(([fieldId, value]) => ({
              patient_document_id: doc.id,
              field_definition_id: fieldId,
              hospital_id: hospitalId,
              value,
              recorded_by: user!.id,
            })),
            { onConflict: "patient_document_id,field_definition_id" }
          );
      } else {
        await supabase
          .from("patient_document_field_values")
          .upsert(
            Object.entries(values).map(([fieldId, value]) => ({
              patient_document_id: documentId,
              field_definition_id: fieldId,
              hospital_id: hospitalId,
              value,
              recorded_by: user!.id,
            })),
            { onConflict: "patient_document_id,field_definition_id" }
          );
      }
      setIsDirty(false);
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, isDirty, isReadOnly]);

  const canConfirm =
    !isReadOnly && allMandatoryFilled && documentId !== null && !isSaving && !isConfirming;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 bg-card">
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
          {isReadOnly && (
            <Badge className="bg-green-600 hover:bg-green-600 text-white">Завершено</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
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
      <div className="border-b bg-card px-4 overflow-x-auto">
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
          <button
            onClick={() => setActiveTab("assignments")}
            className={cn(
              "px-4 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
              activeTab === "assignments"
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Назначения
          </button>
        </div>
      </div>

      {/* A4 Document Area */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-6 document-print-area">
        <div className="mx-auto max-w-[210mm] bg-card rounded-md shadow-sm border p-8">
          <DocumentPatientHeader
            patient={patient}
            documentType={documentType}
            hospitalName={hospitalName}
            visitDate={visitDate}
          />

          {activeTab === "assignments" ? (
            <AssignmentsSection
              visitServices={visitServices}
              pendingOrders={pendingOrders}
              isReadOnly={isReadOnly}
              patientId={patientId}
              hospitalId={hospitalId}
              visitId={visitId}
              onOrderCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["doc-ws-visit-services", visitId, hospitalId] });
                queryClient.invalidateQueries({ queryKey: ["doc-ws-pending-orders", patientId, hospitalId] });
              }}
            />
          ) : (
            sections[Number(activeTab)] && (
              <DocumentSection
                section={sections[Number(activeTab)]}
                values={values}
                setVal={setVal}
                isReadOnly={isReadOnly}
              />
            )
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
      </div>
    </div>
  );
}
