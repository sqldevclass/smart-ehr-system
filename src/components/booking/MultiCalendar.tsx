import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { localDayBoundsUTC, toLocal } from "@/lib/timezone";
import { QueuePanel } from "./QueuePanel";
import type { ServiceResult, SlotRow } from "./types";

interface PhysCol {
  id: string;
  fullName: string;
  specialization: string | null;
  scheduleType: "slots" | "queue" | null;
}

interface MultiCalendarProps {
  service: ServiceResult;
  hospitalId: string;
  timezone: string;
  mode: "registrar" | "inpatient";
  onBooked: () => void;
  patientId: string;
  hospitalizationId?: string;
  officeRoomId?: string;
}

function deriveScheduleType(rows: any[] | null | undefined, date: Date): "slots" | "queue" | null {
  if (!rows || rows.length === 0) return null;
  const dStr = format(date, "yyyy-MM-dd");
  const dow = date.getDay();
  const active = rows.find((r) => {
    const fromOk = !r.valid_from || r.valid_from <= dStr;
    const toOk = !r.valid_to || r.valid_to >= dStr;
    const dayOk = !r.days_of_week || r.days_of_week.length === 0 || r.days_of_week.includes(dow);
    return fromOk && toOk && dayOk;
  });
  return (active?.schedule_type as "slots" | "queue" | null) ?? (rows[0].schedule_type ?? null);
}

