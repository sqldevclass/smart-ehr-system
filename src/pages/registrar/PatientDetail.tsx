import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Plus, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const REGISTRATION_SOURCES = [
  "Facebook",
  "Instagram",
  "Google Search",
  "Friend Recommendation",
  "Doctor Referral",
  "Other",
];

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAllergies, setShowAllergies] = useState(false);
  const [showPastVisits, setShowPastVisits] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && !!user,
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_allergies")
        .select("id, allergy_type, description, severity")
        .eq("patient_id", patientId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["patient-contacts", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_contacts")
        .select("id, name, relationship, phone, is_primary")
        .eq("patient_id", patientId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["patient-visits", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("id, visit_date, status, total_amount, amount_paid, visit_services(id, source, services(name), service_statuses(code, name_ru), invoice_items(id))")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId && !!user,
  });

  const hasVisitToday = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return visits.some((v: any) => (v.visit_date || "").startsWith(today));
  }, [visits]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-sm text-destructive">Patient not found.</p>;

  const fullName = [patient.last_name, patient.first_name, patient.middle_name].filter(Boolean).join(" ");

  const handleSendToCashier = () => toast.success("Sent to cashier.");

  const handleInvoiceOrders = async (uninvoicedOrders: any[]) => {
    const { error } = await supabase.rpc("registrar_invoice_physician_orders", {
      p_patient_id: patientId!,
      p_hospital_id: user!.hospitalId,
      p_invoiced_by: user!.id,
      p_visit_service_ids: uninvoicedOrders.map((vs: any) => vs.id),
    });
    if (error) {
      toast.error(error.message || "Failed to invoice orders.");
      return;
    }
    toast.success("Physician orders invoiced.");
    queryClient.invalidateQueries({ queryKey: ["patient-visits", patientId] });
  };

  return (
    <div className="max-w-6xl space-y-6">
      <Button variant="ghost" onClick={() => navigate("/registrar")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {/* Patient card */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="font-heading text-3xl font-bold text-foreground leading-tight">{fullName || "—"}</h2>
              {allergies.length > 0 && (
                <button
                  onClick={() => setShowAllergies((s) => !s)}
                  className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/20"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Allergies ({allergies.length})
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {patient.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"}
              </span>
              <span>•</span>
              <span className="capitalize">{patient.gender || "—"}</span>
              <span>•</span>
              <span className="font-mono">#{patient.patient_number || "—"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
            <button
              onClick={() => setShowMore((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showMore ? "Show less" : "Show more"}
            </button>
          </div>
        </div>

        {showAllergies && allergies.length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            {allergies.map((a: any) => (
              <div key={a.id} className="grid grid-cols-3 gap-2 text-xs">
                <span className="capitalize font-medium">{a.allergy_type}</span>
                <span className="text-muted-foreground">{a.description}</span>
                <span className="capitalize text-muted-foreground">{a.severity}</span>
              </div>
            ))}
          </div>
        )}

        {showMore && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <Field label="Phone" value={patient.phone || "—"} />
              <Field label="Status" value={patient.registration_status || "—"} />
              <Field label="Blood Type" value={patient.blood_type || "—"} />
              <Field label="National ID" value={patient.national_id || "—"} />
              <Field label="Email" value={patient.email || "—"} />
              <Field label="Address" value={patient.address || "—"} />
            </div>
            {contacts.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Contacts</p>
                <div className="space-y-1">
                  {contacts.map((c: any) => (
                    <div key={c.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-sm rounded-md border p-2 items-center">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">{c.relationship}</span>
                      <span className="text-muted-foreground">{c.phone}</span>
                      {c.is_primary && (
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Primary</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Two-column layout: Add Service (left) + Visits (right) */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Add Service - left */}
        <div className="rounded-lg border bg-card p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Add Service</h3>
            <p className="text-xs text-muted-foreground">Select a service to add to this patient.</p>
          </div>
          <Button onClick={() => setAddServiceOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Service
          </Button>
        </div>

        {/* Visits - right */}
        <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Visits</h3>
        </div>
        {(() => {
          const isPast = (v: any) => v.status === "paid" || v.status === "cancelled";
          const activeVisits = visits.filter((v: any) => !isPast(v));
          const pastVisits = visits.filter(isPast);

          const renderVisit = (v: any) => {
            const total = Number(v.total_amount || 0);
            const paid = Number(v.amount_paid || 0);
            const outstanding = Math.max(0, total - paid);
            const uninvoicedOrders = (v.visit_services || []).filter(
              (vs: any) =>
                vs.source === "physician" &&
                vs.service_statuses?.code === "preliminary" &&
                (!vs.invoice_items || vs.invoice_items.length === 0),
            );
            const hasUninvoicedPhysicianOrder = uninvoicedOrders.length > 0;
            return (
              <div key={v.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Visit #{v.id.slice(0, 8)}
                    </div>
                    <div className="text-sm font-medium">
                      {v.visit_date ? format(new Date(v.visit_date), "MMM d, yyyy") : "—"}
                    </div>
                    <span className="inline-block mt-1 rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                      {v.status || "—"}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">Total: {total.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Paid: {paid.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">Outstanding: {outstanding.toFixed(2)}</div>
                  </div>
                </div>

                {hasUninvoicedPhysicianOrder && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-center justify-between gap-3 dark:border-amber-700 dark:bg-amber-950/30">
                    <span className="text-xs text-amber-900 dark:text-amber-200">
                      This visit has physician-ordered services not yet invoiced.
                    </span>
                    <Button size="sm" variant="outline" onClick={() => handleInvoiceOrders(uninvoicedOrders)}>
                      Invoice
                    </Button>
                  </div>
                )}

                {v.visit_services?.length > 0 && (
                  <div className="space-y-1">
                    {v.visit_services.map((vs: any) => (
                      <div key={vs.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate">
                          {vs.services?.name || "—"}
                          {vs.source === "physician" && (
                            <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                              physician
                            </span>
                          )}
                        </span>
                        <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground shrink-0">
                          {vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  {outstanding > 0 && (
                    <Button size="sm" variant="outline" onClick={handleSendToCashier}>
                      Send to Cashier
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => navigate(`/registrar/visits/${v.id}`)}>
                    Open Visit
                  </Button>
                </div>
              </div>
            );
          };

          return (
            <>
              {activeVisits.length === 0 && pastVisits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits yet.</p>
              ) : (
                <div className="space-y-3">
                  {activeVisits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active visits.</p>
                  ) : (
                    activeVisits.map(renderVisit)
                  )}

                  {pastVisits.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() => setShowPastVisits((s) => !s)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {showPastVisits ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {showPastVisits ? "Hide past visits" : `Show past visits (${pastVisits.length})`}
                      </button>
                      {showPastVisits && (
                        <div className="mt-3 space-y-3">
                          {pastVisits.map(renderVisit)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <EditPatientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient", patientId] })}
      />

      <AddServiceDialog
        open={addServiceOpen}
        onOpenChange={setAddServiceOpen}
        patientId={patientId!}
        showRegistrationSource={!hasVisitToday}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["patient-visits", patientId] });
          setAddServiceOpen(false);
        }}
      />
    </div>
  );
}

function AddServiceDialog({
  open, onOpenChange, patientId, showRegistrationSource, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId: string;
  showRegistrationSource: boolean;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedPhysicianId, setSelectedPhysicianId] = useState<string>("");
  const [registrationSource, setRegistrationSource] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_types")
        .select("id, name_ru, name_en")
        .eq("hospital_id", user!.hospitalId)
        .order("name_ru");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-by-type", user?.hospitalId, selectedTypeId],
    queryFn: async () => {
      if (!selectedTypeId) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_groups!inner(id, name, service_type_id)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .eq("service_groups.service_type_id", selectedTypeId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!selectedTypeId,
  });

  const selectedService = services.find((s: any) => s.id === selectedServiceId) as any;

  const { data: physicians = [] } = useQuery({
    queryKey: ["service-physicians", selectedServiceId, user?.hospitalId],
    queryFn: async () => {
      if (!selectedServiceId) return [];
      const { data: privs } = await supabase
        .from("physician_service_privileges")
        .select("physician_id")
        .eq("service_id", selectedServiceId)
        .eq("hospital_id", user!.hospitalId);
      const physicianIds = (privs || []).map((p: any) => p.physician_id);

      let query = supabase
        .from("physicians")
        .select("id, profiles!inner(full_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true);

      if (physicianIds.length > 0) {
        query = query.in("id", physicianIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!selectedServiceId,
  });

  const reset = () => {
    setSelectedTypeId(""); setSelectedServiceId("");
    setSelectedPhysicianId(""); setRegistrationSource("");
  };

  const submit = async () => {
    if (!selectedServiceId || !selectedService) {
      toast.error("Select a service.");
      return;
    }
    if (!selectedPhysicianId) {
      toast.error("Select a physician.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("registrar_add_service", {
        p_patient_id: patientId,
        p_hospital_id: user!.hospitalId,
        p_created_by: user!.id,
        p_service_id: selectedServiceId,
        p_assigned_physician_id: selectedPhysicianId,
        p_cost_at_time: selectedService.cost_with_vat,
        p_registration_source: registrationSource || null,
      });
      if (error) throw error;
      toast.success("Service added.");
      reset();
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to add service.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Service</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {serviceTypes.length > 0 ? (
            <Tabs value={selectedTypeId} onValueChange={(v) => { setSelectedTypeId(v); setSelectedServiceId(""); }}>
              <TabsList className="flex flex-wrap h-auto">
                {serviceTypes.map((t: any) => (
                  <TabsTrigger key={t.id} value={t.id}>{t.name_ru || t.name_en}</TabsTrigger>
                ))}
              </TabsList>
              {serviceTypes.map((t: any) => (
                <TabsContent key={t.id} value={t.id} className="pt-4">
                  <ServiceList
                    services={services as any[]}
                    selectedId={selectedServiceId}
                    onSelect={setSelectedServiceId}
                  />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p className="text-sm text-muted-foreground">No service types configured.</p>
          )}

          {selectedService && (
            <div className="rounded-md border p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{selectedService.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Cost: {Number(selectedService.cost_with_vat || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Physician</Label>
                <Select value={selectedPhysicianId} onValueChange={setSelectedPhysicianId}>
                  <SelectTrigger><SelectValue placeholder="Select physician" /></SelectTrigger>
                  <SelectContent>
                    {physicians.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.profiles?.full_name || p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {showRegistrationSource && (
            <div className="space-y-1.5">
              <Label>How did you hear about us?</Label>
              <Select value={registrationSource} onValueChange={setRegistrationSource}>
                <SelectTrigger><SelectValue placeholder="Select (optional)" /></SelectTrigger>
                <SelectContent>
                  {REGISTRATION_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedServiceId || !selectedPhysicianId}>
            {saving ? "Adding…" : "Add Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceList({
  services, selectedId, onSelect,
}: {
  services: any[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  // Group by service_groups.name
  const groups = services.reduce((acc: Record<string, any[]>, s: any) => {
    const g = s.service_groups?.name || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  if (services.length === 0) {
    return <p className="text-sm text-muted-foreground">No services in this category.</p>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([groupName, items]) => {
        const list = items as any[];
        return (
        <div key={groupName}>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{groupName}</p>
          <div className="space-y-1">
            {list.map((s: any) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-md border p-2 text-sm ${selectedId === s.id ? "border-primary bg-primary/5" : ""}`}
              >
                <span className="truncate">{s.name}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {Number(s.cost_with_vat || 0).toFixed(2)}
                  </span>
                  <Button
                    size="sm"
                    variant={selectedId === s.id ? "default" : "outline"}
                    onClick={() => onSelect(s.id)}
                  >
                    {selectedId === s.id ? "Selected" : "Select"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function EditPatientDialog({
  open, onOpenChange, patient, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: any;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    first_name: patient.first_name || "",
    last_name: patient.last_name || "",
    middle_name: patient.middle_name || "",
    date_of_birth: patient.date_of_birth || "",
    gender: patient.gender || "",
    blood_type: patient.blood_type || "",
    national_id: patient.national_id || "",
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    registration_status: patient.registration_status || "minimal",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("patients")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          middle_name: form.middle_name.trim() || null,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          blood_type: form.blood_type || null,
          national_id: form.national_id.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          registration_status: form.registration_status,
        })
        .eq("id", patient.id);
      if (error) throw error;
      toast.success("Patient updated.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Patient</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>First name *</Label>
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name *</Label>
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Middle name</Label>
            <Input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Blood type</Label>
            <Select value={form.blood_type} onValueChange={(v) => set("blood_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>National ID</Label>
            <Input value={form.national_id} onChange={(e) => set("national_id", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Registration status</Label>
            <Select value={form.registration_status} onValueChange={(v) => set("registration_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}
