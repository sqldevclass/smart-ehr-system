import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { format, differenceInYears, startOfDay, endOfDay, isToday } from "date-fns";
import { LabResultsButton } from "@/components/lab/LabResultsButton";
import { cn } from "@/lib/utils";

const statusBadge = (code?: string | null) => {
  switch (code) {
    case "preliminary": return "bg-yellow-100 text-yellow-900 border-yellow-200";
    case "ready_for_execution": return "bg-green-100 text-green-900 border-green-200";
    case "completed": return "bg-blue-100 text-blue-900 border-blue-200";
    default: return "bg-muted text-muted-foreground";
  }
};

export default function OutpatientPatientDetail() {
  const { patientId } = useParams<{ patientId: string }>();
  const { user } = useAuth();
  const { physicianId } = usePhysicianId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showMore, setShowMore] = useState(false);
  const [showAllergies, setShowAllergies] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["outpatient-patient", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*, patient_allergies(id, allergy_type, description, severity), patient_contacts(*)")
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && !!user?.hospitalId,
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase.from("service_types").select("id, code").eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const labTypeId = serviceTypes.find((t: any) => t.code === "laboratory")?.id ?? null;
  const consultTypeId = serviceTypes.find((t: any) => t.code === "consultation")?.id ?? null;

  const { data: hospitalizations = [] } = useQuery({
    queryKey: ["outpatient-patient-hospitalizations", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hospitalizations")
        .select("id, hospitalization_number")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .order("admitted_at", { ascending: false });
      return data || [];
    },
    enabled: !!patientId && !!user?.hospitalId,
  });

  const hospMap = useMemo(
    () => Object.fromEntries(hospitalizations.map((h: any) => [h.id, h.hospitalization_number])),
    [hospitalizations]
  );

  const { data: statuses = [] } = useQuery({
    queryKey: ["service-statuses-codes"],
    queryFn: async () => {
      const { data } = await supabase.from("service_statuses").select("id, code");
      return data || [];
    },
  });
  const readyId = statuses.find((s: any) => s.code === "ready_for_execution")?.id ?? null;
  const prelimId = statuses.find((s: any) => s.code === "preliminary")?.id ?? null;

  const { data: activeServices = [] } = useQuery({
    queryKey: ["outpatient-active-services", patientId, physicianId, readyId],
    queryFn: async () => {
      if (!readyId) return [];
      const { data } = await supabase
        .from("visit_services")
        .select("id, scheduled_at, queue_number, is_waitlist, cost_at_time, service_statuses(code, name_ru), services(name)")
        .eq("patient_id", patientId!)
        .eq("assigned_physician_id", physicianId!)
        .eq("hospital_id", user!.hospitalId)
        .eq("status_id", readyId);
      return data || [];
    },
    enabled: !!patientId && !!physicianId && !!user?.hospitalId && !!readyId,
  });

  const handleComplete = async (vsId: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("complete_service", {
      p_visit_service_id: vsId,
      p_completed_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Service completed");
    queryClient.invalidateQueries({ queryKey: ["outpatient-today-services"] });
    queryClient.invalidateQueries({ queryKey: ["outpatient-orders"] });
    queryClient.invalidateQueries({ queryKey: ["outpatient-lab"] });
    queryClient.invalidateQueries({ queryKey: ["outpatient-consult"] });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-destructive">Patient not found.</p>;

  const age = patient.date_of_birth ? differenceInYears(new Date(), new Date(patient.date_of_birth)) : null;
  const allergies = (patient.patient_allergies as any[]) || [];
  const contacts = (patient.patient_contacts as any[]) || [];
  const canOrder = activeServices.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/physician")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to My Patients
        </Button>
      </div>

      {/* Patient card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl">
              {patient.last_name} {patient.first_name}
            </span>
            <span className="text-sm font-normal text-muted-foreground">#{patient.patient_number}</span>
            {allergies.length > 0 && (
              <button
                onClick={() => setShowAllergies((v) => !v)}
                className="rounded border border-destructive bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
              >
                Allergies ({allergies.length})
              </button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">DOB</span>
              <p>{patient.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Age</span>
              <p>{age ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Gender</span>
              <p>{patient.gender || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p>{patient.phone || "—"}</p>
            </div>
          </div>

          {showAllergies && allergies.length > 0 && (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive mb-1">Allergies</p>
              <ul className="space-y-1">
                {allergies.map((a: any, i: number) => (
                  <li key={a.id || i}>
                    <span className="font-medium">{a.allergy_type}</span>
                    {a.description && (
                      <span className="text-muted-foreground ml-1">— {a.description}</span>
                    )}
                    {a.severity && (
                      <Badge variant="outline" className="ml-1">{a.severity}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={() => setShowMore((v) => !v)} className="gap-1">
            {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showMore ? "Show less" : "Show more"}
          </Button>

          {showMore && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border-t pt-3">
              <div>
                <span className="text-muted-foreground">Address</span>
                <p>{patient.address || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Email</span>
                <p>{patient.email || "—"}</p>
              </div>
              {contacts.length > 0 && (
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">Contacts</span>
                  <ul className="mt-1 space-y-1">
                    {contacts.map((c: any, i: number) => (
                      <li key={i}>
                        {c.name} {c.relationship && `(${c.relationship})`} — {c.phone}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active services */}
      {activeServices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active Services</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {activeServices.map((vs: any) => (
                <li key={vs.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{vs.services?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {vs.scheduled_at ? format(new Date(vs.scheduled_at), "HH:mm") : vs.queue_number != null ? `#${vs.queue_number}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${statusBadge(vs.service_statuses?.code)}`}>
                      {vs.service_statuses?.name_ru || vs.service_statuses?.code}
                    </span>
                    {vs.service_statuses?.code === "ready_for_execution" && (
                      <Button size="sm" onClick={() => handleComplete(vs.id)}>Complete</Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="lab">Lab</TabsTrigger>
              <TabsTrigger value="consultation">Consultation</TabsTrigger>
              <TabsTrigger value="care">Care</TabsTrigger>
              <TabsTrigger value="diagnoses">Diagnoses</TabsTrigger>
            </TabsList>
            <TabsContent value="orders" className="pt-4">
              <OrdersTab
                patientId={patientId!}
                physicianId={physicianId}
                labTypeId={labTypeId}
                consultTypeId={consultTypeId}
                canOrder={canOrder}
                hospMap={hospMap}
              />
            </TabsContent>
            <TabsContent value="lab" className="pt-4">
              <LabTab patientId={patientId!} physicianId={physicianId} labTypeId={labTypeId} canOrder={canOrder} hospMap={hospMap} />
            </TabsContent>
            <TabsContent value="consultation" className="pt-4">
              <ConsultTab patientId={patientId!} physicianId={physicianId} consultTypeId={consultTypeId} canOrder={canOrder} hospMap={hospMap} />
            </TabsContent>
            <TabsContent value="care" className="pt-4">
              <CareTab patientId={patientId!} />
            </TabsContent>
            <TabsContent value="diagnoses" className="pt-4">
              <DiagnosesTab patientId={patientId!} canOrder={canOrder} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============ helpers ============ */

function isHistorical(createdAt: string | null): boolean {
  if (!createdAt) return false;
  return !isToday(new Date(createdAt));
}

function ContextBadge({ hospNumber }: { hospNumber: string | null }) {
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {hospNumber || "Outpatient"}
    </Badge>
  );
}

async function deletePhysicianOrder(
  visitServiceId: string,
  hospitalId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  patientId: string,
) {
  const { error } = await supabase.rpc("delete_physician_order", {
    p_visit_service_id: visitServiceId,
    p_hospital_id: hospitalId,
  });
  if (error) { toast.error(error.message); return; }
  toast.success("Order deleted.");
  queryClient.invalidateQueries({ queryKey: ["outpatient-orders", patientId] });
  queryClient.invalidateQueries({ queryKey: ["outpatient-lab", patientId] });
  queryClient.invalidateQueries({ queryKey: ["outpatient-consult", patientId] });
}

function canDelete(vs: any): boolean {
  return vs.service_statuses?.code === "preliminary"
    && (!vs.invoice_items || vs.invoice_items.length === 0);
}

/* ============ Orders Tab ============ */

function OrdersTab({
  patientId, physicianId, labTypeId, consultTypeId, canOrder, hospMap,
}: {
  patientId: string;
  physicianId: string | null | undefined;
  labTypeId: string | null;
  consultTypeId: string | null;
  canOrder: boolean;
  hospMap: Record<string, string>;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["outpatient-orders", patientId, labTypeId, consultTypeId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select("id, created_at, cost_at_time, hospitalization_id, service_statuses(code, name_ru), services(name, service_type_id)")
        .eq("patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      return (data || []).filter((vs: any) =>
        vs.services?.service_type_id !== labTypeId && vs.services?.service_type_id !== consultTypeId
      );
    },
    enabled: !!user?.hospitalId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["services-catalog-orders", user?.hospitalId, labTypeId, consultTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_type_id")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return (data || []).filter((s: any) =>
        s.service_type_id !== labTypeId && s.service_type_id !== consultTypeId
      );
    },
    enabled: !!user?.hospitalId && open,
  });

  const handleAdd = async () => {
    if (!serviceId) return;
    setSubmitting(true);
    try {
      const svc = catalog.find((s: any) => s.id === serviceId);
      const { error } = await supabase.rpc("physician_order_services", {
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_ordered_by: user!.id,
        p_services: [{
          service_id: serviceId,
          assigned_physician_id: null,
          cost_at_time: (svc as any)?.cost_with_vat ?? 0,
        }],
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Order placed. Patient can pay at the registrar.");
      setOpen(false);
      setServiceId("");
      queryClient.invalidateQueries({ queryKey: ["outpatient-orders"] });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3">
      {canOrder ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Add Order
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Orders can be placed once the patient has paid for their visit.
        </p>
      )}
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {services.map((vs: any) => (
            <li key={vs.id} className={cn("flex items-center justify-between rounded border p-2 text-sm",
              isHistorical(vs.created_at) && "bg-muted/30")}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{vs.services?.name}</span>
                <ContextBadge hospNumber={hospMap[vs.hospitalization_id] ?? null} />
                <span className="text-xs text-muted-foreground">
                  {vs.created_at && format(new Date(vs.created_at), "MMM d, yyyy")}
                </span>
              </div>
              <Badge variant="outline">{vs.service_statuses?.name_ru || vs.service_statuses?.code}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {catalog.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!serviceId || submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Lab Tab ============ */

function LabTab({ patientId, physicianId, labTypeId, canOrder, hospMap }: { patientId: string; physicianId: string | null | undefined; labTypeId: string | null; canOrder: boolean; hospMap: Record<string, string> }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["outpatient-lab", patientId, labTypeId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select("id, created_at, hospitalization_id, service_statuses(code, name_ru), services(id, name, service_type_id)")
        .eq("patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      return (data || []).filter((vs: any) => vs.services?.service_type_id === labTypeId);
    },
    enabled: !!user?.hospitalId && !!labTypeId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["services-catalog-lab", user?.hospitalId, labTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_type_id")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      return (data || []).filter((s: any) => s.service_type_id === labTypeId);
    },
    enabled: !!user?.hospitalId && !!labTypeId && open,
  });

  const handleAdd = async () => {
    if (!serviceId) return;
    setSubmitting(true);
    try {
      const svc = catalog.find((s: any) => s.id === serviceId);
      const { error } = await supabase.rpc("physician_order_services", {
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_ordered_by: user!.id,
        p_services: [{
          service_id: serviceId,
          assigned_physician_id: null,
          cost_at_time: (svc as any)?.cost_with_vat ?? 0,
        }],
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Lab order placed. Patient can pay at the registrar.");
      setOpen(false);
      setServiceId("");
      queryClient.invalidateQueries({ queryKey: ["outpatient-lab"] });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3">
      {canOrder ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Order Lab
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Orders can be placed once the patient has paid for their visit.
        </p>
      )}
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lab orders.</p>
      ) : (
        <ul className="space-y-2">
          {services.map((vs: any) => (
            <li key={vs.id} className={cn("flex items-center justify-between rounded border p-2 text-sm",
              isHistorical(vs.created_at) && "bg-muted/30")}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{vs.services?.name}</span>
                <ContextBadge hospNumber={hospMap[vs.hospitalization_id] ?? null} />
                <span className="text-xs text-muted-foreground">
                  {vs.created_at && format(new Date(vs.created_at), "MMM d, yyyy")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {vs.service_statuses?.code === "completed" && <LabResultsButton visitServiceId={vs.id} />}
                <Badge variant="outline">{vs.service_statuses?.name_ru || vs.service_statuses?.code}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Order Lab</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Lab Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Select lab service" /></SelectTrigger>
                <SelectContent>
                  {catalog.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!serviceId || submitting}>
              {submitting ? "Adding…" : "Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Consultation Tab ============ */

function ConsultTab({
  patientId, physicianId, consultTypeId, canOrder, hospMap,
}: {
  patientId: string;
  physicianId: string | null | undefined;
  consultTypeId: string | null;
  canOrder: boolean;
  hospMap: Record<string, string>;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["outpatient-consult", patientId, consultTypeId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select("id, created_at, hospitalization_id, assigned_physician_id, service_statuses(code, name_ru), services(name, service_type_id), physicians!visit_services_assigned_physician_id_fkey(profiles(full_name))")
        .eq("patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      return (data || []).filter((vs: any) => vs.services?.service_type_id === consultTypeId);
    },
    enabled: !!user?.hospitalId && !!consultTypeId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["consult-services-catalog", user?.hospitalId, consultTypeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name, cost_with_vat")
        .eq("hospital_id", user!.hospitalId)
        .eq("service_type_id", consultTypeId!)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: open && !!user?.hospitalId && !!consultTypeId,
  });

  const handleAdd = async () => {
    if (!serviceId) return;
    setSubmitting(true);
    try {
      const svc = catalog.find((s: any) => s.id === serviceId);
      const { error } = await supabase.rpc("physician_order_services", {
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_ordered_by: user!.id,
        p_services: [{
          service_id: serviceId,
          assigned_physician_id: null,
          cost_at_time: (svc as any)?.cost_with_vat ?? 0,
        }],
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Consultation requested.");
      setOpen(false);
      setServiceId("");
      queryClient.invalidateQueries({ queryKey: ["outpatient-consult"] });
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3">
      {canOrder ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Request Consultation
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Orders can be placed once the patient has paid for their visit.
        </p>
      )}
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consultations yet.</p>
      ) : (
        <ul className="space-y-2">
          {services.map((vs: any) => (
            <li key={vs.id} className={cn("flex items-center justify-between rounded border p-2 text-sm",
              isHistorical(vs.created_at) && "bg-muted/30")}>
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <span className="font-medium">{vs.services?.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {vs.physicians?.profiles?.full_name || "Unassigned"}
                  </span>
                </div>
                <ContextBadge hospNumber={hospMap[vs.hospitalization_id] ?? null} />
              </div>
              <Badge variant="outline">{vs.service_statuses?.name_ru || vs.service_statuses?.code}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Consultation</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Select consultation service" /></SelectTrigger>
                <SelectContent>
                  {catalog.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!serviceId || submitting}>
              {submitting ? "Saving…" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Care Tab ============ */

function CareTab({ patientId }: { patientId: string }) {
  const { user } = useAuth();

  const { data: orders = [] } = useQuery({
    queryKey: ["outpatient-care", patientId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hospitalization_orders")
        .select("id, order_type, order_value, ordered_at, hospitalization_id, hospitalizations!inner(patient_id, hospitalization_number)")
        .eq("hospitalizations.patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .eq("ordered_by", user!.id)
        .order("ordered_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const groups = useMemo(() => {
    const g: Record<string, any[]> = { diet: [], activity_mode: [], care: [] };
    for (const o of orders as any[]) {
      const k = o.order_type;
      if (!g[k]) g[k] = [];
      g[k].push(o);
    }
    return g;
  }, [orders]);

  const renderSection = (title: string, key: string) => (
    <section className="space-y-2">
      <h4 className="font-medium">{title}</h4>
      {(groups[key] || []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No records.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {groups[key].map((o: any) => (
            <li key={o.id} className={cn("flex items-center gap-2 rounded border p-2",
              isHistorical(o.ordered_at) && "bg-muted/30")}>
              <span className="text-muted-foreground text-xs">
                {format(new Date(o.ordered_at), "MMM d, yyyy")}
              </span>
              <span>— {o.order_value}</span>
              <ContextBadge hospNumber={o.hospitalizations?.hospitalization_number ?? null} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {renderSection("Diet", "diet")}
      {renderSection("Activity Mode", "activity_mode")}
      {renderSection("Care Instructions", "care")}
      <p className="text-xs text-muted-foreground italic">
        Care orders can be added during hospitalization.
      </p>
    </div>
  );
}

/* ============ Diagnoses Tab ============ */

function DiagnosesTab({ patientId, canOrder }: { patientId: string; canOrder: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [diagType, setDiagType] = useState("main");
  const [acuity, setAcuity] = useState("acute");
  const [submitting, setSubmitting] = useState(false);

  const { data: diagnoses = [] } = useQuery({
    queryKey: ["outpatient-diagnoses", patientId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select("id, icd10_code, diagnosis_type, acuity, recorded_at, hospitalization_id, hospitalizations(hospitalization_number), icd10_codes(code, name_ru)")
        .eq("patient_id", patientId)
        .eq("hospital_id", user!.hospitalId)
        .eq("recorded_by", user!.id)
        .order("recorded_at", { ascending: false });
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["icd10-search-out", search],
    queryFn: async () => {
      if (search.trim().length < 2) return [];
      const { data } = await supabase
        .from("icd10_codes")
        .select("id, code, name_ru")
        .eq("is_leaf", true)
        .ilike("name_ru", `%${search.trim()}%`)
        .limit(20);
      return data || [];
    },
    enabled: open && search.trim().length >= 2,
  });

  const handleSave = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("patient_diagnoses").insert({
        patient_id: patientId,
        hospitalization_id: null,
        hospital_id: user!.hospitalId,
        icd10_code: selected.code,
        diagnosis_type: diagType,
        acuity,
        recorded_by: user!.id,
        recorded_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Diagnosis added.");
      setOpen(false);
      setSelected(null);
      setSearch("");
      queryClient.invalidateQueries({ queryKey: ["outpatient-diagnoses", patientId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save diagnosis");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3">
      {canOrder ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Add Diagnosis
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Orders can be placed once the patient has paid for their visit.
        </p>
      )}
      {diagnoses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No diagnoses yet.</p>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((d: any) => (
            <li key={d.id} className={cn("rounded border p-2 text-sm",
              isHistorical(d.recorded_at) && "bg-muted/30")}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">
                  {d.icd10_codes?.code} — {d.icd10_codes?.name_ru}
                </span>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{d.diagnosis_type}</Badge>
                  <Badge variant="outline">{d.acuity}</Badge>
                  <ContextBadge hospNumber={d.hospitalizations?.hospitalization_number ?? null} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {d.recorded_at && format(new Date(d.recorded_at), "MMM d, yyyy")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Add Diagnosis</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Search ICD-10</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type at least 2 characters…"
              />
              {searchResults.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-auto rounded border bg-card text-sm">
                  {searchResults.map((r: any) => (
                    <li
                      key={r.id}
                      className={`cursor-pointer p-2 hover:bg-accent ${selected?.id === r.id ? "bg-accent" : ""}`}
                      onClick={() => setSelected(r)}
                    >
                      {r.name_ru} ({r.code})
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <p className="mt-2 text-sm">
                  Selected: <span className="font-medium">{selected.code} — {selected.name_ru}</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Diagnosis Type</Label>
                <Select value={diagType} onValueChange={setDiagType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Main</SelectItem>
                    <SelectItem value="complication">Complication</SelectItem>
                    <SelectItem value="competing">Competing</SelectItem>
                    <SelectItem value="background">Background</SelectItem>
                    <SelectItem value="comorbid">Comorbid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Acuity</Label>
                <Select value={acuity} onValueChange={setAcuity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acute">Acute</SelectItem>
                    <SelectItem value="chronic">Chronic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!selected || submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