export function MultiCalendar(props: MultiCalendarProps) {
  const { service, hospitalId, timezone, mode, patientId, hospitalizationId, officeRoomId, onBooked } = props;
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [selected, setSelected] = useState<{ slot: SlotRow; physician: PhysCol } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");
  const bounds = useMemo(() => localDayBoundsUTC(date, timezone), [date, timezone]);

  const { data: physicians = [] } = useQuery({
    queryKey: ["multi-cal-physicians", service.id, hospitalId, dateStr, officeRoomId || "none"],
    queryFn: async () => {
      if (officeRoomId) {
        const { data, error } = await supabase
          .from("office_room_physicians")
          .select(
            "physician_id, physicians!inner(id, specialization, is_active, profiles!inner(full_name), physician_schedules(schedule_type, valid_from, valid_to, days_of_week))"
          )
          .eq("room_id", officeRoomId)
          .eq("hospital_id", hospitalId);
        if (error) throw error;
        return (data || [])
          .filter((r: any) => r.physicians?.is_active !== false)
          .map((r: any): PhysCol => ({
            id: r.physician_id,
            fullName: r.physicians?.profiles?.full_name || "—",
            specialization: r.physicians?.specialization ?? null,
            scheduleType: deriveScheduleType(r.physicians?.physician_schedules, date),
          }));
      }
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select(
          "physician_id, physicians!inner(id, specialization, is_active, profiles!inner(full_name), physician_schedules(schedule_type, valid_from, valid_to, days_of_week))"
        )
        .eq("service_id", service.id)
        .eq("hospital_id", hospitalId);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.physicians?.is_active !== false)
        .map((r: any): PhysCol => ({
          id: r.physician_id,
          fullName: r.physicians?.profiles?.full_name || "—",
          specialization: r.physicians?.specialization ?? null,
          scheduleType: deriveScheduleType(r.physicians?.physician_schedules, date),
        }));
    },
  });

  const physicianIds = physicians.map((p) => p.id);

  const { data: slots = [], refetch: refetchSlots } = useQuery({
    queryKey: ["multi-cal-slots", physicianIds.sort().join(","), hospitalId, dateStr],
    queryFn: async () => {
      if (physicianIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, is_blocked, block_reason, physician_id")
        .eq("hospital_id", hospitalId)
        .in("physician_id", physicianIds)
        .gte("slot_datetime", bounds.start)
        .lte("slot_datetime", bounds.end)
        .order("slot_datetime");
      if (error) throw error;
      return (data || []) as (SlotRow & { physician_id: string })[];
    },
    enabled: physicianIds.length > 0,
  });

  const slotsByPhysician = useMemo(() => {
    const map = new Map<string, (SlotRow & { physician_id: string })[]>();
    for (const s of slots) {
      const arr = map.get(s.physician_id) || [];
      arr.push(s);
      map.set(s.physician_id, arr);
    }
    return map;
  }, [slots]);

  const handleConfirm = async () => {
    if (!selected || !user) return;
    setSubmitting(true);
    try {
      let visitServiceId: string;
      if (mode === "registrar") {
        const { data, error } = await supabase.rpc("registrar_add_service", {
          p_patient_id: patientId,
          p_hospital_id: hospitalId,
          p_created_by: user.id,
          p_service_id: service.id,
          p_assigned_physician_id: selected.physician.id,
          p_cost_at_time: service.costWithVat,
          p_registration_source: null,
          ...(officeRoomId ? { p_assigned_room_id: officeRoomId } : {}),
        } as any);
        if (error) throw error;
        visitServiceId =
          (data as any)?.visit_service_id ||
          (Array.isArray(data) ? (data as any)[0]?.visit_service_id : undefined);
      } else {
        if (!hospitalizationId) throw new Error("hospitalizationId required");
        const { data, error } = await supabase.rpc("inpatient_add_service", {
          p_hospitalization_id: hospitalizationId,
          p_patient_id: patientId,
          p_hospital_id: hospitalId,
          p_ordered_by: user.id,
          p_service_id: service.id,
          p_assigned_physician_id: selected.physician.id,
          p_cost_at_time: service.costWithVat,
        });
        if (error) throw error;
        visitServiceId =
          (data as any)?.visit_service_id ||
          (Array.isArray(data) ? (data as any)[0]?.visit_service_id : undefined);
      }
      if (!visitServiceId) throw new Error("No visit_service_id returned");

      const { data: bookData, error: bookErr } = await supabase.rpc("book_slot", {
        p_slot_id: selected.slot.id,
        p_visit_service_id: visitServiceId,
      });
      if (bookErr) throw bookErr;
      const isWaitlist =
        (bookData as any)?.is_waitlist ??
        (Array.isArray(bookData) ? (bookData as any)[0]?.is_waitlist : undefined);
      toast.success(isWaitlist ? "Added to waitlist" : "Booked");
      setSelected(null);
      await refetchSlots();
      onBooked();
    } catch (err: any) {
      toast.error(err.message || "Failed to book");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setDate((d) => addDays(d, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[160px] text-center text-sm font-medium">
              {format(date, "EEE, MMM d, yyyy")}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setDate((d) => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDate(new Date())}>
            Today
          </Button>
        </div>

        {physicians.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No physicians authorized for this service.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-full">
              {physicians.map((p) => {
                const physSlots = slotsByPhysician.get(p.id) || [];
                return (
                  <div
                    key={p.id}
                    className="flex w-56 shrink-0 flex-col rounded-md border bg-card"
                  >
                    <div className="border-b p-2">
                      <div className="truncate text-sm font-semibold">{p.fullName}</div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="truncate text-xs text-muted-foreground">
                          {p.specialization || "—"}
                        </div>
                        {p.scheduleType && (
                          <Badge
                            variant={p.scheduleType === "slots" ? "default" : "secondary"}
                            className="capitalize text-[10px]"
                          >
                            {p.scheduleType}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
                      {p.scheduleType === "queue" ? (
                        <QueuePanel
                          physicianId={p.id}
                          hospitalId={hospitalId}
                          selectedDate={date}
                          timezone={timezone}
                        />
                      ) : physSlots.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No slots
                        </div>
                      ) : (
                        physSlots.map((s) => {
                          const isSelected = selected?.slot.id === s.id;
                          const full = s.booking_count >= 2;
                          const waitlist = s.booking_count === 1;
                          const blocked = s.is_blocked;
                          const disabled = full || blocked;
                          const button = (
                            <button
                              key={s.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => setSelected({ slot: s, physician: p })}
                              className={cn(
                                "flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs transition",
                                isSelected && "ring-2 ring-primary border-primary",
                                blocked && "bg-muted text-muted-foreground cursor-not-allowed",
                                full && !blocked && "bg-muted text-muted-foreground cursor-not-allowed",
                                waitlist && !disabled && "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900",
                                !waitlist && !disabled && "bg-card hover:bg-muted"
                              )}
                            >
                              <span>{toLocal(s.slot_datetime, timezone, "HH:mm")}</span>
                              {blocked ? (
                                <Lock className="h-3 w-3" />
                              ) : (
                                <span className="text-[10px] text-muted-foreground">
                                  {full ? "full" : waitlist ? "waitlist" : "open"}
                                </span>
                              )}
                            </button>
                          );
                          return blocked && s.block_reason ? (
                            <Tooltip key={s.id}>
                              <TooltipTrigger asChild>{button}</TooltipTrigger>
                              <TooltipContent>{s.block_reason}</TooltipContent>
                            </Tooltip>
                          ) : (
                            button
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selected && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Selected:</span>{" "}
              <span className="font-medium">
                {selected.physician.fullName} · {toLocal(selected.slot.slot_datetime, timezone, "MMM d, HH:mm")}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Clear
              </Button>
              <Button size="sm" disabled={submitting} onClick={handleConfirm}>
                {submitting ? "Booking…" : "Confirm Booking"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
