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
import PatientCardModal from "@/components/patient/PatientCardModal";
import InteractionWarnings, { useInteractionCount } from "@/components/medication/InteractionWarnings";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


export default function NursePatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setPatientContext } = useNurseLayoutContext();
  const [showPrescriptions, setShowPrescriptions] = useState(false);
  const [showMedDocs, setShowMedDocs] = useState(false);
  const [showPatientCard, setShowPatientCard] = useState(false);
  
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

  const { data: nurseDept } = useQuery({
    queryKey: ["nurse-own-dept", user?.id, user?.hospitalId],
    enabled: !!user?.id && !!user?.hospitalId,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("person_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (!profile?.person_id) return null;
      const { data: emp } = await supabase
        .from("employments")
        .select("department_id")
        .eq("person_id", profile.person_id)
        .eq("hospital_id", user!.hospitalId)
        .eq("employment_status", "active")
        .maybeSingle();
      return emp?.department_id ?? null;
    },
  });

  const isOwnDept = !!nurseDept &&
    !!(hosp as any)?.department_id &&
    (hosp as any).department_id === nurseDept;

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
        <button
          className="font-semibold hover:underline hover:text-primary transition-colors"
          onClick={() => setShowPatientCard(true)}
        >
          {patient.last_name} {patient.first_name}
        </button>
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
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 h-full overflow-y-auto border-r p-4">
          <EWSSection
            hospitalizationId={hospId!}
            patientId={patient.id}
            hospitalId={user!.hospitalId}
            patientDateOfBirth={patient.date_of_birth}
            admittedAt={(hosp as any).admitted_at}
            isReadOnly={!isOwnDept}
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
            isReadOnly={!isOwnDept}
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
                isReadOnly={!isOwnDept}
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
            <div className="flex-1 overflow-hidden">
              <PatientDocumentSidebar
                hospitalizationId={hospId!}
                patientId={patient.id}
                hospitalId={user!.hospitalId}
                userId={user!.id}
                isReadOnly={!isOwnDept}
              />
            </div>
          </div>
        </div>
      )}

      {showPatientCard && hospId && (
        <PatientCardModal
          hospitalizationId={hospId}
          open={showPatientCard}
          onOpenChange={setShowPatientCard}
        />
      )}





    </div>
  );
}
