import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookingSearch } from "./BookingSearch";
import { PhysicianCalendar } from "./PhysicianCalendar";
import { ServicePicker } from "./ServicePicker";
import { MultiCalendar } from "./MultiCalendar";
import type {
  BookingModalProps, BookingResult, PhysicianResult, ServiceResult, SlotRow,
} from "./types";

const REGISTRATION_SOURCES = [
  "Facebook", "Instagram", "Google Search", "Friend Recommendation", "Doctor Referral", "Other",
];

export function BookingModal(props: BookingModalProps) {
  const {
    open, onOpenChange, patientId, hospitalId, mode, hospitalizationId,
    preselectedServiceId, initialPhysician, initialService, onBooked,
  } = props;
  const { user } = useAuth();
  const tz = user?.timezone || "Asia/Tashkent";

  const [physician, setPhysician] = useState<PhysicianResult | null>(null);
  const [pickedServices, setPickedServices] = useState<ServiceResult[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showMultiCalendar, setShowMultiCalendar] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotRow | null>(null);
  const [queueDate, setQueueDate] = useState<Date | null>(null);
  const [registrationSource, setRegistrationSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Patient name
  const { data: patient } = useQuery({
    queryKey: ["booking-modal-patient", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patients")
        .select("first_name, last_name, middle_name")
        .eq("id", patientId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!patientId,
  });

  const patientName = patient
    ? [patient.last_name, patient.first_name, patient.middle_name].filter(Boolean).join(" ")
    : "";

  // Has visit today (for registration source visibility)
  const { data: hasVisitToday = false } = useQuery({
    queryKey: ["booking-modal-has-visit-today", patientId, hospitalId],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data } = await supabase
        .from("visits")
        .select("id, visit_date")
        .eq("patient_id", patientId)
        .eq("hospital_id", hospitalId)
        .gte("visit_date", today)
        .lte("visit_date", `${today}T23:59:59.999Z`);
      return (data || []).length > 0;
    },
    enabled: open && mode === "registrar" && !!patientId,
  });

  const showRegSource = mode === "registrar" && !hasVisitToday;

  // Reset on open/close; seed from initial props when opening
  useEffect(() => {
    if (!open) {
      setPhysician(null);
      setPickedServices(null);
      setShowPicker(false);
      setShowMultiCalendar(false);
      setSelectedSlot(null);
      setQueueDate(null);
      setRegistrationSource("");
      setSubmitting(false);
    } else {
      if (initialPhysician) {
        setPhysician(initialPhysician);
        setShowPicker(true);
      } else if (initialService) {
        setPickedServices([initialService]);
        setShowMultiCalendar(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePhysicianSelect = (p: PhysicianResult) => {
    setPhysician(p);
    setSelectedSlot(null);
    setQueueDate(null);
    setPickedServices(null);
    setShowMultiCalendar(false);
    setShowPicker(true);
  };

  const handleServiceFromSearch = (service: ServiceResult) => {
    setPickedServices([service]);
    setPhysician(null);
    setShowMultiCalendar(true);
  };

  const isQueueMode = physician?.scheduleType === "queue";
  const canConfirm = useMemo(() => {
    if (!physician || !pickedServices || pickedServices.length === 0) return false;
    if (isQueueMode) return !!queueDate;
    return !!selectedSlot;
  }, [physician, pickedServices, isQueueMode, selectedSlot, queueDate]);

  const ensureQueueConfig = async (physicianId: string): Promise<string> => {
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("queue_configs")
      .select("id")
      .eq("physician_id", physicianId)
      .eq("hospital_id", hospitalId)
      .eq("queue_date", today)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created, error } = await supabase
      .from("queue_configs")
      .insert({ physician_id: physicianId, hospital_id: hospitalId, queue_date: today })
      .select("id")
      .single();
    if (error) throw error;
    return created.id;
  };

  const createVisitService = async (svc: ServiceResult): Promise<string> => {
    if (mode === "registrar") {
      const { data, error } = await supabase.rpc("registrar_add_service", {
        p_patient_id: patientId,
        p_hospital_id: hospitalId,
        p_created_by: user!.id,
        p_service_id: svc.id,
        p_assigned_physician_id: physician!.id,
        p_cost_at_time: svc.costWithVat,
        p_registration_source: registrationSource || null,
      });
      if (error) throw error;
      const id = (data as any)?.visit_service_id
        || (Array.isArray(data) ? (data as any)[0]?.visit_service_id : undefined);
      if (!id) throw new Error("Booking returned no visit_service_id");
      return id;
    }
    if (!hospitalizationId) throw new Error("hospitalizationId is required for inpatient mode");
    const { data, error } = await supabase.rpc("inpatient_add_service", {
      p_hospitalization_id: hospitalizationId,
      p_patient_id: patientId,
      p_hospital_id: hospitalId,
      p_ordered_by: user!.id,
      p_service_id: svc.id,
      p_assigned_physician_id: physician!.id,
      p_cost_at_time: svc.costWithVat,
    });
    if (error) throw error;
    const id = (data as any)?.visit_service_id
      || (Array.isArray(data) ? (data as any)[0]?.visit_service_id : undefined);
    if (!id) throw new Error("Booking returned no visit_service_id");
    return id;
  };

  const handleConfirm = async () => {
    if (!user || !physician || !pickedServices || pickedServices.length === 0) return;
    setSubmitting(true);
    try {
      let lastResult: BookingResult | null = null;
      let queueConfigId: string | null = null;
      if (isQueueMode) queueConfigId = await ensureQueueConfig(physician.id);

      for (const svc of pickedServices) {
        const visitServiceId = await createVisitService(svc);

        let isWaitlist: boolean | undefined;
        let scheduledAt: string | undefined;
        let queueNumber: number | undefined;

        if (selectedSlot && !isQueueMode) {
          const { data: bookData, error: bookErr } = await supabase.rpc("book_slot", {
            p_slot_id: selectedSlot.id,
            p_visit_service_id: visitServiceId,
          });
          if (bookErr) throw bookErr;
          isWaitlist = (bookData as any)?.is_waitlist
            ?? (Array.isArray(bookData) ? (bookData as any)[0]?.is_waitlist : undefined);
          scheduledAt = selectedSlot.slot_datetime;
        } else if (isQueueMode && queueConfigId) {
          const { data: qData, error: qErr } = await supabase.rpc("assign_queue_number", {
            p_queue_config_id: queueConfigId,
            p_visit_service_id: visitServiceId,
            p_hospital_id: hospitalId,
          });
          if (qErr) throw qErr;
          queueNumber = (qData as any)?.queue_number
            ?? (Array.isArray(qData) ? (qData as any)[0]?.queue_number : undefined);
        }

        lastResult = {
          visitServiceId,
          slotId: selectedSlot?.id,
          scheduledAt,
          queueNumber,
          isWaitlist,
          serviceId: svc.id,
          physicianId: physician.id,
        };
      }

      if (lastResult?.queueNumber) {
        toast.success(`Booked. Queue #${lastResult.queueNumber}`);
      } else if (lastResult?.isWaitlist) {
        toast.success("Added to waitlist");
      } else {
        toast.success("Booked");
      }
      onBooked(lastResult!);
    } catch (err: any) {
      toast.error(err.message || "Failed to book.");
    } finally {
      setSubmitting(false);
    }
  };

  const goBackToSearch = () => {
    setPhysician(null);
    setPickedServices(null);
    setShowPicker(false);
    setSelectedSlot(null);
    setQueueDate(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {physician && (
              <Button size="icon" variant="ghost" onClick={goBackToSearch} className="h-7 w-7">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            Book Service{patientName ? ` — ${patientName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!physician && pickedServices && pickedServices.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-card p-3 text-sm">
              <div className="text-xs text-muted-foreground">Selected service</div>
              <div className="mt-1 font-medium">{pickedServices[0].name}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Multi-physician calendar for this service — coming soon.
            </div>
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        ) : !physician ? (
          <div className="space-y-4">
            <BookingSearch
              hospitalId={hospitalId}
              onPhysicianSelect={handlePhysicianSelect}
              onServiceSelect={handleServiceFromSearch}
            />
            <p className="text-xs text-muted-foreground">
              Search for a physician to view their schedule and book.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {showPicker && !pickedServices && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <ServicePicker
                  physicianId={physician.id}
                  hospitalId={hospitalId}
                  preselectedServiceId={preselectedServiceId}
                  onConfirm={(svcs) => { setPickedServices(svcs); setShowPicker(false); }}
                  onCancel={goBackToSearch}
                />
              </div>
            )}

            {pickedServices && (
              <div className="rounded-md border bg-card p-3 text-sm">
                <div className="text-xs text-muted-foreground">Selected services</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {pickedServices.map((s) => (
                    <span key={s.id} className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <PhysicianCalendar
              physician={physician}
              hospitalId={hospitalId}
              timezone={tz}
              onSlotSelect={(slot) => setSelectedSlot(slot)}
              onQueueSelect={(d) => setQueueDate(d)}
              selectedSlotId={selectedSlot?.id ?? null}
              mode={mode}
            />

            {showRegSource && (
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

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!canConfirm || submitting} onClick={handleConfirm}>
                {submitting ? "Booking…" : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
