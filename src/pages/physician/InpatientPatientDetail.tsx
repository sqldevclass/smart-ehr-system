import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { format, differenceInYears } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";
import DischargeDialog from "@/components/inpatient/DischargeDialog";
import EWSSection from "@/components/ews/EWSSection";
import MedicationTab from "@/components/medication/MedicationTab";
import InteractionWarnings, { useInteractionCount } from "@/components/medication/InteractionWarnings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePhysicianLayoutContext } from "@/components/physician/PhysicianLayout";
import PatientCardModal from "@/components/patient/PatientCardModal";

type TabKey = "medication" | "imaging" | "lab" | "consultation" | "care" | "diagnosis" | "ews";

type ActiveView =
  | { type: "document"; documentId: string | null; documentTypeId: string }
  | { type: "tab"; tab: TabKey }
  | null;

const TABS: { key: TabKey; label: string }[] = [
  { key: "medication", label: "Лист назначения" },
  { key: "imaging", label: "Инструментальные" },
  { key: "lab", label: "Лаборатория" },
  { key: "consultation", label: "Консультация" },
  { key: "care", label: "Уход" },
  { key: "diagnosis", label: "Диагнозы" },
  { key: "ews", label: "ШРПУ" },
];

export default function InpatientPatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const hospitalizationId = hospId!;
  const { user } = useAuth();
  const { physicianId } = usePhysicianId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPatientContext } = usePhysicianLayoutContext();

  const [showPatientCard, setShowPatientCard] = useState(false);

  const [showAll, setShowAll] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [showMedicationModal, setShowMedicationModal] = useState(false);
  const [showIxModal, setShowIxModal] = useState(false);
  const [ixAutoDismissed, setIxAutoDismissed] = useState(false);

  const { data: interactions = [] } = useInteractionCount(
    showMedicationModal ? hospitalizationId : "",
    user?.hospitalId ?? ""
  );

  useEffect(() => {
    if (!showMedicationModal) return;
    if (ixAutoDismissed) return;
    const key = `ix-dismissed-${hospitalizationId}`;
    if (sessionStorage.getItem(key)) {
      setIxAutoDismissed(true);
      return;
    }
    if (interactions.length > 0) {
      setShowIxModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMedicationModal, interactions.length]);

  const handleDismissIx = () => {
    sessionStorage.setItem(`ix-dismissed-${hospitalizationId}`, "1");
    setIxAutoDismissed(true);
    setShowIxModal(false);
  };

  const ixSeverityClass = () => {
    const order: Record<string, number> = {
      contraindicated: 0, major: 1, moderate: 2, minor: 3,
    };
    const worst = (interactions as any[]).reduce(
      (acc: string, ix: any) =>
        (order[ix.severity] ?? 9) < (order[acc] ?? 9) ? ix.severity : acc,
      "none"
    );
    if (worst === "contraindicated" || worst === "major")
      return "text-red-600 border-red-300 hover:bg-red-50";
    if (worst === "moderate")
      return "text-amber-600 border-amber-300 hover:bg-amber-50";
    if (worst === "minor")
      return "text-blue-600 border-blue-200 hover:bg-blue-50";
    return "";
  };

  const { data: ewsScheduleStatus } = useQuery({
    queryKey: ["ews-schedule-status", hospitalizationId],
    staleTime: 0,
    refetchInterval: 60000,
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ews_schedule")
        .select("next_due_at")
        .eq("hospitalization_id", hospitalizationId)
        .maybeSingle();
      return data;
    },
  });

  const { data: activeClinicalAlerts = [] } = useQuery({
    queryKey: ["active-clinical-alerts", hospitalizationId],
    staleTime: 0,
    refetchInterval: 60000,
    enabled: !!hospitalizationId,
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_alerts")
        .select("id")
        .eq("hospitalization_id", hospitalizationId)
        .eq("is_active", true)
        .is("physician_acknowledged_at", null);
      return data || [];
    },
  });

  const ewsNeedsAttention = useMemo(() => {
    if (activeClinicalAlerts.length > 0) return true;
    if (!ewsScheduleStatus?.next_due_at) return false;
    const due = new Date(ewsScheduleStatus.next_due_at);
    const diffMin = (due.getTime() - Date.now()) / 60000;
    return diffMin <= 30;
  }, [ewsScheduleStatus, activeClinicalAlerts]);

  const hasSepsisAlert = activeClinicalAlerts.length > 0;

  const { data: hosp, isLoading, refetch } = useQuery({
    queryKey: ["inpatient-detail", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at, department_id,
          discharged_at, discharge_type,
          departments!department_id(name),
          patients!inner(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender, phone,
            weight_kg, height_cm,
            patient_allergies(allergy_type, severity)
          ),
          room_assignments(bed_number, rooms!inner(name))
        `)
        .eq("id", hospitalizationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospitalizationId,
  });

  const patientId = (hosp as any)?.patients?.id;
  const patientForCtx = (hosp as any)?.patients;

  useEffect(() => {
    if (hosp && patientForCtx) {
      setPatientContext(
        <div className="flex items-center gap-2 text-sm">
          <button
            className="font-semibold hover:underline hover:text-primary transition-colors"
            onClick={() => setShowPatientCard(true)}
          >
            {patientForCtx.last_name} {patientForCtx.first_name}
          </button>
          {patientForCtx.date_of_birth && (
            <span className="text-muted-foreground">
              ДР: {format(new Date(patientForCtx.date_of_birth), "dd.MM.yyyy")}
            </span>
          )}
          <span className="text-muted-foreground">
            П#: {patientForCtx.patient_number}
          </span>
        </div>
      );
    }
    return () => setPatientContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(hosp as any)?.id]);

  useEffect(() => {
    if (!physicianId || !patientId || !user?.hospitalId) return;
    supabase.rpc("track_recent_patient", {
      p_staff_role_id: physicianId,
      p_hospital_id: user.hospitalId,
      p_patient_id: patientId,
      p_hospitalization_id: hospitalizationId,
    } as any).then(({ error }) => {
      if (error) console.error("track_recent_patient error:", error);
    });
  }, [physicianId, patientId, user?.hospitalId, hospitalizationId]);

  const { data: thisDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ["inpatient-docs", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at, completed_at, created_by,
          document_types!inner(id, name_ru, color)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!hospitalizationId && !!user?.hospitalId,
  });

  const { data: allDocs = [] } = useQuery({
    queryKey: ["inpatient-docs-all", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at, completed_at, created_by, hospitalization_id,
          document_types!inner(id, name_ru, color)
        `)
        .eq("patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: showAll && !!patientId && !!user?.hospitalId,
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
    queryKey: ["physician-doc-privileges", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("person_id")
        .eq("id", user!.id)
        .maybeSingle();

      if (!profile?.person_id) return [];

      const { data: staffRoles } = await supabase
        .from("staff_roles")
        .select("id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true);

      if (!staffRoles || staffRoles.length === 0) return [];

      const staffRoleIds = staffRoles.map((sr: any) => sr.id);

      const { data } = await supabase
        .from("physician_document_privileges")
        .select("document_type_id")
        .in("staff_role_id", staffRoleIds)
        .eq("hospital_id", user!.hospitalId);

      return data || [];
    },
  });

  const allowedDocTypeIds = new Set(
    docPrivileges.map((p: any) => p.document_type_id)
  );
  const allowedDocTypes = documentTypes.filter(
    (dt: any) => allowedDocTypeIds.has(dt.id)
  );

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!hosp) return <p className="text-destructive">Hospitalization not found.</p>;

  const isHospDischarged = !!(hosp as any)?.discharged_at;

  const patient = (hosp as any).patients;
  const allergies = patient?.patient_allergies || [];
  const docsToShow = showAll ? allDocs : thisDocs;

  const closeView = () => {
    setActiveView(null);
    refetchDocs();
    queryClient.invalidateQueries({ queryKey: ["inpatient-docs-all", patientId] });
  };

  const handleDocumentComplete = () => {
    refetchDocs();
    queryClient.invalidateQueries({
      queryKey: ["inpatient-docs-all", patientId],
    });
  };

  const selectTab = (tab: TabKey) => {
    setActiveView({ type: "tab", tab });
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

          {(hosp as any).discharged_at && (
            <div
              className={cn(
                "mx-3 mt-2 px-3 py-2 rounded text-sm font-medium text-center",
                (hosp as any).discharge_type === "deceased"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-green-50 text-green-700"
              )}
            >
              {(hosp as any).discharge_type === "discharged"
                ? "Выписан"
                : (hosp as any).discharge_type === "transferred"
                ? "Переведён"
                : "Летальный исход"}
              {" · "}
              {format(new Date((hosp as any).discharged_at), "dd.MM.yyyy")}
            </div>
          )}

          <div className="flex items-center gap-1.5 p-3 border-b flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate("/physician/inpatient")}
            >
              ← Назад
            </Button>
            {!isHospDischarged && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-7 px-2 text-xs">+ Создать</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {allowedDocTypes.length === 0 ? (
                    <DropdownMenuItem disabled>
                      Нет доступных документов. Обратитесь к администратору.
                    </DropdownMenuItem>
                  ) : (
                    allowedDocTypes.map((dt: any) => (
                      <DropdownMenuItem
                        key={dt.id}
                        onClick={() =>
                          setActiveView({
                            type: "document",
                            documentId: null,
                            documentTypeId: dt.id,
                          })
                        }
                      >
                        <span
                          className="w-3 h-3 rounded-full mr-2 inline-block"
                          style={{ backgroundColor: dt.color }}
                        />
                        {dt.name_ru}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isHospDischarged && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setDischargeOpen(true)}
              >
                Выписать
              </Button>
            )}
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-primary underline ml-auto"
            >
              {showAll ? "Этот визит" : "Показать всё"}
            </button>
          </div>

          <div className="p-3 flex-1 overflow-y-auto">


            {docsToShow.map((doc: any) => {
              const isOther = showAll && doc.hospitalization_id !== hospitalizationId;
              const isCompleted = doc.status === "completed";
              const isOwn = doc.created_by === user?.id;
              const clickable = isCompleted || isOwn;
              const isActive =
                activeView?.type === "document" && activeView.documentId === doc.id;
              return (
                <div
                  key={doc.id}
                  onClick={
                    clickable
                      ? () =>
                          setActiveView({
                            type: "document",
                            documentId: doc.id,
                            documentTypeId: doc.document_types?.id,
                          })
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-2 p-2 mb-1 rounded text-xs",
                    clickable
                      ? "cursor-pointer hover:bg-muted"
                      : "cursor-default opacity-50",
                    isOther && "ml-3",
                    isActive && "bg-muted"
                  )}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: doc.document_types?.color || "#888" }}
                  />
                  <span className="flex-1 truncate">
                    {format(new Date(doc.created_at), "dd.MM HH:mm")}{" "}
                    {doc.document_types?.name_ru}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      isCompleted
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    )}
                  >
                    {isCompleted ? "✓" : "●"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Tab bar */}
          <div className="border-b bg-card px-2 overflow-x-auto">
            <div className="flex">
              {TABS.map((t) => {
                const active = activeView?.type === "tab" && activeView.tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      if (t.key === "medication") {
                        setShowMedicationModal(true);
                      } else {
                        selectTab(t.key);
                      }
                    }}
                    className={cn(
                      "px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                      active
                        ? "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {t.label}
                      {t.key === "ews" && ewsNeedsAttention && (
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {activeView?.type === "document" ? (
              <InpatientDocumentWorkspace
                hospitalizationId={hospitalizationId}
                existingDocumentId={activeView.documentId ?? undefined}
                documentTypeId={activeView.documentTypeId}
                patientId={patientId}
                hospitalId={user!.hospitalId}
                forceReadOnly={isHospDischarged}
                onClose={closeView}
                onComplete={handleDocumentComplete}
                onDocumentCreated={(newDocId) => {
                  setActiveView((prev) =>
                    prev?.type === "document"
                      ? { ...prev, documentId: newDocId }
                      : prev
                  );
                  refetchDocs();
                }}
              />
            ) : activeView?.type === "tab" ? (
              <TabPanel
                tab={activeView.tab}
                hospitalizationId={hospitalizationId}
                patientId={patientId}
                hospitalId={user!.hospitalId}
                userId={user!.id}
                readOnly={isHospDischarged}
                patientDateOfBirth={(hosp as any)?.patients?.date_of_birth}
                patientGender={(hosp as any)?.patients?.gender}
                admittedAt={(hosp as any)?.admitted_at}
                externalAlertActive={hasSepsisAlert}
                patientAllergies={allergies}
              />
            ) : (
              <div className="p-10 text-center text-muted-foreground text-sm">
                Выберите документ или раздел для просмотра
              </div>
            )}
          </div>
        </div>
      </div>

      {showMedicationModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col"
            style={{
              width: "calc(100vw - 80px)",
              height: "calc(100vh - 40px)",
            }}
          >
            <div className="flex items-center gap-4 px-4 py-3 border-b shrink-0">
              <h2 className="font-semibold text-base shrink-0">Лист назначения</h2>
              <div className="flex items-center gap-4 text-sm flex-1 min-w-0">
                <div className="shrink-0">
                  <div className="font-medium">
                    {patient?.last_name} {patient?.first_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {patient?.date_of_birth
                      ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
                      : "—"}
                    {" · "}
                    {patient?.date_of_birth
                      ? differenceInYears(new Date(), new Date(patient.date_of_birth))
                      : "—"}{" "}
                    лет
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {patient?.patient_number}
                </div>
                {patient?.weight_kg && (
                  <div className="text-xs text-muted-foreground shrink-0">
                    {patient.weight_kg} кг
                  </div>
                )}
                {patient?.height_cm && (
                  <div className="text-xs text-muted-foreground shrink-0">
                    {patient.height_cm} см
                  </div>
                )}
                {allergies.length > 0 && (
                  <div className="text-xs font-semibold text-red-600 shrink-0">
                    ⚠ АЛЛЕРГИЯ:{" "}
                    {allergies.map((a: any) => a.allergy_type).join(", ")}
                  </div>
                )}
              </div>
              {interactions.length > 0 ? (
                <button
                  onClick={() => setShowIxModal(true)}
                  className={cn(
                    "text-xs border rounded px-2.5 py-1 shrink-0 transition-colors",
                    ixSeverityClass()
                  )}
                >
                  ⚠ Взаимодействия ({interactions.length})
                </button>
              ) : (
                <button
                  disabled
                  className="text-xs border rounded px-2.5 py-1 shrink-0 text-muted-foreground border-muted opacity-50 cursor-not-allowed"
                >
                  Взаимодействия
                </button>
              )}
              <button
                onClick={() => setShowMedicationModal(false)}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MedicationTab
                hospitalizationId={hospId!}
                patientId={patient.id}
                hospitalId={user!.hospitalId}
                physicianId={user!.id}
                isReadOnly={isHospDischarged}
                patientAllergies={allergies}
                patientDateOfBirth={patient?.date_of_birth}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog open={showIxModal} onOpenChange={(o) => !o && handleDismissIx()}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Лекарственные взаимодействия</DialogTitle>
          </DialogHeader>
          <InteractionWarnings
            hospitalizationId={hospitalizationId}
            hospitalId={user!.hospitalId}
            variant="list"
          />
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={handleDismissIx}>
              Закрыть и не показывать снова
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <DischargeDialog
        open={dischargeOpen}
        onOpenChange={setDischargeOpen}
        hospitalizationId={hospitalizationId}
        patientName={`${patient?.last_name ?? ""} ${patient?.first_name ?? ""}`}
        onSuccess={() => {
          refetch();
          navigate("/physician/inpatient");
        }}
      />

      {showPatientCard && hospitalizationId && (
        <PatientCardModal
          hospitalizationId={hospitalizationId}
          open={showPatientCard}
          onOpenChange={setShowPatientCard}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab panels                                                          */
/* ------------------------------------------------------------------ */

interface TabProps {
  tab: TabKey;
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
  readOnly?: boolean;
  patientDateOfBirth?: string;
  patientGender?: string;
  admittedAt?: string;
  externalAlertActive?: boolean;
  patientAllergies?: any[];
}

function TabPanel(props: TabProps) {
  const { tab } = props;
  switch (tab) {
    case "lab":
      return <ServiceTab {...props} typeCode="laboratory" title="Лаборатория" />;
    case "consultation":
      return <ServiceTab {...props} typeCode="consultation" title="Консультация" />;
    case "diagnosis":
      return <DiagnosisTab {...props} />;
    case "imaging":
      return <Placeholder text="Инструментальные — Фаза 8 — в разработке" />;
    case "care":
      return <CareTab {...props} />;
    case "ews":
      return (
        <div className="p-4">
          <EWSSection
            hospitalizationId={props.hospitalizationId}
            patientId={props.patientId}
            hospitalId={props.hospitalId}
            patientDateOfBirth={props.patientDateOfBirth!}
            patientGender={props.patientGender}
            admittedAt={props.admittedAt!}
            isReadOnly={!!props.readOnly}
            canOverride={!props.readOnly}
            viewerRole="physician"
            externalAlertActive={!!props.externalAlertActive}
          />
        </div>
      );
  }
}

function Placeholder({ text }: { text: string }) {
  return <div className="p-10 text-center text-muted-foreground text-sm">{text}</div>;
}

/* --- Lab / Consultation tab --- */
function ServiceTab({
  hospitalizationId, patientId, hospitalId, userId, typeCode, title, readOnly,
}: TabProps & { typeCode: "laboratory" | "consultation"; title: string }) {
  const queryClient = useQueryClient();
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["inpatient-services", typeCode, hospitalizationId, patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, created_at, status_id,
          services!inner(name, service_type_id, service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .eq("source", "physician")
        .order("created_at", { ascending: false });
      return (data || []).filter(
        (vs: any) =>
          vs.services?.service_types?.code === typeCode &&
          ["ready_for_execution", "in_progress", "completed"].includes(
            vs.service_statuses?.code
          )
      );
    },
    enabled: !!patientId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-services", typeCode, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, service_type_id, service_types!inner(code)")
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("name");
      return (data || []).filter(
        (s: any) => s.service_types?.code === typeCode
      );
    },
    enabled: !readOnly,
  });

  const handleOrder = async () => {
    if (!selectedServiceId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("inpatient_order_service", {
        p_hospitalization_id: hospitalizationId,
        p_patient_id: patientId,
        p_hospital_id: hospitalId,
        p_service_id: selectedServiceId,
        p_ordered_by: userId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Назначено");
      setSelectedServiceId("");
      queryClient.invalidateQueries({ queryKey: ["inpatient-services", typeCode] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">{title}</h3>

      {!readOnly && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите услугу" />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleOrder} disabled={!selectedServiceId || submitting}>
              {submitting ? "..." : "Назначить"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет назначений.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((vs: any) => (
            <li key={vs.id} className="flex items-center justify-between border rounded p-2 text-sm">
              <div>
                <div className="font-medium">{vs.services?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(vs.created_at), "dd.MM.yyyy HH:mm")}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted">
                {vs.service_statuses?.name_ru || vs.service_statuses?.code}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --- Diagnoses tab --- */
const DIAG_TYPE_LABELS: Record<string, string> = {
  main: "Основной",
  complication: "Осложнение",
  competing: "Конкурирующий",
  concurrent: "Сопутствующий",
  background: "Фоновый",
  comorbid: "Сопутствующий",
};
function diagTypeLabel(t: string) {
  return DIAG_TYPE_LABELS[t] ?? t;
}

function DiagnosisTab({
  hospitalizationId, patientId, hospitalId, userId, readOnly,
}: TabProps) {
  const { data: currentDiagnoses = [], refetch: refetchCurrentDiagnoses } = useQuery({
    queryKey: ["inpatient-diagnoses-current", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name)
        `)
        .eq("hospital_id", hospitalId)
        .eq("hospitalization_id", hospitalizationId)
        .order("recorded_at");
      return data || [];
    },
  });

  const { data: historyDiagnoses = [] } = useQuery({
    queryKey: ["inpatient-diagnoses-history", patientId, hospitalizationId],
    enabled: !!patientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select(`
          id, icd10_code, diagnosis_type, notes, recorded_at,
          icd10_codes!icd10_code(code, name_ru),
          profiles!recorded_by(full_name),
          hospitalizations!hospitalization_id(hospitalization_number, admitted_at)
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", patientId)
        .neq("hospitalization_id", hospitalizationId)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  const handleCopyDiagnosis = async (d: any) => {
    await supabase.from("patient_diagnoses").insert({
      patient_id: patientId,
      hospital_id: hospitalId,
      hospitalization_id: hospitalizationId,
      icd10_code: d.icd10_code,
      diagnosis_type: d.diagnosis_type,
      notes: d.notes || null,
      recorded_by: userId,
    });
    refetchCurrentDiagnoses();
  };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 h-full overflow-hidden">
      <div className="overflow-y-auto">
        <h3 className="font-semibold text-sm mb-3">Текущая госпитализация</h3>
        {(() => {
          const diagOrder = ["main", "competing", "complication", "comorbid", "background"];
          const diagGroups = diagOrder
            .map(type => ({
              type,
              label: diagTypeLabel(type),
              items: currentDiagnoses.filter((d: any) => d.diagnosis_type === type),
            }))
            .filter(g => g.items.length > 0);
          if (diagGroups.length === 0) {
            return <p className="text-sm text-muted-foreground">Диагнозов нет</p>;
          }
          return diagGroups.map(({ type, label, items }) => (
            <div key={type} className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1 mb-2">
                {label}
              </h4>
              {items.map((d: any) => (
                <div key={d.id} className="p-3 rounded border mb-2">
                  <div className="text-sm font-medium">
                    {d.icd10_codes?.code} — {d.icd10_codes?.name_ru}
                  </div>
                  {d.notes && (
                    <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {d.profiles?.full_name} · {format(new Date(d.recorded_at), "dd.MM.yyyy HH:mm")}
                  </div>
                </div>
              ))}
            </div>
          ));
        })()}
      </div>

      <div className="overflow-y-auto border-l pl-4">
        <h3 className="font-semibold text-sm mb-3">История пациента</h3>
        {historyDiagnoses.length === 0 ? (
          <p className="text-sm text-muted-foreground">История пуста</p>
        ) : historyDiagnoses.map((d: any) => (
          <div key={d.id} className="p-3 rounded border mb-2 group relative">
            <span className="text-xs text-muted-foreground uppercase">
              {diagTypeLabel(d.diagnosis_type)}
            </span>
            <div className="text-sm font-medium">
              {d.icd10_codes?.code} — {d.icd10_codes?.name_ru}
            </div>
            {d.notes && (
              <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {d.profiles?.full_name} · {format(new Date(d.recorded_at), "dd.MM.yyyy HH:mm")}
              {d.hospitalizations && (
                <span className="ml-1">· {d.hospitalizations?.hospitalization_number}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Care tab --- */
const ORDER_TYPE_LABELS: Record<string, string> = {
  diet: "Диета",
  activity_mode: "Режим активности",
  care: "Уход",
};

function CareTab({
  hospitalizationId, hospitalId, userId, readOnly,
}: TabProps) {
  const queryClient = useQueryClient();
  const [careType, setCareType] = useState<"diet" | "activity_mode" | "care">("care");
  const [careText, setCareText] = useState("");

  const { data: orders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["care-orders", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalization_orders")
        .select(`
          id, order_type, order_value,
          ordered_at, is_active,
          profiles!ordered_by(full_name)
        `)
        .eq("hospitalization_id", hospitalizationId)
        .eq("hospital_id", hospitalId)
        .eq("is_active", true)
        .order("ordered_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospitalizationId && !!hospitalId,
  });

  const handleAddOrder = async () => {
    if (!careText.trim()) return;
    const { error } = await supabase
      .from("hospitalization_orders")
      .insert({
        hospitalization_id: hospitalizationId,
        hospital_id: hospitalId,
        order_type: careType,
        order_value: careText.trim(),
        ordered_by: userId,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCareText("");
    refetchOrders();
    queryClient.invalidateQueries({ queryKey: ["care-orders"] });
  };

  const handleCancelOrder = async (id: string) => {
    const { error } = await supabase
      .from("hospitalization_orders")
      .update({
        is_active: false,
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetchOrders();
    queryClient.invalidateQueries({ queryKey: ["care-orders"] });
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">Назначения по уходу</h3>

      {!readOnly && (
        <div className="border rounded-md p-3 space-y-3 bg-muted/30">
          <Select value={careType} onValueChange={(v: any) => setCareType(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="care">Уход</SelectItem>
              <SelectItem value="diet">Диета</SelectItem>
              <SelectItem value="activity_mode">Режим активности</SelectItem>
            </SelectContent>
          </Select>
          <textarea
            value={careText}
            onChange={(e) => setCareText(e.target.value)}
            placeholder="Введите назначение..."
            className="w-full text-sm border rounded px-2 py-1 resize-none"
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!careText.trim()} onClick={handleAddOrder}>
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Назначений нет</p>
      ) : orders.map((o: any) => (
        <div key={o.id} className="border rounded p-3 space-y-1 group">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {ORDER_TYPE_LABELS[o.order_type as keyof typeof ORDER_TYPE_LABELS] ?? o.order_type}
              </span>
              <p className="text-sm mt-0.5">{o.order_value}</p>
            </div>
            <button
              onClick={() => handleCancelOrder(o.id)}
              className="text-muted-foreground hover:text-destructive text-xs opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
            >
              Отменить
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {o.profiles?.full_name} · {format(new Date(o.ordered_at), "dd.MM.yyyy HH:mm")}
          </div>
        </div>
      ))}
    </div>
  );
}


