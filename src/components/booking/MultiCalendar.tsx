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

import type { BookingResult, ServiceResult, SlotRow } from "./types";
interface PhysCol {
  kind: "physician";
  id: string;
  fullName: string;
  specialization: string | null;
  scheduleType: "slots" | "queue" | null;
}

interface RoomCol {
  kind: "room";
  id: string;
  name: string;
  roomType: string | null;
  scheduleType: "slots" | "queue" | null;
}

type Col = PhysCol | RoomCol;

interface MultiCalendarProps {
  service: ServiceResult;
  hospitalId: string;
  timezone: string;
  mode: "registrar" | "inpatient";
  onBooked: (result: BookingResult) => void;
  patientId: string;
  hospitalizationId?: string;
  officeRoomId?: string;
  existingVisitServiceId?: string;
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
  const { service, hospitalId, timezone, mode, patientId, hospitalizationId, officeRoomId, existingVisitServiceId, onBooked } = props;
  const { user } = useAuth();
  const tz = timezone || user?.timezone || "Asia/Tashkent";
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const todayInTz = useMemo(() => {
    const [y, m, d] = todayStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [date, setDate] = useState<Date>(todayInTz);
  const [selected, setSelected] = useState<{ slot: SlotRow; col: Col } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");
  const isPastDate = dateStr < todayStr;
  const bounds = useMemo(() => localDayBoundsUTC(date, tz), [date, tz]);

  const { data: physicians = [] } = useQuery({
    queryKey: ["multi-cal-physicians", service.id, hospitalId, dateStr, officeRoomId || "none"],
    queryFn: async (): Promise<PhysCol[]> => {
      if (officeRoomId) {
        // Step 1: get physician IDs from office_room_physicians
        const { data: orpRows, error: orpErr } = await supabase
          .from("office_room_physicians")
          .select("physician_id")
          .eq("room_id", officeRoomId)
          .eq("hospital_id", hospitalId);
        if (orpErr) throw orpErr;
        const physicianIds = (orpRows || []).map((r: any) => r.physician_id);
        if (physicianIds.length === 0) return [];

        // Step 2: fetch physician details + schedules directly
        const { data: phRows, error: phErr } = await supabase
          .from("physicians")
          .select("id, is_active, profiles!inner(full_name), specializations!specialization_id(name), physician_schedules(schedule_type, valid_from, valid_to, days_of_week)")
          .in("id", physicianIds)
          .eq("is_active", true);
        if (phErr) throw phErr;
        return (phRows || []).map((p: any): PhysCol => ({
          kind: "physician",
          id: p.id,
          fullName: p.profiles?.full_name || "—",
          specialization: p.specializations?.name ?? null,
          scheduleType: deriveScheduleType(p.physician_schedules, date),
        }));
      }

      // Non-office-room path: unchanged
      const { data, error } = await supabase
        .from("physician_service_privileges")
        .select(
          "staff_role_id, staff_roles!inner(id, is_active, persons!inner(first_name, last_name), specializations!specialization_id(name), physician_schedules!staff_role_id(schedule_type, valid_from, valid_to, days_of_week))"
        )
        .eq("service_id", service.id)
        .eq("hospital_id", hospitalId);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.staff_roles?.is_active !== false)
        .map((r: any): PhysCol => ({
          kind: "physician",
          id: r.staff_role_id,
          fullName: `${r.staff_roles?.persons?.last_name} ${r.staff_roles?.persons?.first_name}` || "—",
          specialization: r.staff_roles?.specializations?.name ?? null,
          scheduleType: deriveScheduleType(r.staff_roles?.physician_schedules, date),
        }));
    },
  });

  // Office rooms that can perform this service (only when not already filtered)
  const { data: rooms = [] } = useQuery({
    queryKey: ["multi-cal-rooms", service.id, hospitalId, officeRoomId || "none"],
    queryFn: async (): Promise<RoomCol[]> => {
      if (officeRoomId) return [];
      const { data, error } = await supabase
        .from("office_room_services")
        .select("room_id, rooms!inner(id, name, room_types(name))")
        .eq("service_id", service.id)
        .eq("hospital_id", hospitalId);
      if (error) throw error;
      const roomIds = (data || []).map((r: any) => r.room_id);
      let roomScheduleTypes: Record<string, "slots" | "queue"> = {};
      if (roomIds.length > 0) {
        const { data: schedRows } = await supabase
          .from("physician_schedules")
          .select("room_id, schedule_type")
          .in("room_id", roomIds)
          .is("physician_id", null);
        (schedRows || []).forEach((s: any) => {
          if (s.room_id) roomScheduleTypes[s.room_id] = s.schedule_type;
        });
      }
      return (data || []).map((r: any): RoomCol => ({
        kind: "room",
        id: r.room_id,
        name: r.rooms?.name || "—",
        roomType: r.rooms?.room_types?.name ?? null,
        scheduleType: roomScheduleTypes[r.room_id] ?? null,
      }));
    },
  });

  const physicianIds = physicians.map((p) => p.id);
  const roomIds = rooms.map((r) => r.id);

  const { data: slots = [], refetch: refetchSlots } = useQuery({
    queryKey: ["multi-cal-slots", physicianIds.sort().join(","), hospitalId, dateStr],
    queryFn: async () => {
      if (physicianIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, is_blocked, block_reason, physician_id")
        .eq("hospital_id", hospitalId)
        .in("staff_role_id", physicianIds)
        .gte("slot_datetime", bounds.start)
        .lte("slot_datetime", bounds.end)
        .order("slot_datetime");
      if (error) throw error;
      return (data || []) as (SlotRow & { physician_id: string })[];
    },
    enabled: physicianIds.length > 0,
  });

  const { data: roomSlots = [], refetch: refetchRoomSlots } = useQuery({
    queryKey: ["multi-cal-room-slots", roomIds.sort().join(","), hospitalId, dateStr],
    queryFn: async () => {
      if (roomIds.length === 0) return [];
      const { data, error } = await supabase
        .from("schedule_slots")
        .select("id, slot_datetime, booking_count, is_blocked, block_reason, room_id")
        .eq("hospital_id", hospitalId)
        .in("room_id", roomIds)
        .gte("slot_datetime", bounds.start)
        .lte("slot_datetime", bounds.end)
        .order("slot_datetime");
      if (error) throw error;
      return (data || []) as (SlotRow & { room_id: string })[];
    },
    enabled: roomIds.length > 0,
  });

  const { data: queueConfigsData } = useQuery({
    queryKey: ["multi-cal-queue-preview", physicianIds.join(","), dateStr, hospitalId],
    queryFn: async () => {
      const queuePhysIds = physicians
        .filter((p) => p.scheduleType === "queue")
        .map((p) => p.id);
      if (queuePhysIds.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("queue_configs")
        .select("physician_id, queue_numbers(queue_number)")
        .eq("hospital_id", hospitalId)
        .eq("queue_date", dateStr)
        .in("staff_role_id", queuePhysIds);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        const numbers = (r.queue_numbers || []).map((q: any) => q.queue_number);
        map[r.physician_id] = numbers.length > 0 ? Math.max(...numbers) : 0;
      });
      return map;
    },
    enabled: physicians.some((p) => p.scheduleType === "queue"),
  });
  const queueConfigs = queueConfigsData ?? {};

  const { data: roomQueueConfigsData } = useQuery({
    queryKey: ["multi-cal-room-queue-preview", roomIds.sort().join(","), dateStr, hospitalId],
    queryFn: async () => {
      const queueRoomIds = rooms
        .filter((r) => r.scheduleType === "queue")
        .map((r) => r.id);
      if (queueRoomIds.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("queue_configs")
        .select("room_id, queue_numbers(queue_number)")
        .eq("hospital_id", hospitalId)
        .eq("queue_date", dateStr)
        .in("room_id", queueRoomIds)
        .is("physician_id", null);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        if (!r.room_id) return;
        const numbers = (r.queue_numbers || []).map((q: any) => q.queue_number);
        map[r.room_id] = numbers.length > 0 ? Math.max(...numbers) : 0;
      });
      return map;
    },
    enabled: rooms.some((r) => r.scheduleType === "queue"),
  });
  const roomQueueConfigs = roomQueueConfigsData ?? {};

