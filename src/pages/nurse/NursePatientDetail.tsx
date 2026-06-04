import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNurseLayoutContext } from "@/components/nurse/NurseLayout";
import { format, differenceInYears } from "date-fns";
import { Button } from "@/components/ui/button";
import EWSSection from "@/components/ews/EWSSection";
import NursePrescriptions from "@/components/medication/NursePrescriptions";
import NurseMonitoringPanel from "@/components/nurse/NurseMonitoringPanel";
import PatientDocumentSidebar from "@/components/documents/PatientDocumentSidebar";
import FallingPersonIcon from "@/components/assessments/FallingPersonIcon";
import { cn } from "@/lib/utils";

export default function NursePatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setPatientContext } = useNurseLayoutContext();
  const [showPrescriptions, setShowPrescriptions] = useState(false);
  const [showMedDocs, setShowMedDocs] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; typeId: string } | null>(null);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["nurse-hosp", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at,
          department_id,
          departments!department_id(name),
          patients!inner(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender,
            patient_allergies(allergy_type, severity)
          ),
          room_assignments(
            bed_number, rooms!inner(name))
        `)
        .eq("id", hospId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospId,
  });

  const fallRiskScaleCode = useMemo(() => {
    const dob = (hosp as any)?.patients?.date_of_birth;
    if (!dob) return undefined;
    const ageYears = differenceInYears(new Date(), new Date(dob));
    return ageYears < 18 ? "humpty_dumpty" : "morse";
  }, [(hosp as any)?.patients?.date_of_birth]);

  const { data: fallRiskAssessments = [] } = useQuery({
    queryKey: ["fall-risk-assessments", hospId, fallRiskScaleCode],
    enabled: !!hospId && fallRiskScaleCode !== undefined,
    staleTime: 0,
    queryFn: async () => {
      const { data: scale } = await supabase
        .from("assessment_scales")
        .select("id")
        .eq("code", fallRiskScaleCode)
        .single();
      if (!scale) return [];
      const { data } = await supabase
        .from("patient_assessments")
        .select("total_score, risk_level, assessed_at")
        .eq("hospitalization_id", hospId!)
        .eq("scale_id", scale.id)
        .eq("is_voided", false)
        .order("assessed_at", { ascending: false })
        .limit(1);
      return data || [];
    },
  });

  const { data: medDocs = [] } = useQuery({
    queryKey: ["nurse-med-docs", hospId],
    enabled: !!hospId && !!user?.hospitalId && showMedDocs,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at, completed_at,
          document_types!inner(id, name_ru, color)
        `)
        .eq("hospitalization_id", hospId!)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const latestFallRiskScore = (fallRiskAssessments[0] as any)?.total_score ?? null;
  const isFallRisk =
    fallRiskScaleCode !== undefined &&
    latestFallRiskScore !== null &&
    (fallRiskScaleCode === "humpty_dumpty"
      ? latestFallRiskScore >= 12
      : latestFallRiskScore >= 51);

  const patient = (hosp as any)?.patients;
  const ra = (hosp as any)?.room_assignments?.[0];
  const allergies = patient?.patient_allergies || [];

  useEffect(() => {
    if (!hosp || !patient) {
      setPatientContext(null);
      return;
    }
    setPatientContext(
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">
          {patient.last_name} {patient.first_name}
        </span>
        <span className="text-muted-foreground">
          ДР: {patient.date_of_birth ? format(new Date(patient.date_of_birth), "dd.MM.yyyy") : "—"}
        </span>
        <span className="text-muted-foreground">
          П#: {patient.patient_number}
        </span>
        {ra && (
          <span className="text-muted-foreground">
            {ra.rooms?.name} / {ra.bed_number}
          </span>
        )}
      </div>
    );
    return () => setPatientContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(hosp as any)?.id]);

  if (isLoading) return <p className="text-muted-foreground">Загрузка…</p>;
  if (!hosp) return <p className="text-destructive">Госпитализация не найдена.</p>;

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-white shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => navigate("/nurse")}
        >
          ← Назад
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setShowPrescriptions(true)}
        >
          Лист назначения
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => setShowMedDocs(true)}
        >
          Мед. документы
        </Button>
        {allergies.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-red-700 font-semibold">
            <span>⚠</span>
            <span>АЛЛЕРГИЯ:</span>
            <span>{allergies.map((a: any) => a.allergy_type).join(", ")}</span>
          </div>
        )}
        {isFallRisk && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-50 border border-red-200 text-red-700">
            <FallingPersonIcon color="#B91C1C" size={14} />
            <span>Риск падения</span>
          </div>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled
          >
            Приход / Списание
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 h-full overflow-y-auto border-r p-4">
          <EWSSection
            hospitalizationId={hospId!}
            patientId={patient.id}
            hospitalId={user!.hospitalId}
            patientDateOfBirth={patient.date_of_birth}
            admittedAt={(hosp as any).admitted_at}
            isReadOnly={false}
            viewerRole="nurse"
          />
        </div>
        <div className="w-1/2 h-full overflow-y-auto p-4">
          <NurseMonitoringPanel
            hospitalizationId={hospId!}
            patientId={patient.id}
            hospitalId={user!.hospitalId}
            patientDateOfBirth={patient.date_of_birth}
            patientGender={patient.gender}
            fallRiskScaleCode={fallRiskScaleCode ?? undefined}
          />
        </div>
      </div>

      {showPrescriptions && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg flex flex-col"
            style={{
              width: "calc(100vw - 32px)",
              height: "calc(100vh - 32px)",
            }}
          >
            <div className="flex items-start gap-4 p-4 border-b">
              <div className="flex-1">
                <div className="text-lg font-semibold">Лист назначения</div>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {patient?.last_name} {patient?.first_name}
                  </span>
                  <span className="text-muted-foreground">
                    {patient?.date_of_birth
                      ? format(new Date(patient.date_of_birth), "dd.MM.yyyy")
                      : "—"}
                    {" · "}
                    {patient?.date_of_birth
                      ? differenceInYears(new Date(), new Date(patient.date_of_birth))
                      : "—"}{" "}
                    лет
                  </span>
                  <span className="text-muted-foreground">
                    П# {patient?.patient_number}
                  </span>
                  {allergies.length > 0 && (
                    <span className="text-red-700 font-semibold text-xs">
                      ⚠ АЛЛЕРГИЯ:{" "}
                      {allergies.map((a: any) => a.allergy_type).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowPrescriptions(false)}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground shrink-0"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <NursePrescriptions
                hospitalizationId={hospId!}
                patientId={patient.id}
                hospitalId={user!.hospitalId}
              />
            </div>
          </div>
        </div>
      )}

      {showMedDocs && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-lg flex flex-col"
            style={{
              width: "calc(100vw - 32px)",
              height: "calc(100vh - 32px)",
            }}
          >
            <div className="flex items-center gap-4 p-4 border-b">
              <div className="flex-1">
                <div className="text-lg font-semibold">Мед. документы</div>
                <div className="text-sm text-muted-foreground">
                  {patient?.last_name} {patient?.first_name}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMedDocs(false);
                  setSelectedDoc(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              <div className="w-64 shrink-0 border-r overflow-y-auto p-2">
                {medDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">Документов нет</p>
                ) : (
                  medDocs.map((d: any) => (
                    <div
                      key={d.id}
                      onClick={() =>
                        setSelectedDoc({ id: d.id, typeId: d.document_types?.id })
                      }
                      className={cn(
                        "p-2 mb-1 rounded text-xs cursor-pointer hover:bg-muted flex items-center gap-2",
                        selectedDoc?.id === d.id && "bg-muted"
                      )}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: d.document_types?.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{d.document_types?.name_ru}</div>
                        <div className="text-muted-foreground">
                          {format(new Date(d.created_at), "dd.MM.yyyy HH:mm")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex-1 overflow-auto">
                {selectedDoc ? (
                  <InpatientDocumentWorkspace
                    key={selectedDoc.id}
                    hospitalizationId={hospId!}
                    existingDocumentId={selectedDoc.id}
                    documentTypeId={selectedDoc.typeId}
                    patientId={patient.id}
                    hospitalId={user!.hospitalId}
                    forceReadOnly={true}
                    onClose={() => setSelectedDoc(null)}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    Выберите документ
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
