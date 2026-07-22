import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ScheduleRow {
  id: string;
  schedule_type: string | null;
  work_start: string | null;
  work_end: string | null;
  slot_duration_minutes: number | null;
  days_of_week: number[] | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface SlotRow {
  id: string;
  slot_datetime: string;
  booking_count: number | null;
}

interface BookingRow {
  id: string;
  slot_id: string;
  patients: { first_name: string | null; last_name: string | null }[] | null;
  services: { name: string | null }[] | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PhysicianSchedule() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [physicianMissing, setPhysicianMissing] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("person_id")
      .eq("id", user.id)
      .maybeSingle();
    const { data: phys } = await supabase
      .from("staff_roles")
      .select("id")
      .eq("person_id", profile?.person_id)
      .eq("role_type", "physician")
      .eq("hospital_id", user.hospitalId)
      .eq("is_active", true)
      .maybeSingle();

    if (!phys) {
      setPhysicianMissing(true);
      setLoading(false);
      return;
    }

    const { data: scheds, error: sErr } = await supabase
      .from("physician_schedules")
      .select(
        "id, schedule_type, work_start, work_end, slot_duration_minutes, days_of_week, valid_from, valid_to"
      )
      .eq("staff_role_id", phys.id);

    if (sErr) toast.error(sErr.message);
    setSchedules((scheds || []) as ScheduleRow[]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: slotData, error: slErr } = await supabase
      .from("schedule_slots")
      .select("id, slot_datetime, booking_count")
      .eq("staff_role_id", phys.id)
      .gte("slot_datetime", todayStart.toISOString())
      .lte("slot_datetime", todayEnd.toISOString())
      .order("slot_datetime");

    if (slErr) toast.error(slErr.message);
    setSlots((slotData || []) as SlotRow[]);

    const slotIds = (slotData || []).map((s: any) => s.id);
    if (slotIds.length > 0) {
      const { data: bookingData, error: bErr } = await supabase
        .from("visit_services")
        .select("id, slot_id, patients(first_name, last_name), services(name)")
        .in("slot_id", slotIds);
      if (bErr) toast.error(bErr.message);
      setBookings((bookingData || []) as BookingRow[]);
    } else {
      setBookings([]);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (physicianMissing) {
    return (
      <p className="text-sm text-destructive">
        No physician profile found. Contact your administrator.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">My Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Your configured working hours and today's slots.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No schedule configured. Contact HR to set up your schedule.
            </p>
          ) : (
            <div className="space-y-4">
              {schedules.map((s) => (
                <div key={s.id} className="rounded border p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.schedule_type === "slots" ? "default" : "secondary"}>
                      {s.schedule_type === "slots" ? "Slots" : "Queue"}
                    </Badge>
                    {s.valid_from && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.valid_from), "MMM d, yyyy")}
                        {s.valid_to ? ` → ${format(new Date(s.valid_to), "MMM d, yyyy")}` : " → ongoing"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-muted-foreground">Working hours</div>
                      <div className="font-medium">
                        {s.work_start ?? "—"} – {s.work_end ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Days of week</div>
                      <div className="font-medium">
                        {s.days_of_week && s.days_of_week.length > 0
                          ? s.days_of_week.map((d) => DAY_NAMES[d] ?? d).join(", ")
                          : "—"}
                      </div>
                    </div>
                    {s.schedule_type === "slots" && (
                      <div>
                        <div className="text-muted-foreground">Slot duration</div>
                        <div className="font-medium">
                          {s.slot_duration_minutes ?? "—"} min
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today's Slots</CardTitle>
        </CardHeader>
        <CardContent>
          {slots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No slots for today.</p>
          ) : (
            <ul className="divide-y rounded border">
              {slots.map((slot) => {
                const slotBookings = bookings.filter((b) => b.slot_id === slot.id);
                return (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between px-4 py-2 text-sm"
                  >
                    <span className="font-mono">
                      {format(new Date(slot.slot_datetime), "HH:mm")}
                    </span>
                    {slotBookings.length === 0 ? (
                      <Badge variant="secondary">Free</Badge>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        {slotBookings.map((b) => (
                          <span key={b.id} className="text-xs text-muted-foreground">
                            {[
                              b.patients?.[0]?.last_name,
                              b.patients?.[0]?.first_name,
                            ].filter(Boolean).join(" ") || "—"}
                            {b.services?.[0]?.name ? ` · ${b.services[0].name}` : ""}
                          </span>
                        ))}
                        <Badge>Booked{slotBookings.length > 1 ? ` (${slotBookings.length})` : ""}</Badge>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
