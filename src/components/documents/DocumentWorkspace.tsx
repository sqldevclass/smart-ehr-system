import { useQuery } from "@tanstack/react-query";
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
  onClose: () => void;
}

export default function DocumentWorkspace(props: Props) {
  const { user } = useAuth();
  const { visitServiceId, patientId, visitId, hospitalId, documentTypeId } = props;

  const { data: existingDoc } = useQuery({
    queryKey: ["doc-ws-existing", visitServiceId, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select("id, status, completed_by, completed_at, document_type_id")
        .eq("visit_service_id", visitServiceId)
        .eq("hospital_id", hospitalId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: sectionsData } = useQuery({
    queryKey: ["doc-ws-sections", documentTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_type_sections")
        .select(`
          sort_order,
          document_sections!inner(id, code, name_ru)
        `)
        .eq("document_type_id", documentTypeId)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: fieldsData } = useQuery({
    queryKey: ["doc-ws-fields", documentTypeId],
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

  const { data: existingValues } = useQuery({
    queryKey: ["doc-ws-values", existingDoc?.id],
    enabled: !!existingDoc?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_document_field_values")
        .select("field_definition_id, value")
        .eq("patient_document_id", existingDoc!.id);
      return data || [];
    },
  });

  const { data: patient } = useQuery({
    queryKey: ["doc-ws-patient", patientId],
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
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color, requires_second_sig")
        .eq("id", documentTypeId)
        .single();
      return data;
    },
  });

  const { data: visit } = useQuery({
    queryKey: ["doc-ws-visit", visitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("id, visit_date")
        .eq("id", visitId)
        .maybeSingle();
      return data;
    },
  });

  const { data: visitServices = [] } = useQuery({
    queryKey: ["doc-ws-visit-services", visitId, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, source, scheduled_at, queue_number, completed_at,
          services!inner(name, service_type_id,
            service_types!inner(code)),
          service_statuses!inner(code, name_ru),
          profiles!assigned_physician_id(full_name)
        `)
        .eq("visit_id", visitId)
        .eq("hospital_id", hospitalId)
        .order("created_at");
      return data || [];
    },
  });

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["doc-ws-pending-orders", patientId, hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select(`
          id, source, scheduled_at, queue_number,
          completed_at, created_at,
          services!inner(name, service_type_id,
            service_types!inner(code)),
          service_statuses!inner(code, name_ru)
        `)
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .eq("source", "physician")
        .is("visit_id", null)
        .order("created_at");
      return data || [];
    },
  });


  const { data: completedByProfile } = useQuery({
    queryKey: ["doc-ws-completedby", existingDoc?.completed_by],
    enabled: !!existingDoc?.completed_by,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", existingDoc!.completed_by!)
        .single();
      return data;
    },
  });

  const isReady =
    !!sectionsData && !!fieldsData && !!patient && !!documentType &&
    (!existingDoc?.id || !!existingValues);

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
      onClose={props.onClose}
      existingDoc={existingDoc}
      sectionsData={sectionsData}
      fieldsData={fieldsData}
      existingValues={existingValues || []}
      patient={patient}
      documentType={documentType}
      visitServices={visitServices}
      pendingOrders={pendingOrders}
      completedByProfile={completedByProfile}
      visitDate={visitDate}
      hospitalName={user?.hospitalName || ""}
    />
  );
}

