import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus } from "lucide-react";
import { format, differenceInDays, differenceInYears } from "date-fns";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { LabResultsButton } from "@/components/lab/LabResultsButton";

export default function InpatientPatientDetail() {
  const { hospId } = useParams<{ hospId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: hosp, isLoading } = useQuery({
    queryKey: ["physician-hosp", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospitalizations")
        .select(
          "*, patients(*), departments(name), room_assignments(bed_number, rooms(name)), hospitalization_orders(*)",
        )
        .eq("id", hospId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!hospId,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!hosp) return <p className="text-destructive">Hospitalization not found.</p>;

  const patient = hosp.patients as any;
  const ra = (hosp.room_assignments as any[])?.[0];
  const days = differenceInDays(new Date(), new Date(hosp.admitted_at));
  const age = patient?.date_of_birth ? differenceInYears(new Date(), new Date(patient.date_of_birth)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/physician/inpatient")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Inpatients
        </Button>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="text-2xl">
              {patient?.last_name} {patient?.first_name}
            </span>
            <span className="text-sm font-normal text-muted-foreground">#{patient?.patient_number}</span>
            {patient?.allergies && <Badge variant="destructive">Allergies</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">DOB</span>
              <p>{patient?.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Age</span>
              <p>{age ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Hosp #</span>
              <p className="font-mono">{hosp.hospitalization_number}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Department</span>
              <p>{(hosp.departments as any)?.name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Room/Bed</span>
              <p>{ra ? `${ra.rooms?.name} / ${ra.bed_number}` : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Admitted</span>
              <p>{format(new Date(hosp.admitted_at), "MMM d, yyyy HH:mm")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Days</span>
              <p>{days}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: documents placeholder */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Documents will appear here (Phase 7)</p>
          </CardContent>
        </Card>

        {/* Right: tabs */}
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <TabsSection hospId={hospId!} hosp={hosp} patient={patient} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============ Tabs Section (lifts shared data) ============ */

function TabsSection({ hospId, hosp, patient }: { hospId: string; hosp: any; patient: any }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  const { data: allServices = [] } = useQuery({
    queryKey: ["inpatient-visit-services", hospId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select(
          "id, source, cost_at_time, assigned_physician_id, service_statuses(code, name_ru), services(id, name, service_type_id, cost_with_vat), physicians!visit_services_assigned_physician_id_fkey(profiles(full_name))",
        )
        .eq("hospitalization_id", hospId)
        .eq("hospital_id", user!.hospitalId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hospId && !!user?.hospitalId,
  });

  const refetchServices = () => {
    queryClient.invalidateQueries({ queryKey: ["inpatient-visit-services", hospId] });
  };

  const ordersServices = allServices.filter(
    (vs: any) => vs.services?.service_type_id !== labTypeId && vs.services?.service_type_id !== consultTypeId,
  );
  const labServices = allServices.filter((vs: any) => vs.services?.service_type_id === labTypeId);
  const consultServices = allServices.filter((vs: any) => vs.services?.service_type_id === consultTypeId);

  return (
    <Tabs defaultValue="orders">
      <TabsList className="bg-green-100 dark:bg-green-950">
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="lab">Lab</TabsTrigger>
        <TabsTrigger value="consultation">Consultation</TabsTrigger>
        <TabsTrigger value="care">Care</TabsTrigger>
        <TabsTrigger value="diagnoses">Diagnoses</TabsTrigger>
      </TabsList>
      <TabsContent value="orders" className="pt-4">
        <ServiceListBase
          hospId={hospId}
          patientId={hosp.patient_id}
          services={ordersServices}
          onAdded={refetchServices}
          excludeTypeIds={[labTypeId, consultTypeId].filter(Boolean) as string[]}
          emptyText="No orders yet."
          addLabel="Add Service"
        />
      </TabsContent>
      <TabsContent value="lab" className="pt-4">
        <ServiceListBase
          hospId={hospId}
          patientId={hosp.patient_id}
          services={labServices}
          onAdded={refetchServices}
          catalogTypeId={labTypeId}
          emptyText="No lab orders yet."
          addLabel="Order Lab"
          showLabResults
        />
      </TabsContent>
      <TabsContent value="consultation" className="pt-4">
        <ConsultationTab
          hospId={hospId}
          patientId={hosp.patient_id}
          services={consultServices}
          onAdded={refetchServices}
          consultTypeId={consultTypeId}
        />
      </TabsContent>
      <TabsContent value="care" className="pt-4">
        <CareTab hospId={hospId} orders={(hosp.hospitalization_orders as any[]) || []} />
      </TabsContent>
      <TabsContent value="diagnoses" className="pt-4">
        <DiagnosesTab hospId={hospId} patientId={patient?.id} />
      </TabsContent>
    </Tabs>
  );
}

/* ============ Service List ============ */

function ServiceListBase({
  hospId,
  patientId,
  services,
  onAdded,
  emptyText,
  addLabel,
  catalogTypeId,
  excludeTypeIds,
  showLabResults,
}: {
  hospId: string;
  patientId: string;
  services: any[];
  onAdded: () => void;
  emptyText: string;
  addLabel: string;
  catalogTypeId?: string | null;
  excludeTypeIds?: string[];
  showLabResults?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: catalog = [] } = useQuery({
    queryKey: ["services-catalog", user?.hospitalId, catalogTypeId ?? "all", (excludeTypeIds || []).join(",")],
    queryFn: async () => {
      let q = supabase
        .from("services")
        .select("id, name, cost_with_vat, service_type_id")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (catalogTypeId) q = q.eq("service_type_id", catalogTypeId);
      const { data } = await q;
      let list = data || [];
      if (excludeTypeIds && excludeTypeIds.length) {
        list = list.filter((s: any) => !excludeTypeIds.includes(s.service_type_id));
      }
      return list;
    },
    enabled: !!user && open,
  });

  const handleAdd = async () => {
    if (!serviceId) return;
    setSubmitting(true);
    try {
      const svc = catalog.find((s: any) => s.id === serviceId);
      const { error } = await supabase.rpc("inpatient_add_service", {
        p_hospitalization_id: hospId,
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_ordered_by: user!.id,
        p_service_id: serviceId,
        p_assigned_physician_id: null,
        p_cost_at_time: (svc as any)?.cost_with_vat ?? 0,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Service ordered.");
      setOpen(false);
      setServiceId("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </div>
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {services.map((vs: any) => (
            <li key={vs.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <span>{vs.services?.name}</span>
              <div className="flex items-center gap-2">
                {showLabResults && vs.service_statuses?.code === "completed" && (
                  <LabResultsButton visitServiceId={vs.id} />
                )}
                <Badge variant="outline">{vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{addLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!serviceId || submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Consultation Tab ============ */

function ConsultationTab({
  hospId,
  patientId,
  services,
  onAdded,
  consultTypeId,
}: {
  hospId: string;
  patientId: string;
  services: any[];
  onAdded: () => void;
  consultTypeId: string | null;
}) {
  const { user } = useAuth();
  const { physicianId: currentPhysicianId } = usePhysicianId();
  const [open, setOpen] = useState(false);
  const [physicianId, setPhysicianId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: physicians = [] } = useQuery({
    queryKey: ["physicians-other", user?.hospitalId, currentPhysicianId],
    queryFn: async () => {
      let q = supabase
        .from("physicians")
        .select("id, specialization, profiles!inner(full_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true);
      if (currentPhysicianId) q = q.neq("id", currentPhysicianId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!user?.hospitalId && open,
  });

  const { data: privileges = [] } = useQuery({
    queryKey: ["physician-privileges", physicianId],
    queryFn: async () => {
      const { data } = await supabase
        .from("physician_service_privileges")
        .select("service_id, services(id, name, cost_with_vat, service_type_id)")
        .eq("physician_id", physicianId);
      return data || [];
    },
    enabled: open && !!physicianId,
  });

  const consultPrivileges = privileges.filter((p: any) => p.services?.service_type_id === consultTypeId);

  const handleAdd = async () => {
    if (!physicianId || !serviceId) return;
    setSubmitting(true);
    try {
      const svc = consultPrivileges.find((p: any) => p.services?.id === serviceId)?.services;
      const { error } = await supabase.rpc("inpatient_add_service", {
        p_hospitalization_id: hospId,
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_ordered_by: user!.id,
        p_service_id: serviceId,
        p_assigned_physician_id: physicianId,
        p_cost_at_time: (svc as any)?.cost_with_vat ?? 0,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Consultation requested.");
      setOpen(false);
      setPhysicianId("");
      setServiceId("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Request Consultation
        </Button>
      </div>
      {services.length === 0 ? (
        <p className="text-sm text-muted-foreground">No consultations yet.</p>
      ) : (
        <ul className="space-y-2">
          {services.map((vs: any) => (
            <li key={vs.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <div>
                <p>{vs.services?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {vs.physicians?.profiles?.full_name || "Unassigned"}
                </p>
              </div>
              <Badge variant="outline">{vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}</Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Consultation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Physician</Label>
              <Select
                value={physicianId}
                onValueChange={(v) => {
                  setPhysicianId(v);
                  setServiceId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select physician" />
                </SelectTrigger>
                <SelectContent>
                  {physicians.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.profiles?.full_name}
                      {p.specialization ? ` — ${p.specialization}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service</Label>
              <Select value={serviceId} onValueChange={setServiceId} disabled={!physicianId}>
                <SelectTrigger>
                  <SelectValue placeholder={physicianId ? "Select service" : "Select physician first"} />
                </SelectTrigger>
                <SelectContent>
                  {consultPrivileges.map((p: any) => (
                    <SelectItem key={p.services.id} value={p.services.id}>
                      {p.services.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!physicianId || !serviceId || submitting}>
              {submitting ? "Saving…" : "Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============ Care Tab ============ */

function CareTab({ hospId, orders }: { hospId: string; orders: any[] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dietValue, setDietValue] = useState("");
  const [activityValue, setActivityValue] = useState("");
  const [careNote, setCareNote] = useState("");
  const [savingType, setSavingType] = useState<string | null>(null);

  const { data: diets = [] } = useQuery({
    queryKey: ["diet-types"],
    queryFn: async () => {
      const { data } = await supabase.from("diet_types").select("id, code, name_ru");
      return data || [];
    },
  });

  const { data: modes = [] } = useQuery({
    queryKey: ["activity-modes"],
    queryFn: async () => {
      const { data } = await supabase.from("activity_modes").select("id, code, name_ru");
      return data || [];
    },
  });

  const saveOrder = async (order_type: string, order_value: string) => {
    setSavingType(order_type);
    try {
      const { error } = await supabase.from("hospitalization_orders").insert({
        hospitalization_id: hospId,
        hospital_id: user!.hospitalId,
        order_type,
        order_value,
        ordered_by: user!.id,
        ordered_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Order saved.");
      queryClient.invalidateQueries({ queryKey: ["physician-hosp", hospId] });
      setDietValue("");
      setActivityValue("");
      setCareNote("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save order");
    } finally {
      setSavingType(null);
    }
  };

  const dietOrders = orders.filter((o) => o.order_type === "diet");
  const activityOrders = orders.filter((o) => o.order_type === "activity_mode");
  const careOrders = orders.filter((o) => o.order_type === "care");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h4 className="font-medium">Diet</h4>
        <div className="flex gap-2">
          <Select value={dietValue} onValueChange={setDietValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select diet" />
            </SelectTrigger>
            <SelectContent>
              {diets.map((d: any) => (
                <SelectItem key={d.id} value={d.name_ru}>
                  {d.name_ru || d.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!dietValue || savingType === "diet"} onClick={() => saveOrder("diet", dietValue)}>
            {savingType === "diet" ? "Saving…" : "Save"}
          </Button>
        </div>
        <ul className="text-sm space-y-1">
          {dietOrders.map((o) => (
            <li key={o.id} className="text-muted-foreground">
              {format(new Date(o.ordered_at), "MMM d HH:mm")} — {o.order_value}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">Activity Mode</h4>
        <div className="flex gap-2">
          <Select value={activityValue} onValueChange={setActivityValue}>
            <SelectTrigger>
              <SelectValue placeholder="Select mode" />
            </SelectTrigger>
            <SelectContent>
              {modes.map((m: any) => (
                <SelectItem key={m.id} value={m.name_ru}>
                  {m.name_ru || m.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!activityValue || savingType === "activity_mode"}
            onClick={() => saveOrder("activity_mode", activityValue)}
          >
            {savingType === "activity_mode" ? "Saving…" : "Save"}
          </Button>
        </div>
        <ul className="text-sm space-y-1">
          {activityOrders.map((o) => (
            <li key={o.id} className="text-muted-foreground">
              {format(new Date(o.ordered_at), "MMM d HH:mm")} — {o.order_value}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h4 className="font-medium">Care Instructions</h4>
        <div className="flex gap-2">
          <Input value={careNote} onChange={(e) => setCareNote(e.target.value)} placeholder="Instruction…" />
          <Button
            disabled={!careNote.trim() || savingType === "care"}
            onClick={() => saveOrder("care", careNote.trim())}
          >
            {savingType === "care" ? "Saving…" : "Save"}
          </Button>
        </div>
        <ul className="text-sm space-y-1">
          {careOrders.map((o) => (
            <li key={o.id} className="text-muted-foreground">
              {format(new Date(o.ordered_at), "MMM d HH:mm")} — {o.order_value}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ============ Diagnoses Tab ============ */

function DiagnosesTab({ hospId, patientId }: { hospId: string; patientId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [diagType, setDiagType] = useState("main");
  const [acuity, setAcuity] = useState("acute");
  const [submitting, setSubmitting] = useState(false);

  const { data: diagnoses = [] } = useQuery({
    queryKey: ["patient-diagnoses", hospId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_diagnoses")
        .select("id, diagnosis_type, acuity, recorded_at, icd10_codes(code, name_ru)")
        .eq("hospitalization_id", hospId);
      return data || [];
    },
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["icd10-search", search],
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
    enabled: open && search.trim().length >= 1,
  });

  const handleSave = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("patient_diagnoses").insert({
        patient_id: patientId,
        hospitalization_id: hospId,
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
      queryClient.invalidateQueries({ queryKey: ["patient-diagnoses", hospId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save diagnosis");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add Diagnosis
        </Button>
      </div>
      {diagnoses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No diagnoses yet.</p>
      ) : (
        <ul className="space-y-2">
          {diagnoses.map((d: any) => (
            <li key={d.id} className="rounded border p-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {d.icd10_codes?.code} — {d.icd10_codes?.name_ru}
                </span>
                <div className="flex gap-1">
                  <Badge variant="outline">{d.diagnosis_type}</Badge>
                  <Badge variant="outline">{d.acuity}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Diagnosis</DialogTitle>
          </DialogHeader>
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
                  Selected:{" "}
                  <span className="font-medium">
                    {selected.code} — {selected.name_ru}
                  </span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Diagnosis Type</Label>
                <Select value={diagType} onValueChange={setDiagType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acute">Acute</SelectItem>
                    <SelectItem value="chronic">Chronic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!selected || submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
