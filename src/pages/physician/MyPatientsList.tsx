import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import DocumentWorkspace from "@/components/documents/DocumentWorkspace";

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
  assigned_room_id?: string | null;
  created_by?: string | null;
  ordering_physician?: { full_name: string | null } | null;
  service_statuses: { code: string | null; name_ru: string | null } | null;
  services: { id?: string; name: string | null; linked_document_type_id?: string | null } | null;
  rooms?: { name: string | null } | null;
  visits: {
    patient_id?: string | null;
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [physicianMissing, setPhysicianMissing] = useState(false);
  const [rows, setRows] = useState<VisitServiceRow[]>([]);
  const [roomRows, setRoomRows] = useState<VisitServiceRow[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [completedByNames, setCompletedByNames] = useState<Record<string, string>>({});
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const [activeDocument, setActiveDocument] = useState<{
    visitServiceId: string;
    patientId: string;
    visitId: string;
    documentTypeId: string;
  } | null>(null);

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
      setRoomRows([]);
      setLoading(false);
      return;
    }

    const dayStart = startOfDay(selectedDate).toISOString();
    const dayEnd = endOfDay(selectedDate).toISOString();

    const { data: vs, error: vsErr } = await supabase
      .from("visit_services")
      .select(
        "id, scheduled_at, queue_number, cost_at_time, visit_id, slot_id, is_waitlist, created_at, completed_by, assigned_room_id, created_by, service_statuses(code, name_ru), services(id, name, linked_document_type_id), profiles!visit_services_created_by_fkey(full_name), visits(patient_id, visit_date, patients(first_name, last_name, patient_number, date_of_birth))"
      )
      .eq("assigned_physician_id", (phys as Physician).id)
      .eq("hospital_id", user.hospitalId)
      .in("status_id", allowedStatusIds)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (vsErr) toast.error(vsErr.message);

    // Office rooms this physician is assigned to
    const { data: myRooms } = await supabase
      .from("office_room_physicians")
      .select("room_id, rooms(id, name)")
      .eq("physician_id", (phys as Physician).id)
      .eq("hospital_id", user.hospitalId);

    const myRoomIds = (myRooms || []).map((r: any) => r.room_id);
    const rMap: Record<string, string> = {};
    for (const r of myRooms || []) {
      rMap[(r as any).room_id] = (r as any).rooms?.name || "Room";
    }
    setRoomMap(rMap);

    let roomServices: any[] = [];
    if (myRoomIds.length > 0) {
      const { data: rs, error: rsErr } = await supabase
        .from("visit_services")
        .select(
          "id, scheduled_at, queue_number, cost_at_time, visit_id, slot_id, is_waitlist, created_at, completed_by, assigned_room_id, service_statuses(code, name_ru), services(id, name, linked_document_type_id), visits(patient_id, visit_date, patients(first_name, last_name, patient_number, date_of_birth))"
        )
        .eq("hospital_id", user.hospitalId)
        .in("assigned_room_id", myRoomIds)
        .in("status_id", allowedStatusIds);
      if (rsErr) toast.error(rsErr.message);
      roomServices = rs || [];
    }

    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    const filteredMain = (vs || []).filter((row: any) => {
      if (row.scheduled_at) {
        return row.scheduled_at >= dayStart && row.scheduled_at <= dayEnd;
      }
      return row.visits?.visit_date === selectedDateStr;
    });

    // Avoid double-listing rows already in the main list
    const mainIds = new Set(filteredMain.map((r: any) => r.id));
    const filteredRoom = roomServices.filter((r: any) => {
      if (mainIds.has(r.id)) return false;
      if (r.scheduled_at) {
        return r.scheduled_at >= dayStart && r.scheduled_at <= dayEnd;
      }
      return r.visits?.visit_date === selectedDateStr;
    });

    // Fetch profiles for completed_by uuids across both lists
    const completedIds = Array.from(
      new Set(
        [...filteredMain, ...filteredRoom]
          .map((r: any) => r.completed_by)
          .filter(Boolean)
      )
    );
    if (completedIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", completedIds);
      const map: Record<string, string> = {};
      for (const p of profs || []) map[(p as any).id] = (p as any).full_name || "";
      setCompletedByNames(map);
    } else {
      setCompletedByNames({});
    }

    setRows(filteredMain as any);
    setRoomRows(filteredRoom as any);
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

    const bySlot = new Map<string, VisitServiceRow[]>();
    sortedRows.forEach((r) => {
      if (r.slot_id) {
        if (!bySlot.has(r.slot_id)) bySlot.set(r.slot_id, []);
        bySlot.get(r.slot_id)!.push(r);
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

  // Group room services by assigned_room_id, sorted by scheduled_at desc
  const roomGroups = useMemo(() => {
    const groups: Record<string, VisitServiceRow[]> = {};
    for (const roomId of Object.keys(roomMap)) groups[roomId] = [];
    for (const r of roomRows) {
      const rid = (r as any).assigned_room_id;
      if (!rid) continue;
      if (!groups[rid]) groups[rid] = [];
      groups[rid].push(r);
    }
    for (const rid of Object.keys(groups)) {
      groups[rid].sort((a, b) => {
        const aT = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const bT = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return bT - aT;
      });
    }
    return groups;
  }, [roomRows, roomMap]);

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

  const renderServiceRow = (r: VisitServiceRow, showActions = true) => {
    const patient = r.visits?.patients;
    const pid = r.visits?.patient_id;
    const isWL = !!r.is_waitlist;
    return (
      <TableRow
        key={r.id}
        className="cursor-pointer hover:bg-accent"
        onClick={() => {
          if (pid) navigate(`/physician/patients/${pid}`);
        }}
      >
        <TableCell className={`font-medium ${isWL ? "pl-8" : ""}`}>
          {formatPatient(patient)}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {patient?.patient_number || "—"}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span>{r.services?.name || "—"}</span>
            {r.created_by && r.ordering_physician?.full_name && (
              <span className="text-[11px] text-muted-foreground">
                Ordered by: {r.ordering_physician.full_name}
              </span>
            )}
            {r.service_statuses?.code === "completed" && r.completed_by && completedByNames[r.completed_by] && (
              <span className="text-[11px] text-muted-foreground">
                Completed by: {completedByNames[r.completed_by]}
              </span>
            )}
          </div>
        </TableCell>
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
        {showActions && (
          <TableCell className="text-right">
            {r.service_statuses?.code === "ready_for_execution" && (
              <Button size="sm" onClick={(e) => { e.stopPropagation(); handleComplete(r.id); }}>
                Complete
              </Button>
            )}
          </TableCell>
        )}
      </TableRow>
    );
  };

  const roomIdsList = Object.keys(roomMap);

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                  No services for today.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => renderServiceRow(r, false))
            )}
          </TableBody>
        </Table>
      </div>

      {roomIdsList.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            Office Room Services
          </h2>
          {roomIdsList.map((roomId) => {
            const list = roomGroups[roomId] || [];
            const expanded = !!expandedRooms[roomId];
            const visible = expanded ? list : list.slice(0, 1);
            return (
              <div key={roomId} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <div className="text-sm font-medium">{roomMap[roomId]}</div>
                  {list.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExpandedRooms((s) => ({ ...s, [roomId]: !expanded }))
                      }
                    >
                      {expanded ? "Show less" : `Show all (${list.length})`}
                    </Button>
                  )}
                </div>
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
                    {visible.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                          No services for this room today.
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((r) => renderServiceRow(r, true))
                    )}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
