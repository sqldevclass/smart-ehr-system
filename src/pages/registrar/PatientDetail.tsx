import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Pencil, ChevronDown, ChevronUp, AlertTriangle, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { BookingModal } from "@/components/booking/BookingModal";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAllergies, setShowAllergies] = useState(false);
  const [showPastVisits, setShowPastVisits] = useState(false);
  const [bookingPhysicianId, setBookingPhysicianId] = useState<string | null>(null);
  const [bookingPhysicianName, setBookingPhysicianName] = useState<string>("");
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [bookingServiceName, setBookingServiceName] = useState<string>("");

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
        .select("id, visit_date, status, total_amount, amount_paid, visit_services(id, source, cost_at_time, services(name), service_statuses(code, name_ru), invoice_items(id))")
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

  const cancelService = async (visitServiceId: string, visitId: string, costAtTime: number, visitTotalAmount: number) => {
    try {
      const { data: cancelledStatus, error: statusErr } = await supabase
        .from("service_statuses")
        .select("id")
        .eq("code", "cancelled")
        .single();
      if (statusErr) throw statusErr;

      const { error: updateErr } = await supabase
        .from("visit_services")
        .update({ status_id: cancelledStatus.id })
        .eq("id", visitServiceId);
      if (updateErr) throw updateErr;

      await supabase
        .from("visits")
        .update({ total_amount: Math.max(0, visitTotalAmount - costAtTime) })
        .eq("id", visitId);

      await supabase
        .from("invoice_items")
        .delete()
        .eq("visit_service_id", visitServiceId);

      // Check if any non-cancelled services remain on this visit
      const { data: remainingServices } = await supabase
        .from("visit_services")
        .select("id")
        .eq("visit_id", visitId)
        .not("status_id", "eq", cancelledStatus.id);

      if (!remainingServices || remainingServices.length === 0) {
        await supabase
          .from("visits")
          .update({ status: "cancelled" })
          .eq("id", visitId);
      }

      toast.success("Service cancelled.");
      queryClient.invalidateQueries({ queryKey: ["patient-visits", patientId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel service.");
    }
  };

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
        {/* Search-based booking - left */}
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground">Add Service</h3>
            <p className="text-xs text-muted-foreground">Search a physician or service to book.</p>
          </div>
          <SearchBooking
            onSelectPhysician={(id, name) => {
              setBookingPhysicianId(id);
              setBookingPhysicianName(name);
            }}
            onSelectService={(id, name) => {
              setBookingServiceId(id);
              setBookingServiceName(name);
            }}
          />
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                            {vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}
                          </span>
                          {vs.service_statuses?.code === "preliminary" && (
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
                                    This will cancel "{vs.services?.name}" and remove it from the invoice.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>No</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => cancelService(vs.id, v.id, Number(vs.cost_at_time || 0), Number(v.total_amount || 0))}
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
      </div>

      <EditPatientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient", patientId] })}
      />

      {bookingPhysicianId && (
        <PhysicianBookingDialog
          physicianId={bookingPhysicianId}
          physicianName={bookingPhysicianName}
          patientId={patientId!}
          showRegistrationSource={!hasVisitToday}
          onClose={() => setBookingPhysicianId(null)}
          onBooked={() => {
            queryClient.invalidateQueries({ queryKey: ["patient-visits", patientId] });
            setBookingPhysicianId(null);
          }}
        />
      )}

      {bookingServiceId && (
        <ServiceBookingDialog
          serviceId={bookingServiceId}
          serviceName={bookingServiceName}
          patientId={patientId!}
          showRegistrationSource={!hasVisitToday}
          onClose={() => setBookingServiceId(null)}
          onBooked={() => {
            queryClient.invalidateQueries({ queryKey: ["patient-visits", patientId] });
            setBookingServiceId(null);
          }}
        />
      )}
    </div>
  );
}

// ============= Search-based booking =============

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function SearchBooking({
  onSelectPhysician,
  onSelectService,
}: {
  onSelectPhysician: (id: string, name: string) => void;
  onSelectService: (id: string, name: string) => void;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 300);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: physicians = [] } = useQuery({
    queryKey: ["search-physicians", user?.hospitalId, debounced],
    queryFn: async () => {
      if (!debounced.trim()) return [];
      const { data, error } = await supabase
        .from("physicians")
        .select("id, specialization, profiles!inner(full_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .ilike("profiles.full_name", `%${debounced}%`)
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && debounced.trim().length > 0,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["search-services", user?.hospitalId, debounced],
    queryFn: async () => {
      if (!debounced.trim()) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, cost_with_vat, service_types(name_en)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true)
        .ilike("name", `%${debounced}%`)
        .limit(8);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && debounced.trim().length > 0,
  });

  return (
    <div className="relative" ref={containerRef}>
      <Input
        placeholder="Search physician or service..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && debounced.trim().length > 0 && (physicians.length > 0 || services.length > 0) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-96 overflow-y-auto rounded-md border bg-popover shadow-lg">
          {physicians.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Physicians
              </div>
              {physicians.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectPhysician(p.id, p.profiles?.full_name || "Physician");
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                >
                  <div className="font-medium">{p.profiles?.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.specialization || "—"}</div>
                </button>
              ))}
            </div>
          )}
          {services.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Services
              </div>
              {services.map((s: any) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onSelectService(s.id, s.name);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.service_types?.name_en || "—"}</div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {Number(s.cost_with_vat || 0).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function dateRangeIso(date: Date, timezone: string) {
  return localDayBoundsUTC(date, timezone);
}

async function bookOne(opts: {
  patientId: string;
  hospitalId: string;
  userId: string;
  serviceId: string;
  physicianId: string;
  cost: number;
  slotId: string | null;
  registrationSource?: string | null;
}) {
  const { data: result, error } = await supabase.rpc("registrar_add_service", {
    p_patient_id: opts.patientId,
    p_hospital_id: opts.hospitalId,
    p_created_by: opts.userId,
    p_service_id: opts.serviceId,
    p_assigned_physician_id: opts.physicianId,
    p_cost_at_time: opts.cost,
    p_registration_source: opts.registrationSource || null,
  });
  if (error) throw error;
  const visitServiceId =
    (result as any)?.visit_service_id ||
    (Array.isArray(result) ? (result as any)[0]?.visit_service_id : undefined);
  let isWaitlist = false;
  if (opts.slotId) {
    const { data: bookResult, error: bookErr } = await supabase.rpc("book_slot", {
      p_slot_id: opts.slotId,
      p_visit_service_id: visitServiceId,
    });
    if (bookErr) throw bookErr;
    isWaitlist =
      (bookResult as any)?.is_waitlist ??
      (Array.isArray(bookResult) ? (bookResult as any)[0]?.is_waitlist : false);
  }
  return { isWaitlist, visitServiceId };
}

async function assignQueueNumber(physicianId: string, hospitalId: string, visitServiceId: string): Promise<number | null> {
  const today = new Date().toISOString().split("T")[0];
  let { data: queueConfig } = await supabase
    .from("queue_configs")
    .select("id, last_number")
    .eq("physician_id", physicianId)
    .eq("hospital_id", hospitalId)
    .eq("queue_date", today)
    .maybeSingle();

  if (!queueConfig) {
    const { data: newConfig, error: insertErr } = await supabase
      .from("queue_configs")
      .insert({
        physician_id: physicianId,
        hospital_id: hospitalId,
        queue_date: today,
      })
      .select("id, last_number")
      .single();
    if (insertErr) throw insertErr;
    queueConfig = newConfig;
  }

  const { data: queueNumber, error: rpcErr } = await supabase.rpc("assign_queue_number", {
    p_queue_config_id: queueConfig!.id,
    p_visit_service_id: visitServiceId,
    p_hospital_id: hospitalId,
  });
  if (rpcErr) throw rpcErr;
  const num = (queueNumber as any)?.queue_number ||
    (Array.isArray(queueNumber) ? (queueNumber as any)[0]?.queue_number : null);
  return num;
}

function PhysicianBookingDialog({
  physicianId,
  physicianName,
  patientId,
  showRegistrationSource,
  onClose,
  onBooked,
}: {
  physicianId: string;
  physicianName: string;
  patientId: string;
  showRegistrationSource: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [pendingSlot, setPendingSlot] = useState<{ id: string; isWaitlist: boolean } | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [queueServiceIds, setQueueServiceIds] = useState<string[]>([]);
  const [registrationSource, setRegistrationSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const tz = user?.timezone || "Asia/Tashkent";
  const { start, end } = dateRangeIso(date, tz);

  // Detect schedule type for today
  const { data: scheduleType } = useQuery({
    queryKey: ["phys-schedule-type", physicianId, user?.hospitalId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const dayOfWeek = new Date().getDay();
      const { data } = await supabase
        .from("physician_schedules")
        .select("schedule_type")
        .eq("physician_id", physicianId)
        .eq("hospital_id", user!.hospitalId)
        .contains("days_of_week", [dayOfWeek])
        .lte("valid_from", today)
        .or(`valid_to.gte.${today},valid_to.is.null`)
        .limit(1)
        .maybeSingle();
      return data?.schedule_type || null;
    },
    enabled: !!user,
  });

  const isQueueMode = scheduleType === "queue";

  const { data: slots = [] } = useQuery({
    queryKey: ["phys-slots", physicianId, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, is_blocked, block_reason")
        .eq("physician_id", physicianId)
        .eq("hospital_id", user!.hospitalId)
        .gte("slot_datetime", start)
        .lte("slot_datetime", end)
        .order("slot_datetime");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !isQueueMode,
  });

  const { data: privServices = [] } = useQuery({
    queryKey: ["phys-services", physicianId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select("service_id, services(id, name, cost_with_vat)")
        .eq("physician_id", physicianId)
        .eq("hospital_id", user!.hospitalId);
      if (error) throw error;
      return (data || []).map((r: any) => r.services).filter(Boolean);
    },
    enabled: !!user && (!!pendingSlot || isQueueMode),
  });

  const handleSlotClick = (slot: any) => {
    if (slot.is_blocked || slot.booking_count >= 2) return;
    setPendingSlot({ id: slot.id, isWaitlist: slot.booking_count === 1 });
    setSelectedServiceIds([]);
  };

  const confirmBooking = async () => {
    if (!user || !pendingSlot) return;
    const services = (privServices as any[]).filter((s) => selectedServiceIds.includes(s.id));
    if (services.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    setSubmitting(true);
    try {
      let anyWaitlist = false;
      for (const s of services) {
        const { isWaitlist } = await bookOne({
          patientId,
          hospitalId: user.hospitalId,
          userId: user.id,
          serviceId: s.id,
          physicianId,
          cost: Number(s.cost_with_vat || 0),
          slotId: pendingSlot.id,
          registrationSource: registrationSource || null,
        });
        if (isWaitlist) anyWaitlist = true;
      }
      toast.success(anyWaitlist ? "Added to waitlist" : "Booked");
      onBooked();
    } catch (err: any) {
      toast.error(err.message || "Failed to book.");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmQueueBooking = async () => {
    if (!user) return;
    const services = (privServices as any[]).filter((s) => queueServiceIds.includes(s.id));
    if (services.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    setSubmitting(true);
    try {
      let lastQueueNum: number | null = null;
      for (const s of services) {
        const { visitServiceId } = await bookOne({
          patientId,
          hospitalId: user.hospitalId,
          userId: user.id,
          serviceId: s.id,
          physicianId,
          cost: Number(s.cost_with_vat || 0),
          slotId: null,
          registrationSource: registrationSource || null,
        });
        if (visitServiceId) {
          const num = await assignQueueNumber(physicianId, user.hospitalId, visitServiceId);
          if (num) lastQueueNum = num;
        }
      }
      toast.success(lastQueueNum ? `Service added. Queue number: #${lastQueueNum}` : "Service added.");
      onBooked();
    } catch (err: any) {
      toast.error(err.message || "Failed to book.");
    } finally {
      setSubmitting(false);
    }
  };

  // If only 1 service & a slot is pending — auto-book on selection
  useEffect(() => {
    if (!pendingSlot || privServices.length !== 1 || submitting) return;
    setSelectedServiceIds([(privServices[0] as any).id]);
    (async () => {
      if (!user) return;
      const s = privServices[0] as any;
      setSubmitting(true);
      try {
        const { isWaitlist } = await bookOne({
          patientId,
          hospitalId: user.hospitalId,
          userId: user.id,
          serviceId: s.id,
          physicianId,
          cost: Number(s.cost_with_vat || 0),
          slotId: pendingSlot.id,
          registrationSource: registrationSource || null,
        });
        toast.success(isWaitlist ? "Added to waitlist" : "Booked");
        onBooked();
      } catch (err: any) {
        toast.error(err.message || "Failed to book.");
      } finally {
        setSubmitting(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privServices, pendingSlot]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{physicianName}'s Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isQueueMode && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}>Prev</Button>
                <Button size="sm" variant="outline" onClick={() => setDate(new Date())}>Today</Button>
                <Button size="sm" variant="outline" onClick={() => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}>Next</Button>
              </div>
              <div className="text-sm font-medium">{format(date, "EEE, MMM d, yyyy")}</div>
            </div>
          )}

          {isQueueMode && (
            <div className="inline-flex items-center gap-2 rounded bg-teal-50 border border-teal-200 px-3 py-1.5 text-sm font-medium text-teal-800 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-200">
              Queue Mode
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

          {isQueueMode ? (
            <div className="space-y-3">
              {privServices.length === 0 ? (
                <p className="text-xs text-destructive">This physician has no services configured.</p>
              ) : (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">Select services</div>
                  {privServices.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={queueServiceIds.includes(s.id)}
                        onCheckedChange={(c) => setQueueServiceIds((cur) => c ? [...cur, s.id] : cur.filter((x) => x !== s.id))}
                      />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{Number(s.cost_with_vat || 0).toFixed(2)}</span>
                    </label>
                  ))}
                  <Button onClick={confirmQueueBooking} disabled={submitting} size="sm">
                    {submitting ? "Booking…" : "Add to Queue"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No slots for this day.</p>
              ) : (
                <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                  {slots.map((s: any) => {
                    const time = toLocal(s.slot_datetime, tz, "HH:mm");
                    const blocked = !!s.is_blocked;
                    const full = !blocked && s.booking_count >= 2;
                    const wait = !blocked && s.booking_count === 1;
                    const disabled = blocked || full;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleSlotClick(s)}
                        className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                          blocked
                            ? "bg-muted/60 text-muted-foreground/50 cursor-not-allowed border-dashed"
                            : full
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : wait
                                ? "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800"
                                : "bg-background hover:bg-muted"
                        }`}
                      >
                        <span className={`font-medium flex items-center gap-1.5 ${blocked ? "line-through" : ""}`}>
                          {blocked && <Lock className="h-3 w-3" />}
                          {time}
                        </span>
                        <span className="text-xs">
                          {blocked
                            ? s.block_reason || "Blocked"
                            : full
                              ? "Full"
                              : wait
                                ? "WL available"
                                : "Available"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {pendingSlot && privServices.length > 1 && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">Select services to book</div>
                  {privServices.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={selectedServiceIds.includes(s.id)}
                        onCheckedChange={(c) => setSelectedServiceIds((cur) => c ? [...cur, s.id] : cur.filter((x) => x !== s.id))}
                      />
                      <span className="flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{Number(s.cost_with_vat || 0).toFixed(2)}</span>
                    </label>
                  ))}
                  <Button onClick={confirmBooking} disabled={submitting} size="sm">
                    {submitting ? "Booking…" : "Book Selected"}
                  </Button>
                </div>
              )}

              {pendingSlot && privServices.length === 0 && (
                <p className="text-xs text-destructive">This physician has no services configured.</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ServiceBookingDialog({
  serviceId,
  serviceName,
  patientId,
  showRegistrationSource,
  onClose,
  onBooked,
}: {
  serviceId: string;
  serviceName: string;
  patientId: string;
  showRegistrationSource: boolean;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [registrationSource, setRegistrationSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const tz = user?.timezone || "Asia/Tashkent";
  const { start, end } = dateRangeIso(date, tz);

  const { data: serviceInfo } = useQuery({
    queryKey: ["service-info", serviceId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, cost_with_vat")
        .eq("id", serviceId)
        .single();
      return data;
    },
  });

  const { data: physicians = [] } = useQuery({
    queryKey: ["service-physicians-list", serviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select("physician_id, physicians(id, specialization, profiles!inner(full_name))")
        .eq("service_id", serviceId)
        .eq("hospital_id", user!.hospitalId);
      if (error) throw error;
      return (data || []).map((r: any) => r.physicians).filter(Boolean);
    },
    enabled: !!user,
  });

  const physicianIds = physicians.map((p: any) => p.id);

  const { data: slots = [] } = useQuery({
    queryKey: ["service-slots", serviceId, start, physicianIds.join(",")],
    queryFn: async () => {
      if (physicianIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, physician_id")
        .eq("hospital_id", user!.hospitalId)
        .in("physician_id", physicianIds)
        .gte("slot_datetime", start)
        .lte("slot_datetime", end)
        .order("slot_datetime");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && physicianIds.length > 0,
  });

  // Build time -> physician_id -> slot map
  const { times, byTime } = useMemo(() => {
    const byTime = new Map<string, Map<string, any>>();
    (slots as any[]).forEach((s) => {
      const t = toLocal(s.slot_datetime, tz, "HH:mm");
      if (!byTime.has(t)) byTime.set(t, new Map());
      byTime.get(t)!.set(s.physician_id, s);
    });
    const times = Array.from(byTime.keys()).sort();
    return { times, byTime };
  }, [slots]);

  const bookCell = async (slot: any) => {
    if (!user || submitting) return;
    if (slot.booking_count >= 2) return;
    setSubmitting(true);
    try {
      const { isWaitlist } = await bookOne({
        patientId,
        hospitalId: user.hospitalId,
        userId: user.id,
        serviceId,
        physicianId: slot.physician_id,
        cost: Number((serviceInfo as any)?.cost_with_vat || 0),
        slotId: slot.id,
        registrationSource: registrationSource || null,
      });
      toast.success(isWaitlist ? "Added to waitlist" : "Booked");
      onBooked();
    } catch (err: any) {
      toast.error(err.message || "Failed to book.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{serviceName} — Available Physicians</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}>Prev</Button>
              <Button size="sm" variant="outline" onClick={() => setDate(new Date())}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => setDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}>Next</Button>
            </div>
            <div className="text-sm font-medium">{format(date, "EEE, MMM d, yyyy")}</div>
          </div>

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

          {physicians.length === 0 ? (
            <p className="text-sm text-muted-foreground">No physicians authorized for this service.</p>
          ) : times.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots for this day.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">Time</th>
                    {physicians.map((p: any) => (
                      <th key={p.id} className="text-left p-2 font-medium">
                        <div>{p.profiles?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-normal">{p.specialization || ""}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.map((t) => (
                    <tr key={t} className="border-b">
                      <td className="p-2 font-mono text-xs">{t}</td>
                      {physicians.map((p: any) => {
                        const slot = byTime.get(t)?.get(p.id);
                        if (!slot) {
                          return <td key={p.id} className="p-1"><div className="rounded border border-dashed border-muted h-8" /></td>;
                        }
                        const full = slot.booking_count >= 2;
                        const wait = slot.booking_count === 1;
                        return (
                          <td key={p.id} className="p-1">
                            <button
                              type="button"
                              disabled={full || submitting}
                              onClick={() => bookCell(slot)}
                              className={`w-full rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
                                full
                                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                                  : wait
                                    ? "bg-blue-50 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/30 dark:border-blue-800"
                                    : "bg-background hover:bg-muted"
                              }`}
                            >
                              {full ? "Full" : wait ? "Waitlist" : "Available"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
