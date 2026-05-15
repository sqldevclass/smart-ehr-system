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

import type { ServiceResult, SlotRow } from "./types";

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
}

type Col = PhysCol | RoomCol;

interface MultiCalendarProps {
  service: ServiceResult;
  hospitalId: string;
  timezone: string;
  mode: "registrar" | "inpatient";
  onBooked: () => void;
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
  const { service, hospitalId, timezone, mode, patientId, hospitalizationId, officeRoomId, onBooked } = props;
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [selected, setSelected] = useState<{ slot: SlotRow; col: Col } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");
  const bounds = useMemo(() => localDayBoundsUTC(date, timezone), [date, timezone]);

  const { data: physicians = [] } = useQuery({
    queryKey: ["multi-cal-physicians", service.id, hospitalId, dateStr, officeRoomId || "none"],
    queryFn: async (): Promise<PhysCol[]> => {
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
            kind: "physician",
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
          kind: "physician",
          id: r.physician_id,
          fullName: r.physicians?.profiles?.full_name || "—",
          specialization: r.physicians?.specialization ?? null,
          scheduleType: deriveScheduleType(r.physicians?.physician_schedules, date),
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
      return (data || []).map((r: any): RoomCol => ({
        kind: "room",
        id: r.room_id,
        name: r.rooms?.name || "—",
        roomType: r.rooms?.room_types?.name ?? null,
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
        .in("physician_id", physicianIds)
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
    queryKey: ["multi-cal-queue-configs", physicianIds.join(","), dateStr, hospitalId],
    queryFn: async () => {
      const queuePhysIds = physicians
        .filter((p) => p.scheduleType === "queue")
        .map((p) => p.id);
      if (queuePhysIds.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("queue_configs")
        .select("physician_id, last_number")
        .eq("hospital_id", hospitalId)
        .eq("queue_date", dateStr)
        .in("physician_id", queuePhysIds);
      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        map[r.physician_id] = r.last_number ?? 0;
      });
      return map;
    },
    enabled: physicians.some((p) => p.scheduleType === "queue"),
  });
  const queueConfigs = queueConfigsData ?? {};

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
      if (mode === "registrar") {
        const { data, error } = await supabase.rpc("registrar_add_service", {
          p_patient_id: patientId,
          p_hospital_id: hospitalId,
          p_created_by: user.id,
          p_service_id: service.id,
          p_assigned_physician_id: isRoom ? null : (selected.col as PhysCol).id,
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

      const isQueueBooking = selected.slot.id.startsWith("queue-");
      if (isQueueBooking) {
        const physCol = selected.col as PhysCol;
        const today = dateStr;
        let queueConfigId: string;
        const { data: existingConfig } = await supabase
          .from("queue_configs")
          .select("id")
          .eq("physician_id", physCol.id)
          .eq("hospital_id", hospitalId)
          .eq("queue_date", today)
          .maybeSingle();
        if (existingConfig) {
          queueConfigId = existingConfig.id;
        } else {
          const { data: newConfig, error: configErr } = await supabase
            .from("queue_configs")
            .insert({ physician_id: physCol.id, hospital_id: hospitalId, queue_date: today })
            .select("id")
            .single();
          if (configErr) throw configErr;
          queueConfigId = newConfig.id;
        }
        const { data: qData, error: qErr } = await supabase.rpc("assign_queue_number", {
          p_queue_config_id: queueConfigId,
          p_visit_service_id: visitServiceId,
          p_hospital_id: hospitalId,
        });
        if (qErr) throw qErr;
        const queueNumber = (qData as any)?.queue_number;
        toast.success(`Booked. Queue #${queueNumber}`);
      } else {
        const { data: bookData, error: bookErr } = await supabase.rpc("book_slot", {
          p_slot_id: selected.slot.id,
          p_visit_service_id: visitServiceId,
        });
        if (bookErr) throw bookErr;
        const isWaitlist =
          (bookData as any)?.is_waitlist ??
          (Array.isArray(bookData) ? (bookData as any)[0]?.is_waitlist : undefined);
        toast.success(isWaitlist ? "Added to waitlist" : "Booked");
      }
      setSelected(null);
      await Promise.all([refetchSlots(), refetchRoomSlots()]);
      onBooked();
    } catch (err: any) {
      toast.error(err.message || "Failed to book");
    } finally {
      setSubmitting(false);
    }
  };

  const renderSlotButton = (s: SlotRow, col: Col) => {
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
        onClick={() => setSelected({ slot: s, col })}
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
                              "cursor-pointer rounded-lg border-2 p-4 text-center transition",
                              selected?.col.id === col.id
                                ? "border-primary bg-primary/5"
                                : "border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30"
                            )}
                            onClick={() => {
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
                              Click to select queue
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
                      {rSlots.length === 0 ? (
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
                {selectedLabel} · {toLocal(selected.slot.slot_datetime, timezone, "MMM d, HH:mm")}
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
