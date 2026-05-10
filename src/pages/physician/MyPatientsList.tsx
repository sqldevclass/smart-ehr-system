import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { format, subDays, addDays, startOfDay, endOfDay, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toLocal } from "@/lib/timezone";

interface Physician {
  id: string;
  dashboard_type: string | null;
}

interface VisitServiceRow {
  id: string;
  visit_id: string;
  scheduled_at: string | null;
  queue_number: number | null;
  cost_at_time: number;
  slot_id: string | null;
  is_waitlist: boolean | null;
  completed_by?: string | null;
  service_statuses: { code: string | null; name_ru: string | null } | null;
  services: { id?: string; name: string | null } | null;
  rooms?: { name: string | null } | null;
  visits: {
    patients: {
      first_name: string | null;
      last_name: string | null;
      patient_number: string | null;
      date_of_birth: string | null;
    } | null;
  } | null;
}

const statusVariant = (code?: string | null) => {
  switch (code) {
    case "preliminary":
      return "bg-yellow-100 text-yellow-900 border-yellow-200";
    case "ready_for_execution":
      return "bg-green-100 text-green-900 border-green-200";
    case "completed":
      return "bg-blue-100 text-blue-900 border-blue-200";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const formatPatient = (p: any) => {
  if (!p) return "—";
  return [p.last_name, p.first_name].filter(Boolean).join(" ") || "—";
};

export default function MyPatientsList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [physicianMissing, setPhysicianMissing] = useState(false);
  const [rows, setRows] = useState<VisitServiceRow[]>([]);
  const [completedByNames, setCompletedByNames] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: phys, error: physErr } = await supabase
      .from("physicians")
      .select("id, dashboard_type")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (physErr) toast.error(physErr.message);

    if (!phys) {
      setPhysicianMissing(true);
      setLoading(false);
      return;
    }

    const { data: statuses } = await supabase
      .from("service_statuses")
      .select("id, code")
      .in("code", ["ready_for_execution", "preliminary", "completed"]);

    const allowedStatusIds = (statuses || []).map((s: any) => s.id);

    if (allowedStatusIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd = endOfDay(selectedDate).toISOString();

    const { data: vs, error: vsErr } = await supabase
      .from("visit_services")
      .select(
        "id, scheduled_at, queue_number, cost_at_time, visit_id, slot_id, is_waitlist, created_at, service_statuses(code, name_ru), services(id, name), visits(visit_date, patients(first_name, last_name, patient_number, date_of_birth))"
      )
      .eq("assigned_physician_id", (phys as Physician).id)
      .eq("hospital_id", user.hospitalId)
      .in("status_id", allowedStatusIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (vsErr) toast.error(vsErr.message);

    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    const filtered = (vs || []).filter((row: any) => {
      if (row.scheduled_at) {
        return row.scheduled_at >= dayStart && row.scheduled_at <= dayEnd;
      }
      if (row.queue_number != null) {
        return row.visits?.visit_date === selectedDateStr;
      }
      return false;
    });
    setRows(filtered as any);
    setLoading(false);
  }, [user, selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (visitServiceId: string) => {
    if (!user) return;
    const { error } = await supabase.rpc("complete_service", {
      p_visit_service_id: visitServiceId,
      p_completed_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Service completed");
    load();
  };

  // Sort: scheduled_at asc nulls last, then created_at asc.
  // Then reorder so waitlist patients sharing a slot appear directly after the primary.
  const sorted = useMemo(() => {
    const sortedRows = [...rows].sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return 0;
    });

    // Group by slot_id, primary first then waitlist
    const bySlot = new Map<string, VisitServiceRow[]>();
    const nonSlot: VisitServiceRow[] = [];
    sortedRows.forEach((r) => {
      if (r.slot_id) {
        if (!bySlot.has(r.slot_id)) bySlot.set(r.slot_id, []);
        bySlot.get(r.slot_id)!.push(r);
      } else {
        nonSlot.push(r);
      }
    });
    bySlot.forEach((arr) => {
      arr.sort((a, b) => Number(a.is_waitlist || 0) - Number(b.is_waitlist || 0));
    });

    const result: VisitServiceRow[] = [];
    const seen = new Set<string>();
    sortedRows.forEach((r) => {
      if (seen.has(r.id)) return;
      if (r.slot_id) {
        const group = bySlot.get(r.slot_id) || [r];
        group.forEach((g) => {
          if (!seen.has(g.id)) {
            result.push(g);
            seen.add(g.id);
          }
        });
      } else {
        result.push(r);
        seen.add(r.id);
      }
    });
    return result;
  }, [rows]);

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

  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">My Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Services assigned to you.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelectedDate(subDays(selectedDate, 1))}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Yesterday
        </Button>
        <div className="px-3 py-1.5 text-sm font-medium rounded-md bg-muted min-w-[180px] text-center">
          {format(selectedDate, "EEEE, MMM d")}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          className="gap-1"
        >
          Tomorrow <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday && (
          <Button size="sm" variant="ghost" onClick={() => setSelectedDate(new Date())}>
            Today
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Patient #</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Time / Queue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  No services for today.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => {
                const patient = r.visits?.patients;
                const isWL = !!r.is_waitlist;
                return (
                  <TableRow key={r.id}>
                    <TableCell className={`font-medium ${isWL ? "pl-8" : ""}`}>
                      {formatPatient(patient)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {patient?.patient_number || "—"}
                    </TableCell>
                    <TableCell>{r.services?.name || "—"}</TableCell>
                    <TableCell>
                      {isWL ? (
                        <span className="rounded border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900">
                          Wait List
                        </span>
                      ) : r.scheduled_at ? (
                        toLocal(r.scheduled_at, user?.timezone || "Asia/Tashkent", "MMM d, HH:mm")
                      ) : r.queue_number != null ? (
                        `#${r.queue_number}`
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-medium ${statusVariant(
                          r.service_statuses?.code
                        )}`}
                      >
                        {r.service_statuses?.name_ru || r.service_statuses?.code || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {r.service_statuses?.code === "ready_for_execution" && (
                        <Button size="sm" onClick={() => handleComplete(r.id)}>
                          Complete
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
