import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Pencil, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BookingModal } from "@/components/booking/BookingModal";
import { BookingSearch } from "@/components/booking/BookingSearch";
import type { OfficeRoomResult, PhysicianResult, ServiceResult } from "@/components/booking/types";
import { LabResultsButton } from "@/components/lab/LabResultsButton";
import { useQueryClient } from "@tanstack/react-query";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAllergies, setShowAllergies] = useState(false);
  const [showPastVisits, setShowPastVisits] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedPhysician, setSelectedPhysician] = useState<PhysicianResult | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceResult | null>(null);
  const [selectedOfficeRoom, setSelectedOfficeRoom] = useState<OfficeRoomResult | null>(null);
  const [schedulingOrder, setSchedulingOrder] = useState<{ id: string; serviceId: string } | null>(null);

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
        .select("id, allergy_type, description, severity, reaction")
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

  const { data: physicianOrders = [], refetch: refetchOrders } = useQuery({
    queryKey: ["physician-orders", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visit_services")
        .select("id, visit_id, cost_at_time, assigned_physician_id, scheduled_at, queue_number, status_id, service_statuses(code, name_ru), services(id, name), profiles!visit_services_created_by_fkey(full_name)")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .eq("source", "physician")
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!patientId && !!user,
  });

  const { data: visits = [], refetch: refetchVisits } = useQuery({
    queryKey: ["patient-visits", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("visits")
        .select("id, visit_date, status, total_amount, amount_paid, visit_services!visit_id(id, source, cost_at_time, assigned_physician_id, services(id, name), service_statuses(code, name_ru), invoice_items(id))")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!patientId && !!user,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-sm text-destructive">Patient not found.</p>;

  const fullName = [patient.last_name, patient.first_name, patient.middle_name].filter(Boolean).join(" ");

  const cancelService = async (visitServiceId: string, visitId: string, cost: number, total: number) => {
    try {
      const { data: cancelled } = await supabase
        .from("service_statuses").select("id").eq("code", "cancelled").single();

      await supabase.from("visit_services").update({ status_id: cancelled!.id }).eq("id", visitServiceId);
      await supabase.from("visits").update({ total_amount: Math.max(0, total - cost) }).eq("id", visitId);
      await supabase.from("invoice_items").delete().eq("visit_service_id", visitServiceId);

      const { data: remaining } = await supabase
        .from("visit_services").select("id")
        .eq("visit_id", visitId)
        .not("status_id", "eq", cancelled!.id);

      if (!remaining || remaining.length === 0) {
        await supabase.from("visits").update({ status: "cancelled" }).eq("id", visitId);
      }

      toast.success("Service cancelled.");
      refetchVisits();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel service.");
    }
  };

  const handleInvoice = async (visitId: string) => {
    const { error } = await supabase.rpc("registrar_invoice_visit", {
      p_visit_id: visitId,
      p_hospital_id: user!.hospitalId,
      p_invoiced_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Invoiced. Patient can proceed to cashier.");
    refetchVisits();
  };

  const handleCancelPhysicianOrder = async (visitServiceId: string) => {
    const { error } = await supabase.rpc("cancel_physician_order", {
      p_visit_service_id: visitServiceId,
      p_hospital_id: user!.hospitalId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Service cancelled and returned to orders.");
    refetchOrders();
    refetchVisits();
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
              <div key={a.id}>
                <span className="capitalize font-medium">
                  {a.description || a.allergy_type}
                </span>
                {a.reaction && (
                  <p className="text-xs text-muted-foreground">
                    Реакция: {a.reaction}
                  </p>
                )}
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

      {/* Persistent search box */}
      <div className="rounded-lg border bg-card p-4 space-y-2">
        <h3 className="font-semibold text-foreground text-sm">Add Service</h3>
        <BookingSearch
          hospitalId={user!.hospitalId}
          onPhysicianSelect={(physician) => {
            setSelectedPhysician(physician);
            setSelectedService(null);
            setSelectedOfficeRoom(null);
            setBookingOpen(true);
          }}
          onServiceSelect={(service) => {
            setSelectedService(service);
            setSelectedPhysician(null);
            setSelectedOfficeRoom(null);
            setBookingOpen(true);
          }}
          onOfficeRoomSelect={(room) => {
            setSelectedOfficeRoom(room);
            setSelectedPhysician(null);
            setSelectedService(null);
            setBookingOpen(true);
          }}
        />
      </div>

      {/* Two-column: Physician Orders | Visits */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Physician Orders */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Physician Orders</h3>
          {physicianOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending physician orders.</p>
          ) : (
            <div className="space-y-2">
              {physicianOrders.map((po: any) => {
                const code = po.service_statuses?.code;
                const visit = po.visit_id ? visits.find((v: any) => v.id === po.visit_id) : null;
                const visitPaid = visit?.status === "paid";
                let state: "enabled" | "disabled" | "paid" | "completed" | "hidden";
                if (code === "cancelled") state = "hidden";
                else if (code === "completed") state = "completed";
                else if (visitPaid || code === "ready_for_execution") state = "paid";
                else if (!po.visit_id) state = "enabled";
                else state = "disabled";

                if (state === "hidden") return null;

                const scheduleLabel = po.scheduled_at
                  ? format(new Date(po.scheduled_at), "MMM d, HH:mm")
                  : po.queue_number != null
                  ? `Queue #${po.queue_number}`
                  : null;

                return (
                  <div key={po.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{po.services?.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        Ordered by: {po.profiles?.full_name || "—"}
                      </div>
                      {po.visit_id && scheduleLabel && (
                        <div className="text-xs text-muted-foreground mt-0.5">{scheduleLabel}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium">{Number(po.cost_at_time || 0).toFixed(2)}</span>
                      {(state === "paid" || state === "completed") && (
                        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {state === "completed" ? "Completed" : "Paid"}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={state !== "enabled"}
                        onClick={() => setSchedulingOrder({ id: po.id, serviceId: po.services?.id })}
                      >
                        Assign & Schedule
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Visits */}
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
              const uninvoiced = (v.visit_services || []).filter(
                (vs: any) =>
                  vs.service_statuses?.code === "preliminary" &&
                  (!vs.invoice_items || vs.invoice_items.length === 0),
              );
              const isFullyInvoiced = uninvoiced.length === 0;
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
                    <div className="text-right text-sm space-y-1">
                      <div className="font-semibold">Total: {total.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">Paid: {paid.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">Outstanding: {outstanding.toFixed(2)}</div>
                    </div>
                  </div>

                  {v.visit_services?.length > 0 && (
                    <div className="space-y-1">
                      {v.visit_services.map((vs: any) => (
                        <div key={vs.id} className="flex items-center justify-between text-xs gap-2">
                          <span className="truncate">
                            {vs.services?.name || "—"}
                            <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              vs.source === "physician"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {vs.source || "—"}
                            </span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {vs.service_statuses?.code === "completed" && (
                              <LabResultsButton visitServiceId={vs.id} variant="indicator" />
                            )}
                            <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                              {vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}
                            </span>
                            {vs.service_statuses?.code === "preliminary" && v.status !== "paid" && v.status !== "cancelled" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10">
                                    Cancel
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Cancel this service?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {vs.source === "physician"
                                        ? `This will cancel "${vs.services?.name}" and return it to the physician orders list.`
                                        : `This will cancel "${vs.services?.name}" and remove it from the invoice.`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>No</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() =>
                                        vs.source === "physician"
                                          ? handleCancelPhysicianOrder(vs.id)
                                          : cancelService(vs.id, v.id, Number(vs.cost_at_time || 0), Number(v.total_amount || 0))
                                      }
                                    >
                                      Yes, cancel
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={isFullyInvoiced}
                      onClick={() => handleInvoice(v.id)}
                    >
                      {isFullyInvoiced ? "Invoiced" : "Invoice"}
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
      </div>

      <EditPatientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient", patientId] })}
      />

      <BookingModal
        open={bookingOpen}
        onOpenChange={(o) => {
          setBookingOpen(o);
          if (!o) {
            setSelectedPhysician(null);
            setSelectedService(null);
            setSelectedOfficeRoom(null);
          }
        }}
        patientId={patientId!}
        hospitalId={user!.hospitalId}
        mode="registrar"
        initialPhysician={selectedPhysician}
        initialService={selectedService}
        initialOfficeRoom={selectedOfficeRoom}
        onBooked={() => {
          refetchVisits();
          setBookingOpen(false);
          setSelectedPhysician(null);
          setSelectedService(null);
          setSelectedOfficeRoom(null);
        }}
      />

      <BookingModal
        open={!!schedulingOrder}
        onOpenChange={(o) => { if (!o) setSchedulingOrder(null); }}
        patientId={patientId!}
        hospitalId={user!.hospitalId}
        mode="registrar"
        existingVisitServiceId={schedulingOrder?.id}
        preselectedServiceId={schedulingOrder?.serviceId}
        onBooked={async (result) => {
          if (!result.physicianId && !result.officeRoomId) {
            toast.error("No physician or room selected.");
            return;
          }
          const { error } = await supabase.rpc(
            "registrar_assign_physician_order",
            {
              p_visit_service_id:      schedulingOrder!.id,
              p_patient_id:            patientId!,
              p_hospital_id:           user!.hospitalId,
              p_assigned_by:           user!.id,
              p_assigned_staff_role_id: result.physicianId ?? null,
              p_assigned_room_id:      result.officeRoomId ?? null,
            }
          );
          if (error) { toast.error(error.message); return; }
          toast.success("Service assigned and scheduled.");
          refetchOrders();
          refetchVisits();
          setSchedulingOrder(null);
        }}
      />
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