  const slotsByPhysician = useMemo(() => {
    const map = new Map<string, (SlotRow & { physician_id: string })[]>();
    for (const s of slots) {
      const arr = map.get(s.physician_id) || [];
      arr.push(s);
      map.set(s.physician_id, arr);
    }
    return map;
  }, [slots]);

  const slotsByRoom = useMemo(() => {
    const map = new Map<string, (SlotRow & { room_id: string })[]>();
    for (const s of roomSlots) {
      const arr = map.get(s.room_id) || [];
      arr.push(s);
      map.set(s.room_id, arr);
    }
    return map;
  }, [roomSlots]);

  const columns: Col[] = useMemo(() => [...physicians, ...rooms], [physicians, rooms]);

  const handleConfirm = async () => {
    if (!selected || !user) return;
    setSubmitting(true);
    try {
      const isRoom = selected.col.kind === "room";
      let visitServiceId: string;
      if (existingVisitServiceId) {
        const { error: updateErr } = await supabase
          .from("visit_services")
          .update({ assigned_staff_role_id: isRoom ? null : (selected.col as PhysCol).id })
          .eq("id", existingVisitServiceId);
        if (updateErr) throw updateErr;
        visitServiceId = existingVisitServiceId;
      } else if (mode === "registrar") {
        const { data, error } = await supabase.rpc("registrar_add_service", {
          p_patient_id: patientId,
          p_hospital_id: hospitalId,
          p_created_by: user.id,
          p_service_id: service.id,
          p_assigned_staff_role_id: isRoom ? null : (selected.col as PhysCol).id,
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
          p_assigned_physician_id: isRoom ? null : (selected.col as PhysCol).id,
          p_cost_at_time: service.costWithVat,
        });
        if (error) throw error;
        visitServiceId =
          (data as any)?.visit_service_id ||
          (Array.isArray(data) ? (data as any)[0]?.visit_service_id : undefined);
      }
      if (!visitServiceId) throw new Error("No visit_service_id returned");

      // For office room booking, attach room to the visit_service
      if (isRoom) {
        const { error: updErr } = await supabase
          .from("visit_services")
          .update({ assigned_room_id: (selected.col as RoomCol).id })
          .eq("id", visitServiceId);
        if (updErr) throw updErr;
      }

      const isRoomQueueBooking = selected.slot.id.startsWith("queue-room-");
      const isQueueBooking = selected.slot.id.startsWith("queue-") && !isRoomQueueBooking;
      let queueNumber: number | undefined;
      let isWaitlist: boolean | undefined;
      if (isQueueBooking) {
        const physCol = selected.col as PhysCol;
        const { data: qData, error: qErr } = await supabase.rpc("assign_queue_number", {
          p_visit_service_id: visitServiceId,
          p_hospital_id: hospitalId,
          p_physician_id: physCol.id,
        });
        if (qErr) throw qErr;
        const row = Array.isArray(qData) ? qData[0] : qData;
        queueNumber = (row as any)?.queue_number;
        toast.success(`Booked. Queue #${queueNumber}`);
      } else if (isRoomQueueBooking) {
        const roomCol = selected.col as RoomCol;
        const { data: qData, error: qErr } = await supabase.rpc("assign_queue_number", {
          p_visit_service_id: visitServiceId,
          p_hospital_id: hospitalId,
          p_room_id: roomCol.id,
        });
        if (qErr) throw qErr;
        const row = Array.isArray(qData) ? qData[0] : qData;
        queueNumber = (row as any)?.queue_number;
        toast.success(`Booked. Queue #${queueNumber}`);
      } else {
        const { data: bookData, error: bookErr } = await supabase.rpc("book_slot", {
          p_slot_id: selected.slot.id,
          p_visit_service_id: visitServiceId,
        });
        if (bookErr) throw bookErr;
        isWaitlist =
          (bookData as any)?.is_waitlist ??
          (Array.isArray(bookData) ? (bookData as any)[0]?.is_waitlist : undefined);
        toast.success(isWaitlist ? "Added to waitlist" : "Booked");
      }




      onBooked({
        visitServiceId: existingVisitServiceId || visitServiceId,
        serviceId: service.id,
        physicianId: selected.col.kind === "physician" ? (selected.col as PhysCol).id : undefined,
        officeRoomId: selected.col.kind === "room" ? (selected.col as RoomCol).id : undefined,
        isWaitlist: isWaitlist ?? false,
        scheduledAt: selected.slot.id.startsWith("queue-") ? undefined : selected.slot.slot_datetime,
        queueNumber,
      });
      setSelected(null);
      await Promise.all([refetchSlots(), refetchRoomSlots()]);
    } catch (err: any) {
      toast.error(err.message || "Failed to book");
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlotButton = (s: SlotRow, col: Col) => {
    const isSelected = selected?.slot.id === s.id;
    const isPastDate = dateStr < todayStr;
    const full = s.booking_count >= 2;
    const waitlist = s.booking_count === 1;
    const blocked = s.is_blocked;
    const disabled = full || blocked || isPastDate;
    const button = (
      <button
        key={s.id}
        type="button"
        disabled={disabled}
        onClick={() => setSelected({ slot: s, col })}
        className={cn(
          "flex w-full items-center justify-between rounded border px-2 py-1.5 text-xs transition",
          isSelected && "ring-2 ring-primary border-primary",
          blocked && "bg-muted text-muted-foreground cursor-not-allowed",
          full && !blocked && "bg-muted text-muted-foreground cursor-not-allowed",
          isPastDate && "opacity-50 cursor-not-allowed",
          waitlist && !disabled && "bg-amber-50 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-900",
          !waitlist && !disabled && "bg-card hover:bg-muted"
        )}
      >
        <span>{toLocal(s.slot_datetime, tz, "HH:mm")}</span>
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
  };

  const selectedLabel = selected
    ? selected.col.kind === "physician"
      ? (selected.col as PhysCol).fullName
      : `${(selected.col as RoomCol).name} (Office Room)`
    : "";

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-md border bg-card p-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              disabled={dateStr <= todayStr}
              onClick={() => setDate((d) => addDays(d, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[160px] text-center text-sm font-medium">
              {format(date, "EEE, MMM d, yyyy")}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setDate((d) => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDate(todayInTz)}>
            Today
          </Button>
        </div>

        {columns.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            No physicians or office rooms available for this service.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-3 min-w-full">
              {columns.map((col) => {
                if (col.kind === "physician") {
                  const physSlots = slotsByPhysician.get(col.id) || [];
                  return (
                    <div key={`p-${col.id}`} className="flex w-56 shrink-0 flex-col rounded-md border bg-card">
                      <div className="border-b p-2">
                        <div className="truncate text-sm font-semibold">{col.fullName}</div>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <div className="truncate text-xs text-muted-foreground">
                            {col.specialization || "—"}
                          </div>
                          {col.scheduleType && (
                            <Badge
                              variant={col.scheduleType === "slots" ? "default" : "secondary"}
                              className="capitalize text-[10px]"
                            >
                              {col.scheduleType}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
                        {col.scheduleType === "queue" ? (
                          <div
                            className={cn(
                              "rounded-lg border-2 p-4 text-center transition",
                              dateStr < todayStr
                                ? "opacity-50 cursor-not-allowed bg-muted/30"
                                : "cursor-pointer hover:border-primary/50 hover:bg-muted/30",
                              selected?.col.id === col.id
                                ? "border-primary bg-primary/5"
                                : "border-dashed border-muted-foreground/30"
                            )}
                            onClick={() => {
                              if (dateStr < todayStr) return;
                              const queueSelection: SlotRow = {
                                id: `queue-${col.id}`,
                                slot_datetime: new Date().toISOString(),
                                booking_count: 0,
                                is_blocked: false,
                                block_reason: null,
                              };
                              setSelected({ slot: queueSelection, col });
                            }}
                          >
                            <div className="text-2xl font-bold text-foreground">
                              Queue #{(queueConfigs?.[col.id] ?? 0) + 1}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {dateStr < todayStr ? "Past date" : "Click to select queue"}
                            </div>
                            {selected?.col.id === col.id && (
                              <div className="mt-2 text-xs font-medium text-primary">✓ Selected</div>
                            )}
                          </div>
                        ) : physSlots.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground">
                            No slots
                          </div>
                        ) : (
                          physSlots.map((s) => renderSlotButton(s, col))
                        )}
                      </div>
                    </div>
                  );
                }
                const rSlots = slotsByRoom.get(col.id) || [];
                return (
                  <div key={`r-${col.id}`} className="flex w-56 shrink-0 flex-col rounded-md border bg-card">
                    <div className="border-b p-2">
                      <div className="truncate text-sm font-semibold">{col.name}</div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="truncate text-xs text-muted-foreground">
                          {col.roomType || "Room"}
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Office Room
                        </Badge>
                      </div>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto p-2 space-y-1">
                      {col.scheduleType === "queue" ? (
                        <div
                          className={cn(
                            "rounded-lg border-2 p-4 text-center transition",
                            dateStr < todayStr
                              ? "opacity-50 cursor-not-allowed bg-muted/30"
                              : "cursor-pointer hover:border-primary/50 hover:bg-muted/30",
                            selected?.col.id === col.id
                              ? "border-primary bg-primary/5"
                              : "border-dashed border-muted-foreground/30"
                          )}
                          onClick={() => {
                            if (dateStr < todayStr) return;
                            const queueSelection: SlotRow = {
                              id: `queue-room-${col.id}`,
                              slot_datetime: new Date().toISOString(),
                              booking_count: 0,
                              is_blocked: false,
                              block_reason: null,
                            };
                            setSelected({ slot: queueSelection, col });
                          }}
                        >
                          <div className="text-2xl font-bold text-foreground">
                            Queue #{(roomQueueConfigs?.[col.id] ?? 0) + 1}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {dateStr < todayStr ? "Past date" : "Click to select queue"}
                          </div>
                          {selected?.col.id === col.id && (
                            <div className="mt-2 text-xs font-medium text-primary">✓ Selected</div>
                          )}
                        </div>
                      ) : rSlots.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No slots
                        </div>
                      ) : (
                        rSlots.map((s) => renderSlotButton(s, col))
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
                {selectedLabel} · {toLocal(selected.slot.slot_datetime, tz, "MMM d, HH:mm")}
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
