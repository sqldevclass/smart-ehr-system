import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

const queryDefaults = {
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  placeholderData: keepPreviousData,
} as const;
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DocumentWorkspaceInner from "./DocumentWorkspaceInner";

interface Props {
  visitServiceId: string;
  patientId: string;
  visitId: string;
  hospitalId: string;
  documentTypeId: string;
  serviceStatusCode: string;
  onClose: () => void;
  hospitalizationId?: string;
  existingDocumentId?: string;
  onDocumentCreated?: (documentId: string) => void;
}

export default function DocumentWorkspace(props: Props) {
  const { user } = useAuth();
  const { visitServiceId, patientId, visitId, hospitalId, documentTypeId, hospitalizationId, existingDocumentId } = props;

  const { data: sectionsData } = useQuery({
    queryKey: ["doc-ws-sections", documentTypeId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_sections")
        .select("sort_order, document_sections!inner(id, code, name_ru)")
        .eq("document_type_id", documentTypeId)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: fieldsData } = useQuery({
    queryKey: ["doc-ws-fields", documentTypeId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_fields")
        .select(`
          section_id, sort_order, is_mandatory, is_visible,
          field_definitions!inner(
            id, attribute_code, label_ru,
            field_type, options, unit
          )
        `)
        .eq("document_type_id", documentTypeId)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: patient } = useQuery({
    queryKey: ["doc-ws-patient", patientId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, first_name, last_name, middle_name, date_of_birth, gender, phone, patient_number")
        .eq("id", patientId)
        .single();
      return data;
    },
  });

  const { data: documentType } = useQuery({
    queryKey: ["doc-ws-type", documentTypeId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, code, name_ru, color, requires_second_sig")
        .eq("id", documentTypeId)
        .single();
      return data;
    },
  });

  const isConsultation = (documentType as any)?.code === "consultation";

  const { data: visitData, refetch: refetchVisit } = useQuery({
    queryKey: ["visit-hosp-rec", visitId],
    enabled: !!visitId && isConsultation,
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select(`
          id,
          hosp_recommended_department_id,
          hosp_recommended_urgency,
          hosp_recommended_notes,
          hospitalization_recommended
        `)
        .eq("id", visitId)
        .single();
      return data;
    },
  });

  const { data: visit } = useQuery({
    queryKey: ["doc-ws-visit", visitId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("id, visit_date")
        .eq("id", visitId)
        .maybeSingle();
      return data;
    },
  });

  const { data: mainServices = [] } = useQuery({
    queryKey: ["doc-ws-main", visitId, hospitalId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, source, scheduled_at, queue_number,
          completed_at, assigned_physician_id,
          services!inner(name, service_type_id,
            service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("visit_id", visitId)
        .eq("hospital_id", hospitalId)
        .eq("source", "registrar")
        .order("created_at");
      return data || [];
    },
  });

  const { data: childServices = [] } = useQuery({
    queryKey: ["doc-ws-child", visitId, hospitalId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, source, scheduled_at, queue_number,
          completed_at, assigned_physician_id,
          services!inner(name, service_type_id,
            service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("source", "physician")
        .not("visit_id", "is", null)
        .eq("ordered_from_visit_service_id", visitServiceId)
        .order("created_at");
      return data || [];
    },
  });

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["doc-ws-pending", visitServiceId, hospitalId],
    ...queryDefaults,
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, source, scheduled_at, queue_number,
          completed_at, assigned_physician_id,
          services!inner(name, service_type_id,
            service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("hospital_id", hospitalId)
        .eq("source", "physician")
        .is("visit_id", null)
        .eq("ordered_from_visit_service_id", visitServiceId)
        .order("created_at");
      return data || [];
    },
  });

  const allPhysicianIds = useMemo(() => {
    const ids = new Set<string>();
    [...mainServices, ...childServices, ...pendingOrders].forEach((vs: any) => {
      if (vs.assigned_physician_id) ids.add(vs.assigned_physician_id);
    });
    return Array.from(ids);
  }, [mainServices, childServices, pendingOrders]);

  const { data: physicianNames = [] } = useQuery({
    queryKey: ["physician-names", allPhysicianIds],
    ...queryDefaults,
    enabled: allPhysicianIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id, profiles!inner(full_name)")
        .in("id", allPhysicianIds);
      return data || [];
    },
  });

  const physicianNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (physicianNames || []).forEach((p: any) => {
      map[p.id] = p.profiles?.full_name ?? "—";
    });
    return map;
  }, [physicianNames]);

  const { data: physicianData } = useQuery({
    queryKey: ["my-physician-id", user?.id],
    ...queryDefaults,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id")
        .eq("profile_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const isReady = !!sectionsData && !!fieldsData && !!patient && !!documentType;

  if (!isReady) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visitDate = visit?.visit_date ? new Date(visit.visit_date) : new Date();

  return (
    <DocumentWorkspaceInner
      visitServiceId={visitServiceId}
      patientId={patientId}
      visitId={visitId}
      hospitalId={hospitalId}
      documentTypeId={documentTypeId}
      serviceStatusCode={props.serviceStatusCode}
      onClose={props.onClose}
      sectionsData={sectionsData}
      fieldsData={fieldsData}
      patient={patient}
      documentType={documentType}
      mainServices={mainServices}
      childServices={childServices}
      pendingOrders={pendingOrders}
      physicianNameMap={physicianNameMap}
      visitDate={visitDate}
      hospitalName={user?.hospitalName || ""}
      physicianId={physicianData?.id ?? null}
      isConsultation={isConsultation}
      visitData={visitData ?? null}
      refetchVisit={refetchVisit}
      hospitalizationId={hospitalizationId}
      existingDocumentId={existingDocumentId}
      onDocumentCreated={props.onDocumentCreated}
    />
  );
}
