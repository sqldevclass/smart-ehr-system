import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, CalendarClock, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const DAYS = [
  { value: 1, short: "Mon", long: "Monday" },
  { value: 2, short: "Tue", long: "Tuesday" },
  { value: 3, short: "Wed", long: "Wednesday" },
  { value: 4, short: "Thu", long: "Thursday" },
  { value: 5, short: "Fri", long: "Friday" },
  { value: 6, short: "Sat", long: "Saturday" },
  { value: 0, short: "Sun", long: "Sunday" },
];

export default function HRSchedules() {
  const { user } = useAuth();
  const [selectedPhysicianId, setSelectedPhysicianId] = useState<string>("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);

  const { data: physicians = [] } = useQuery({
    queryKey: ["hr-physicians", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physicians")
        .select("id, specialization, profiles!inner(full_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Schedules</h1>
        <p className="text-sm text-muted-foreground">Manage physician schedules and blocked times.</p>
      </div>

      <div className="grid grid-cols-[300px_1fr] gap-6 items-start">
        {/* Left: physician list */}
        <div className="rounded-lg border bg-card p-3 space-y-1">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Physicians</p>
          {physicians.length === 0 && (
            <p className="px-2 py-2 text-sm text-muted-foreground">No active physicians.</p>
          )}
          {physicians.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelectedPhysicianId(p.id)}
              className={`w-full text-left rounded-md p-2 text-sm transition-colors ${
                selectedPhysicianId === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{p.profiles?.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{p.specialization || "—"}</div>
            </button>
          ))}
        </div>

        {/* Right */}
        <div className="space-y-6">
          {!selectedPhysicianId ? (
            <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
              Select a physician to view schedules.
            </div>
          ) : (
            <>
              <SchedulesSection
                physicianId={selectedPhysicianId}
                onAdd={() => { setEditingSchedule(null); setScheduleOpen(true); }}
                onEdit={(s) => { setEditingSchedule(s); setScheduleOpen(true); }}
              />
              <BlocksSection
                physicianId={selectedPhysicianId}
                onAdd={() => setBlockOpen(true)}
              />
            </>
          )}
        </div>
      </div>

      {scheduleOpen && (
        <ScheduleDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          physicianId={selectedPhysicianId}
          editing={editingSchedule}
        />
      )}
      {blockOpen && (
        <BlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          physicianId={selectedPhysicianId}
        />
      )}
    </div>
  );
}

function SchedulesSection({
  physicianId, onAdd, onEdit,
}: { physicianId: string; onAdd: () => void; onEdit: (s: any) => void }) {
  const queryClient = useQueryClient();
  const { data: schedules = [] } = useQuery({
    queryKey: ["physician-schedules", physicianId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_schedules")
        .select("*")
        .eq("physician_id", physicianId)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!physicianId,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    const { error } = await supabase.from("physician_schedules").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Schedule deleted.");
    queryClient.invalidateQueries({ queryKey: ["physician-schedules", physicianId] });
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schedules</h3>
        <Button size="sm" onClick={onAdd} className="gap-1">
          <Plus className="h-4 w-4" /> Add Schedule
        </Button>
      </div>
      {schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedules yet.</p>
      ) : (
        <div className="space-y-2">
          {schedules.map((s: any) => (
            <div key={s.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      s.schedule_type === "slots"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                        : "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
                    }`}>
                      {s.schedule_type === "slots" ? "Slots" : "Queue"}
                    </span>
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                      <Clock className="h-3 w-3" />
                      {(s.work_start || "").slice(0, 5)} – {(s.work_end || "").slice(0, 5)}
                    </span>
                    {s.schedule_type === "slots" && s.slot_duration_minutes && (
                      <span className="text-xs text-muted-foreground">
                        {s.slot_duration_minutes} min slots
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {DAYS.map((d) => (
                      <span
                        key={d.value}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          (s.days_of_week || []).includes(d.value)
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground/50"
                        }`}
                      >
                        {d.short}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Valid: {s.valid_from ? format(new Date(s.valid_from), "MMM d, yyyy") : "—"}
                    {" → "}
                    {s.valid_to ? format(new Date(s.valid_to), "MMM d, yyyy") : "open"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => onEdit(s)} className="gap-1">
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="gap-1 text-destructive">
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlocksSection({
  physicianId, onAdd,
}: { physicianId: string; onAdd: () => void }) {
  const queryClient = useQueryClient();
  const { data: blocks = [] } = useQuery({
    queryKey: ["physician-blocks", physicianId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physician_schedule_blocks")
        .select("*")
        .eq("physician_id", physicianId)
        .gte("blocked_to", new Date().toISOString())
        .order("blocked_from");
      if (error) throw error;
      return data || [];
    },
    enabled: !!physicianId,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this block?")) return;
    const { error } = await supabase.from("physician_schedule_blocks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Block removed.");
    queryClient.invalidateQueries({ queryKey: ["physician-blocks", physicianId] });
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Schedule Blocks</h3>
        <Button size="sm" onClick={onAdd} className="gap-1" variant="outline">
          <CalendarClock className="h-4 w-4" /> Block Time
        </Button>
      </div>
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming blocks.</p>
      ) : (
        <div className="space-y-2">
          {blocks.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between rounded-md border p-3 gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{b.reason || "Blocked"}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(b.blocked_from), "MMM d, yyyy HH:mm")}
                  {" → "}
                  {format(new Date(b.blocked_to), "MMM d, yyyy HH:mm")}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)} className="gap-1 text-destructive">
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleDialog({
  open, onOpenChange, physicianId, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  physicianId: string;
  editing: any | null;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [scheduleType, setScheduleType] = useState<"slots" | "queue">(editing?.schedule_type || "slots");
  const [days, setDays] = useState<number[]>(editing?.days_of_week || [1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState<string>((editing?.work_start || "09:00").slice(0, 5));
  const [workEnd, setWorkEnd] = useState<string>((editing?.work_end || "17:00").slice(0, 5));
  const [slotDuration, setSlotDuration] = useState<string>(editing?.slot_duration_minutes?.toString() || "15");
  const [validFrom, setValidFrom] = useState<string>(editing?.valid_from || today);
  const [validTo, setValidTo] = useState<string>(editing?.valid_to || "");
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => {
    setDays((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort());
  };

  const submit = async () => {
    if (days.length === 0) { toast.error("Select at least one working day."); return; }
    if (!workStart || !workEnd) { toast.error("Set working hours."); return; }
    if (scheduleType === "slots" && (!slotDuration || Number(slotDuration) <= 0)) {
      toast.error("Slot duration is required for slots mode."); return;
    }
    setSaving(true);
    try {
      const payload: any = {
        hospital_id: user!.hospitalId,
        physician_id: physicianId,
        schedule_type: scheduleType,
        days_of_week: days,
        work_start: workStart,
        work_end: workEnd,
        slot_duration_minutes: scheduleType === "slots" ? Number(slotDuration) : null,
        valid_from: validFrom,
        valid_to: validTo || null,
      };

      let scheduleId: string;
      if (editing) {
        const { error } = await supabase
          .from("physician_schedules")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        scheduleId = editing.id;
      } else {
        const { data, error } = await supabase
          .from("physician_schedules")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        scheduleId = data.id;
      }

      if (scheduleType === "slots") {
        const toDate = validTo || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { data: slotsCreated, error: slotErr } = await supabase.rpc("generate_slots", {
          p_schedule_id: scheduleId,
          p_from_date: validFrom,
          p_to_date: toDate,
        });
        if (slotErr) throw slotErr;
        toast.success(`Schedule ${editing ? "updated" : "created"}. ${slotsCreated || 0} slots generated.`);
      } else {
        toast.success(`Queue schedule ${editing ? "updated" : "created"}.`);
      }
      queryClient.invalidateQueries({ queryKey: ["physician-schedules", physicianId] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Schedule type</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScheduleType("slots")}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  scheduleType === "slots" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="font-semibold">Slots</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Patients book specific time slots in advance.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setScheduleType("queue")}
                className={`rounded-lg border-2 p-4 text-left transition-colors ${
                  scheduleType === "queue" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <div className="font-semibold">Queue</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Patients receive a queue number on arrival.
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.value} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer ${
                  days.includes(d.value) ? "border-primary bg-primary/5" : ""
                }`}>
                  <Checkbox
                    checked={days.includes(d.value)}
                    onCheckedChange={() => toggleDay(d.value)}
                  />
                  <span className="text-sm">{d.short}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Work start</Label>
              <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Work end</Label>
              <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </div>
          </div>

          {scheduleType === "slots" && (
            <div className="space-y-1.5">
              <Label>Slot duration (minutes) *</Label>
              <Input
                type="number"
                min={1}
                value={slotDuration}
                onChange={(e) => setSlotDuration(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valid from</Label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valid to (optional)</Label>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </div>
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

function BlockDialog({
  open, onOpenChange, physicianId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  physicianId: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!from || !to) { toast.error("Set start and end times."); return; }
    if (new Date(to) <= new Date(from)) { toast.error("End must be after start."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("physician_schedule_blocks").insert({
        hospital_id: user!.hospitalId,
        physician_id: physicianId,
        blocked_from: new Date(from).toISOString(),
        blocked_to: new Date(to).toISOString(),
        reason: reason.trim() || null,
        blocked_by: user!.id,
      });
      if (error) throw error;
      toast.success("Time blocked.");
      queryClient.invalidateQueries({ queryKey: ["physician-blocks", physicianId] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to block time.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block Time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Block lunch breaks and vacation periods so registrars cannot book during those times.
          </p>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Lunch break, Vacation" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Block"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
