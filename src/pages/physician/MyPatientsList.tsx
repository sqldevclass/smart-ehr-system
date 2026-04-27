import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Plus } from "lucide-react";

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
  service_statuses: { code: string | null; name_ru: string | null } | null;
  services: { id?: string; name: string | null } | null;
  visits: {
    patients: {
      first_name: string | null;
      last_name: string | null;
      patient_number: string | null;
      date_of_birth: string | null;
    } | null;
  } | null;
}

interface ServiceOption {
  id: string;
  name: string;
  cost: number;
  cost_with_vat: number | null;
}

interface PhysicianOption {
  id: string;
  full_name: string;
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

const formatPatient = (p: VisitServiceRow["visits"] extends infer V ? any : any) => {
  if (!p) return "—";
  return [p.last_name, p.first_name].filter(Boolean).join(" ") || "—";
};

export default function MyPatientsList() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [physician, setPhysician] = useState<Physician | null>(null);
  const [physicianMissing, setPhysicianMissing] = useState(false);
  const [rows, setRows] = useState<VisitServiceRow[]>([]);
  const [statusByCode, setStatusByCode] = useState<Record<string, string>>({});
  const [orderForVisit, setOrderForVisit] = useState<{
    visitId: string;
    patientName: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // 1. Physician record
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
    setPhysician(phys as Physician);

    // 2. Status IDs
    const { data: statuses } = await supabase
      .from("service_statuses")
      .select("id, code")
      .in("code", ["ready_for_execution", "preliminary", "completed"]);

    const sMap: Record<string, string> = {};
    (statuses || []).forEach((s: any) => {
      sMap[s.code] = s.id;
    });
    setStatusByCode(sMap);

    const allowedStatusIds = Object.values(sMap);

    if (allowedStatusIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // 3. Today's visit_services for this physician
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { data: vs, error: vsErr } = await supabase
      .from("visit_services")
      .select(
        "id, scheduled_at, queue_number, cost_at_time, visit_id, service_statuses(code, name_ru), services(id, name), visits(patients(first_name, last_name, patient_number, date_of_birth))"
      )
      .eq("assigned_physician_id", phys.id)
      .eq("hospital_id", user.hospitalId)
      .in("status_id", allowedStatusIds)
      .order("scheduled_at", { ascending: true });

    if (vsErr) toast.error(vsErr.message);
    setRows((vs || []) as any);
    setLoading(false);
  }, [user]);

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

