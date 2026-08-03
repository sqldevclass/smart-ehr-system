import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import DocumentHistory from "@/components/documents/DocumentHistory";
import DocumentWorkspace from "@/components/documents/DocumentWorkspace";
import ServiceTab from "@/components/inpatient/ServiceTab";
import PatientMedicationHistory from "@/components/patient/PatientMedicationHistory";

type TabKey = "documents" | "medication" | "lab" | "imaging" | "consultation";

const TABS: { key: TabKey; label: string }[] = [
  { key: "documents", label: "Документы" },
  { key: "medication", label: "Лист назначения" },
  { key: "lab", label: "Лаборатория" },
  { key: "imaging", label: "Инструментальные" },
  { key: "consultation", label: "Консультация" },
];

export default function OutpatientPatientDetail() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("documents");
  const [openDoc, setOpenDoc] = useState<{
    documentId: string | null;
    documentTypeId: string;
    visitServiceId: string;
    visitId: string;
  } | null>(null);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["outpatient-patient-detail", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, patient_allergies(id, allergy_type, description, severity)")
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && !!user?.hospitalId,
  });

  const allergies = ((patient as any)?.patient_allergies || []) as any[];

  const handleSelectDocument = async (docId: string | null, docTypeId: string) => {
    if (!docId) return;
    const { data, error } = await supabase
      .from("patient_documents")
      .select("visit_service_id, visit_services!inner(visit_id)")
      .eq("id", docId)
      .single();
    if (error || !data?.visit_service_id) return;
    setOpenDoc({
      documentId: docId,
      documentTypeId: docTypeId,
      visitServiceId: data.visit_service_id,
      visitId: (data as any).visit_services?.visit_id,
    });
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>;
  }
  if (!patient) {
    return <div className="p-6 text-sm text-muted-foreground">Пациент не найден.</div>;
  }

  const serviceTabProps = {
    hospitalizationId: "",
    patientId: patientId!,
    hospitalId: user!.hospitalId,
    userId: user!.id,
    readOnly: false,
  };

  return (
    <div>
      <div className="flex gap-4 border rounded-lg overflow-hidden bg-card min-h-[calc(100vh-8rem)]">
        {/* LEFT */}
        <div className="w-72 shrink-0 border-r flex flex-col">
          {allergies.length > 0 && (
            <div className="m-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 font-semibold text-xs">
              АЛЛЕРГИЯ: {allergies.map((a: any) => a.allergy_type).join(", ")}
            </div>
          )}

          <div className="p-3 border-b">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs mb-2"
              onClick={() => navigate(-1)}
            >
              ← Назад
            </Button>
            <div className="font-semibold text-sm">
              {(patient as any).last_name} {(patient as any).first_name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {(patient as any).date_of_birth
                ? format(new Date((patient as any).date_of_birth), "dd.MM.yyyy")
                : "—"}
              {(patient as any).date_of_birth &&
                ` · ${differenceInYears(new Date(), new Date((patient as any).date_of_birth))} лет`}
            </div>
            <div className="text-xs text-muted-foreground">
              П#: {(patient as any).patient_number}
            </div>
          </div>

          <div className="p-3 flex-1 overflow-y-auto">
            <DocumentHistory
              hospitalizationId=""
              patientId={patientId!}
              hospitalId={user!.hospitalId}
              activeDocumentId={openDoc?.documentId ?? null}
              onSelectDocument={handleSelectDocument}
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div className="border-b bg-card px-2 overflow-x-auto">
            <div className="flex">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setActiveTab(t.key);
                    setOpenDoc(null);
                  }}
                  className={cn(
                    "px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                    activeTab === t.key && !openDoc
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {openDoc ? (
              <DocumentWorkspace
                visitServiceId={openDoc.visitServiceId}
                patientId={patientId!}
                visitId={openDoc.visitId}
                hospitalId={user!.hospitalId}
                documentTypeId={openDoc.documentTypeId}
                serviceStatusCode="completed"
                existingDocumentId={openDoc.documentId ?? undefined}
                onClose={() => setOpenDoc(null)}
              />
            ) : activeTab === "documents" ? (
              <div className="p-6 text-sm text-muted-foreground">
                Выберите документ слева.
              </div>
            ) : activeTab === "medication" ? (
              <div className="p-4">
                <PatientMedicationHistory
                  patientId={patientId!}
                  hospitalId={user!.hospitalId}
                />
              </div>
            ) : activeTab === "lab" ? (
              <ServiceTab {...serviceTabProps} typeCode="laboratory" title="Лаборатория" />
            ) : activeTab === "imaging" ? (
              <ServiceTab {...serviceTabProps} typeCode="instrumental" title="Инструментальные" />
            ) : (
              <ServiceTab {...serviceTabProps} typeCode="consultation" title="Консультация" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
