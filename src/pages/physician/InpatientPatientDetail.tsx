import { useState, useEffect } from "react";
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
import { ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import InpatientDocumentWorkspace from "@/components/documents/InpatientDocumentWorkspace";
import { usePhysicianLayoutContext } from "@/components/physician/PhysicianLayout";

type TabKey = "medication" | "imaging" | "lab" | "consultation" | "care" | "diagnosis" | "ews";

type ActiveView =
  | { type: "document"; documentId: string | null; documentTypeId: string }
  | { type: "tab"; tab: TabKey }
  | null;

const TABS: { key: TabKey; label: string; hasPlus: boolean }[] = [
  { key: "medication", label: "Лист назначения", hasPlus: false },
  { key: "imaging", label: "Инструментальные", hasPlus: true },
  { key: "lab", label: "Лаборатория", hasPlus: true },
  { key: "consultation", label: "Консультация", hasPlus: true },
  { key: "care", label: "Уход", hasPlus: true },
  { key: "diagnosis", label: "Диагнозы", hasPlus: true },
  { key: "ews", label: "ШРПУ", hasPlus: false },
];

export default function InpatientPatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const hospitalizationId = hospId!;
  const { user } = useAuth();
  const { physicianId } = usePhysicianId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setPatientContext } = usePhysicianLayoutContext();

  const [showAll, setShowAll] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [showInlineForm, setShowInlineForm] = useState(false);

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

  useEffect(() => {
    if (!physicianId || !patientId || !user?.hospitalId) return;
    supabase.rpc("track_recent_patient", {
      p_physician_id: physicianId,
      p_hospital_id: user.hospitalId,
      p_patient_id: patientId,
      p_hospitalization_id: hospitalizationId,
    } as any);
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
    queryKey: ["physician-doc-privileges", physicianId],
    enabled: !!physicianId,
    queryFn: async () => {
      const { data } = await supabase
        .from("physician_document_privileges")
        .select("document_type_id")
        .eq("physician_id", physicianId!)
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

  const patient = (hosp as any).patients;
  const allergies = patient?.patient_allergies || [];
  const docsToShow = showAll ? allDocs : thisDocs;

  const closeView = () => {
    setActiveView(null);
    setShowInlineForm(false);
    refetchDocs();
    queryClient.invalidateQueries({ queryKey: ["inpatient-docs-all", patientId] });
  };

  const selectTab = (tab: TabKey) => {
    setActiveView({ type: "tab", tab });
    setShowInlineForm(false);
  };

  const tabPlus = (tab: TabKey) => {
    setActiveView({ type: "tab", tab });
    setShowInlineForm(true);
  };

  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" onClick={() => navigate("/physician/inpatient")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Назад
      </Button>
      <div className="flex gap-4 border rounded-lg overflow-hidden bg-card min-h-[calc(100vh-10rem)]">
        {/* LEFT */}
        <div className="w-72 shrink-0 border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="font-semibold">
              {patient.last_name} {patient.first_name} {patient.middle_name || ""}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              П#: {patient.patient_number}
            </div>
            <div className="text-xs text-muted-foreground">
              ДР: {patient.date_of_birth ? format(new Date(patient.date_of_birth), "dd.MM.yyyy") : "—"}
            </div>
            {allergies.length > 0 && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 font-semibold text-xs">
                АЛЛЕРГИЯ: {allergies.map((a: any) => a.allergy_type).join(", ")}
              </div>
            )}
          </div>

          <div className="p-3 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">+ Создать</Button>
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
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary underline"
              >
                {showAll ? "Только этот визит" : "Показать всё"}
              </button>
            </div>

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
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="border-b bg-card px-2 overflow-x-auto">
            <div className="flex">
              {TABS.map((t) => {
                const active = activeView?.type === "tab" && activeView.tab === t.key;
                return (
                  <div key={t.key} className="flex items-center">
                    <button
                      onClick={() => selectTab(t.key)}
                      className={cn(
                        "px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors",
                        active
                          ? "border-primary text-primary font-medium"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t.label}
                    </button>
                    {t.hasPlus && (
                      <button
                        onClick={() => tabPlus(t.key)}
                        className="p-1 text-muted-foreground hover:text-primary"
                        title="Добавить"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
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
                onClose={closeView}
                onDocumentCreated={(newDocId) => {
                  setActiveView((prev) =>
                    prev?.type === "document"
                      ? { ...prev, documentId: newDocId }
                      : prev
                  );
                  queryClient.invalidateQueries({
                    queryKey: ["inpatient-docs", hospitalizationId],
                  });
                }}
              />
            ) : activeView?.type === "tab" ? (
              <TabPanel
                tab={activeView.tab}
                showForm={showInlineForm}
                setShowForm={setShowInlineForm}
                hospitalizationId={hospitalizationId}
                patientId={patientId}
                hospitalId={user!.hospitalId}
                userId={user!.id}
              />
            ) : (
              <div className="p-10 text-center text-muted-foreground text-sm">
                Выберите документ или раздел для просмотра
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab panels                                                          */
/* ------------------------------------------------------------------ */

interface TabProps {
  tab: TabKey;
  showForm: boolean;
  setShowForm: (b: boolean) => void;
  hospitalizationId: string;
  patientId: string;
  hospitalId: string;
  userId: string;
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
    case "medication":
      return <Placeholder text="Лист назначения — Фаза 6 — в разработке" />;
    case "imaging":
      return <Placeholder text="Инструментальные — Фаза 8 — в разработке" />;
    case "care":
      return <Placeholder text="Уход — Фаза 9 — в разработке" />;
    case "ews":
      return <Placeholder text="ШРПУ — Фаза 8 — в разработке" />;
  }
}

function Placeholder({ text }: { text: string }) {
  return <div className="p-10 text-center text-muted-foreground text-sm">{text}</div>;
}

/* --- Lab / Consultation tab --- */
function ServiceTab({
  showForm, setShowForm, hospitalizationId, patientId, hospitalId, userId, typeCode, title,
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
    enabled: showForm,
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
      setShowForm(false);
      setSelectedServiceId("");
      queryClient.invalidateQueries({ queryKey: ["inpatient-services", typeCode] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Назначить
          </Button>
        )}
      </div>

      {showForm && (
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
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setSelectedServiceId(""); }}>
              Отмена
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
function DiagnosisTab({
  showForm, setShowForm, hospitalizationId, patientId, hospitalId, userId,
}: TabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [diagType, setDiagType] = useState("main");
  const [submitting, setSubmitting] = useState(false);

  const { data: diagnoses = [] } = useQuery({
    queryKey: ["inpatient-diagnoses", hospitalizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select("id, icd10_code, diagnosis_type, recorded_at, icd10_codes(code, name_ru)")
        .eq("hospitalization_id", hospitalizationId)
        .eq("hospital_id", hospitalId)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["icd10-search-inp", search],
    queryFn: async () => {
      if (search.trim().length < 1) return [];
      const { data } = await supabase
        .from("icd10_codes")
        .select("id, code, name_ru")
        .eq("is_leaf", true)
        .or(`name_ru.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`)
        .limit(20);
      return data || [];
    },
    enabled: showForm && search.trim().length >= 1,
  });

  const handleSave = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("patient_diagnoses").insert({
        patient_id: patientId,
        hospitalization_id: hospitalizationId,
        hospital_id: hospitalId,
        icd10_code: selected.code,
        diagnosis_type: diagType,
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Диагноз добавлен");
      setShowForm(false);
      setSelected(null);
      setSearch("");
      setDiagType("main");
      queryClient.invalidateQueries({ queryKey: ["inpatient-diagnoses", hospitalizationId] });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Диагнозы</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border rounded p-3 space-y-3 bg-muted/30">
          <div className="relative">
            <Input
              value={selected ? `${selected.code} — ${selected.name_ru}` : search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Поиск по МКБ-10..."
            />
            {!selected && searchResults.length > 0 && (
              <div className="absolute z-50 w-full bg-card border rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                {searchResults.map((r: any) => (
                  <div
                    key={r.id}
                    className="px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                    onClick={() => { setSelected(r); setSearch(""); }}
                  >
                    <span className="font-medium">{r.code}</span> — {r.name_ru}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Select value={diagType} onValueChange={setDiagType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Основной</SelectItem>
              <SelectItem value="complication">Осложнение</SelectItem>
              <SelectItem value="concurrent">Сопутствующий</SelectItem>
              <SelectItem value="background">Фоновый</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={!selected || submitting}>
              {submitting ? "..." : "Сохранить"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setSelected(null); setSearch(""); }}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {diagnoses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Диагнозов пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((d: any) => (
            <li key={d.id} className="border rounded p-2 text-sm flex items-center justify-between">
              <div>
                <span className="font-medium">{d.icd10_codes?.code || d.icd10_code}</span>{" "}
                — {d.icd10_codes?.name_ru || ""}
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted">{d.diagnosis_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