  const grouped = useMemo(() => {
    const ready: VisitServiceRow[] = [];
    const prelim: VisitServiceRow[] = [];
    const done: VisitServiceRow[] = [];
    rows.forEach((r) => {
      const code = r.service_statuses?.code;
      if (code === "ready_for_execution") ready.push(r);
      else if (code === "preliminary") prelim.push(r);
      else if (code === "completed") done.push(r);
    });
    return { ready, prelim, done };
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

  const renderTable = (items: VisitServiceRow[], showComplete: boolean, showOrder: boolean) => (
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
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
              No services.
            </TableCell>
          </TableRow>
        ) : (
          items.map((r) => {
            const patient = r.visits?.patients;
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{formatPatient(patient)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {patient?.patient_number || "—"}
                </TableCell>
                <TableCell>{r.services?.name || "—"}</TableCell>
                <TableCell>
                  {r.scheduled_at
                    ? format(new Date(r.scheduled_at), "MMM d, HH:mm")
                    : r.queue_number != null
                    ? `#${r.queue_number}`
                    : "—"}
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
                  <div className="flex items-center justify-end gap-2">
                    {showComplete && r.service_statuses?.code === "ready_for_execution" && (
                      <Button size="sm" onClick={() => handleComplete(r.id)}>
                        Complete
                      </Button>
                    )}
                    {showOrder && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() =>
                          setOrderForVisit({
                            visitId: r.visit_id,
                            patientName: formatPatient(patient),
                          })
                        }
                      >
                        <Plus className="h-3 w-3" /> Order Service
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">My Patients</h1>
        <p className="text-sm text-muted-foreground">
          Today's services assigned to you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ready for Execution ({grouped.ready.length})</CardTitle>
        </CardHeader>
        <CardContent>{renderTable(grouped.ready, true, true)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preliminary ({grouped.prelim.length})</CardTitle>
        </CardHeader>
        <CardContent>{renderTable(grouped.prelim, false, false)}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed ({grouped.done.length})</CardTitle>
        </CardHeader>
        <CardContent>{renderTable(grouped.done, false, false)}</CardContent>
      </Card>

      <OrderServiceDialog
        open={!!orderForVisit}
        onClose={() => setOrderForVisit(null)}
        visitId={orderForVisit?.visitId ?? null}
        patientName={orderForVisit?.patientName ?? ""}
        physicianId={physician?.id ?? null}
        preliminaryStatusId={statusByCode["preliminary"] ?? null}
        onCreated={() => {
          setOrderForVisit(null);
          load();
        }}
      />
    </div>
  );
}

function OrderServiceDialog({
  open,
  onClose,
  visitId,
  patientName,
  physicianId,
  preliminaryStatusId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  visitId: string | null;
  patientName: string;
  physicianId: string | null;
  preliminaryStatusId: string | null;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [serviceId, setServiceId] = useState<string>("");
  const [physicians, setPhysicians] = useState<PhysicianOption[]>([]);
  const [assignedPhysicianId, setAssignedPhysicianId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Load services available to ordering physician via privileges
  useEffect(() => {
    if (!open || !user || !physicianId) return;
    setServiceId("");
    setAssignedPhysicianId("");
    setPhysicians([]);

    (async () => {
      // Services this physician has privileges for
      const { data: privs, error: pErr } = await supabase
        .from("physician_service_privileges")
        .select("service_id")
        .eq("physician_id", physicianId)
        .eq("hospital_id", user.hospitalId);

      if (pErr) {
        toast.error(pErr.message);
        return;
      }

      const ids = (privs || []).map((p: any) => p.service_id);
      if (ids.length === 0) {
        setServices([]);
        return;
      }

      const { data: svcs, error: sErr } = await supabase
        .from("services")
        .select("id, name, cost, cost_with_vat")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .in("id", ids)
        .order("name");

      if (sErr) {
        toast.error(sErr.message);
        return;
      }
      setServices((svcs || []) as ServiceOption[]);
    })();
  }, [open, user, physicianId]);

  // When service changes, load the physicians who have privilege on it
  useEffect(() => {
    if (!serviceId || !user) {
      setPhysicians([]);
      setAssignedPhysicianId("");
      return;
    }

    (async () => {
      const { data: privs } = await supabase
        .from("physician_service_privileges")
        .select("physician_id")
        .eq("service_id", serviceId)
        .eq("hospital_id", user.hospitalId);

      const ids = (privs || []).map((p: any) => p.physician_id);
      if (ids.length === 0) {
        setPhysicians([]);
        return;
      }

      const { data: phys } = await supabase
        .from("physicians")
        .select("id, profiles!inner(full_name)")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .in("id", ids);

      const opts: PhysicianOption[] = (phys || []).map((p: any) => ({
        id: p.id,
        full_name: p.profiles?.full_name || "Unknown",
      }));
      setPhysicians(opts);
      // Default to ordering physician if present
      if (physicianId && opts.some((o) => o.id === physicianId)) {
        setAssignedPhysicianId(physicianId);
      } else if (opts.length > 0) {
        setAssignedPhysicianId(opts[0].id);
      }
    })();
  }, [serviceId, user, physicianId]);

  const handleSubmit = async () => {
    if (!user || !visitId) return;
    if (!serviceId) {
      toast.error("Select a service.");
      return;
    }
    if (!assignedPhysicianId) {
      toast.error("Select a physician.");
      return;
    }
    if (!preliminaryStatusId) {
      toast.error("Preliminary status not found.");
      return;
    }

    const svc = services.find((s) => s.id === serviceId);
    const cost = Number(svc?.cost_with_vat ?? svc?.cost ?? 0);

    // Need patient_id for the visit
    setSubmitting(true);
    const { data: visit, error: vErr } = await supabase
      .from("visits")
      .select("patient_id")
      .eq("id", visitId)
      .single();

    if (vErr || !visit) {
      setSubmitting(false);
      toast.error(vErr?.message || "Visit not found.");
      return;
    }

    const { error } = await supabase.from("visit_services").insert({
      visit_id: visitId,
      patient_id: visit.patient_id,
      hospital_id: user.hospitalId,
      service_id: serviceId,
      assigned_physician_id: assignedPhysicianId,
      status_id: preliminaryStatusId,
      source: "physician",
      cost_at_time: cost,
      created_by: user.id,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Additional service ordered.");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order Additional Service</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Patient: <span className="font-medium text-foreground">{patientName}</span>
          </div>

          <div>
            <Label>Service</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a service" />
              </SelectTrigger>
              <SelectContent>
                {services.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No services available.
                  </div>
                ) : (
                  services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {Number(s.cost_with_vat ?? s.cost ?? 0).toFixed(2)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Assign To</Label>
            <Select
              value={assignedPhysicianId}
              onValueChange={setAssignedPhysicianId}
              disabled={!serviceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a physician" />
              </SelectTrigger>
              <SelectContent>
                {physicians.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No physicians available for this service.
                  </div>
                ) : (
                  physicians.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Ordering…" : "Order Service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
