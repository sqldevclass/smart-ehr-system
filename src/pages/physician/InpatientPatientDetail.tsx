import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";

export default function InpatientPatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const hospitalizationId = hospId!;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showAll, setShowAll] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeDocumentTypeId, setActiveDocumentTypeId] = useState<string | null>(null);

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["inpatient-detail", hospitalizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(`
          id, hospitalization_number, admitted_at, department_id,
          departments!department_id(name),
          patients!inner(
            id, first_name, last_name, middle_name,
            patient_number, date_of_birth, gender, phone,
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

  const { data: thisDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ["inpatient-docs", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_documents")
        .select(`
          id, status, created_at, completed_at,
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
          id, status, created_at, completed_at, hospitalization_id,
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
    queryKey: ["doc-types-active", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_types")
        .select("id, name_ru, color")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name_ru");
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!hosp) return <p className="text-destructive">Hospitalization not found.</p>;

  const patient = (hosp as any).patients;
  const allergies = patient?.patient_allergies || [];
  const docsToShow = showAll ? allDocs : thisDocs;

  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" onClick={() => navigate("/physician/inpatient")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Назад
      </Button>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 border rounded-lg overflow-hidden bg-card">
        <div className="lg:col-span-2 border-r">
          <div className="p-4 border-b">
            <div className="font-semibold text-lg">
              {patient.last_name} {patient.first_name} {patient.middle_name || ""}
            </div>
            <div className="text-sm text-muted-foreground">
              П#: {patient.patient_number} | ДР: {patient.date_of_birth ? format(new Date(patient.date_of_birth), "dd.MM.yyyy") : "—"}
            </div>
            {allergies.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 font-semibold text-sm">
                АЛЛЕРГИЯ: {allergies.map((a: any) => a.allergy_type).join(", ")}
              </div>
            )}
          </div>

          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">+ Создать</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {documentTypes.map((dt: any) => (
                    <DropdownMenuItem
                      key={dt.id}
                      onClick={() => {
                        setActiveDocumentTypeId(dt.id);
                        setActiveDocumentId(null);
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full mr-2 inline-block"
                        style={{ backgroundColor: dt.color }}
                      />
                      {dt.name_ru}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary underline"
              >
                {showAll ? "Только этот визит" : "Показать всё"}
              </button>
            </div>

            {docsToShow.map((doc: any) => {
              const isOutpatient = showAll && doc.hospitalization_id !== hospitalizationId;
              return (
                <div
                  key={doc.id}
                  onClick={() => {
                    setActiveDocumentId(doc.id);
                    setActiveDocumentTypeId(doc.document_types?.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 p-2 mb-1 rounded cursor-pointer text-sm hover:bg-muted",
                    isOutpatient && "ml-4 opacity-80",
                    activeDocumentId === doc.id && "bg-muted"
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: doc.document_types?.color || "#888" }}
                  />
                  <span className="flex-1">
                    {format(new Date(doc.created_at), "dd.MM.yyyy HH:mm")}{" "}
                    {doc.document_types?.name_ru}
                  </span>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    doc.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  )}>
                    {doc.status === "completed" ? "✓" : "●"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3">
          {activeDocumentTypeId ? (
            <InpatientDocumentWorkspace
              hospitalizationId={hospitalizationId}
              documentId={activeDocumentId}
              documentTypeId={activeDocumentTypeId}
              patientId={patientId}
              hospitalId={user!.hospitalId}
              onClose={() => {
                setActiveDocumentId(null);
                setActiveDocumentTypeId(null);
                refetchDocs();
                queryClient.invalidateQueries({ queryKey: ["inpatient-docs-all", patientId] });
              }}
            />
          ) : (
            <div className="p-6 space-y-3">
              <h3 className="font-semibold mb-4">План лечения и ухода</h3>
              <Button variant="outline" className="w-full justify-between" disabled>
                Лист назначения
                <span className="text-muted-foreground text-xs">Фаза 6</span>
              </Button>
              <Button variant="outline" className="w-full justify-between" disabled>
                Инструментальные исследования
                <span className="text-muted-foreground text-xs">Фаза 8</span>
              </Button>
              <Button variant="outline" className="w-full justify-between">
                Лаборатория ➕
              </Button>
              <Button variant="outline" className="w-full justify-between">
                Консультация ➕
              </Button>
              <Button variant="outline" className="w-full justify-between" disabled>
                Уход
                <span className="text-muted-foreground text-xs">Фаза 9</span>
              </Button>
              <Button variant="outline" className="w-full justify-between">
                Диагнозы ➕
              </Button>
              <Button variant="outline" className="w-full justify-between" disabled>
                ШРПУ
                <span className="text-muted-foreground text-xs">Фаза 8</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
