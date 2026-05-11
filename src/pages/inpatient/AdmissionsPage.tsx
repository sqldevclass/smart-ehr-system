import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { format, differenceInDays } from "date-fns";
import { PeriodFilter, PeriodState, getDateBounds, getTodayBounds, SummaryCard, MetricTile } from "@/components/shared/PeriodFilter";

export default function AdmissionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [admitDialogOpen, setAdmitDialogOpen] = useState(false);
  const [selectedVs, setSelectedVs] = useState<any>(null);
  const [typeId, setTypeId] = useState("");
  const [urgencyId, setUrgencyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [physicianId, setPhysicianId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [periodState, setPeriodState] = useState<PeriodState>({ period: "today" });
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "discharged">("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "planned" | "emergency">("all");

  const bounds = getDateBounds(periodState);

  const { data: recommended, isLoading: loadingRec } = useQuery({
    queryKey: ["hospitalization-recommended", user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visit_services")
        .select("id, patient_id, created_at, visits(visit_date), patients(first_name, last_name, patient_number)")
        .eq("hospital_id", user!.hospitalId)
        .eq("hospitalization_recommended", true)
        .is("hospitalization_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: active, isLoading: loadingActive } = useQuery({
    queryKey: ["active-hospitalizations", user?.hospitalId, bounds.from, bounds.to, statusFilter, deptFilter, typeFilter],
    queryFn: async () => {
      let q = supabase
        .from("hospitalizations")
        .select("id, hospitalization_number, admitted_at, discharged_at, department_id, urgency_id, departments(name), patients(first_name, last_name, patient_number), hospitalization_types(name_ru), hospitalization_urgency(code), room_assignments(bed_number, rooms(name))")
        .eq("hospital_id", user!.hospitalId)
        .gte("admitted_at", bounds.from)
        .lte("admitted_at", bounds.to)
        .order("admitted_at", { ascending: false });
      if (statusFilter === "active") q = q.is("discharged_at", null);
      if (statusFilter === "discharged") q = q.not("discharged_at", "is", null);
      if (deptFilter !== "all") q = q.eq("department_id", deptFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = data || [];
      if (typeFilter !== "all") {
        rows = rows.filter((h: any) => h.hospitalization_urgency?.code === typeFilter);
      }
      return rows;
    },
    enabled: !!user?.hospitalId,
  });

  const { data: summary } = useQuery({
    queryKey: ["admissions-summary", user?.hospitalId],
    queryFn: async () => {
      const today = getTodayBounds();
      const [admittedTodayRes, activeRes, dischargedTodayRes, emergencyRes] = await Promise.all([
        supabase.from("hospitalizations").select("id", { count: "exact", head: true })
          .eq("hospital_id", user!.hospitalId)
          .gte("admitted_at", today.from).lte("admitted_at", today.to),
        supabase.from("hospitalizations").select("id", { count: "exact", head: true })
          .eq("hospital_id", user!.hospitalId).is("discharged_at", null),
        supabase.from("hospitalizations").select("id", { count: "exact", head: true })
          .eq("hospital_id", user!.hospitalId)
          .gte("discharged_at", today.from).lte("discharged_at", today.to),
        supabase.from("hospitalizations")
          .select("id, hospitalization_urgency!inner(code)")
          .eq("hospital_id", user!.hospitalId)
          .eq("hospitalization_urgency.code", "emergency")
          .gte("admitted_at", today.from).lte("admitted_at", today.to),
      ]);
      return {
        admittedToday: admittedTodayRes.count || 0,
        active: activeRes.count || 0,
        dischargedToday: dischargedTodayRes.count || 0,
        emergencyToday: (emergencyRes.data || []).length,
      };
    },
    enabled: !!user?.hospitalId,
  });

  // Lookups for dialog
  const { data: hospTypes } = useQuery({
    queryKey: ["hospitalization-types"],
    queryFn: async () => {
      const { data } = await supabase.from("hospitalization_types").select("id, name_ru");
      return data || [];
    },
  });

  const { data: urgencies } = useQuery({
    queryKey: ["hospitalization-urgencies"],
    queryFn: async () => {
      const { data } = await supabase.from("hospitalization_urgency").select("id, name_ru");
      return data || [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId)
        .order("name");
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const { data: physicians } = useQuery({
    queryKey: ["physicians-list", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("physicians")
        .select("id, profiles(first_name, last_name)")
        .eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user?.hospitalId,
  });

  const openAdmitDialog = (vs: any) => {
    setSelectedVs(vs);
    setTypeId("");
    setUrgencyId("");
    setDepartmentId("");
    setPhysicianId("");
    setAdmitDialogOpen(true);
  };

  const handleAdmit = async () => {
    if (!typeId || !urgencyId || !departmentId || !selectedVs) return;
    setSubmitting(true);
    try {
      const { data: hosp, error } = await supabase
        .from("hospitalizations")
        .insert({
          patient_id: selectedVs.patient_id,
          hospital_id: user!.hospitalId,
          hospitalization_type_id: typeId,
          urgency_id: urgencyId,
          department_id: departmentId,
          primary_physician_id: physicianId || null,
          admitted_by: user!.id,
          admitted_at: new Date().toISOString(),
          created_from_visit_service_id: selectedVs.id,
        })
        .select("id, hospitalization_number")
        .single();
      if (error) throw error;

      // Link visit_service to the new hospitalization
      await supabase
        .from("visit_services")
        .update({ hospitalization_id: hosp.id })
        .eq("id", selectedVs.id);

      toast.success(`Patient admitted. Hospitalization #${hosp.hospitalization_number}`);
      setAdmitDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hospitalization-recommended"] });
      queryClient.invalidateQueries({ queryKey: ["active-hospitalizations"] });
      navigate(`/inpatient/hospitalizations/${hosp.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to admit patient");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Recommended */}
      <Card>
        <CardHeader>
          <CardTitle>Hospitalization Recommended</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRec ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : !recommended?.length ? (
            <p className="text-muted-foreground text-sm">No pending referrals.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Patient #</TableHead>
                  <TableHead>Referred Date</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recommended.map((vs: any) => (
                  <TableRow key={vs.id}>
                    <TableCell>
                      {vs.patients?.last_name} {vs.patients?.first_name}
                    </TableCell>
                    <TableCell>{vs.patients?.patient_number}</TableCell>
                    <TableCell>{format(new Date(vs.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => openAdmitDialog(vs)}>
                        Admit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Hospitalized Patients */}
      <Card>
        <CardHeader>
          <CardTitle>Hospitalized Patients</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingActive ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : !active?.length ? (
            <p className="text-muted-foreground text-sm">No hospitalizations found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hosp #</TableHead>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Admitted At</TableHead>
                  <TableHead>Room / Bed</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((h: any) => {
                  const ra = h.room_assignments?.[0];
                  const days = differenceInDays(new Date(), new Date(h.admitted_at));
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono">{h.hospitalization_number}</TableCell>
                      <TableCell>
                        {h.patients?.last_name} {h.patients?.first_name}
                      </TableCell>
                      <TableCell>{h.departments?.name}</TableCell>
                      <TableCell>{h.hospitalization_types?.name_ru}</TableCell>
                      <TableCell>{format(new Date(h.admitted_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell>
                        {ra ? `${ra.rooms?.name} / Bed ${ra.bed_number}` : "—"}
                      </TableCell>
                      <TableCell>{days}</TableCell>
                      <TableCell>
                        {h.discharged_at ? (
                          <Badge variant="secondary">Discharged</Badge>
                        ) : (
                          <Badge className="bg-green-600 text-white hover:bg-green-700">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/inpatient/hospitalizations/${h.id}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Admit Dialog */}
      <Dialog open={admitDialogOpen} onOpenChange={setAdmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admit Patient</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Hospitalization Type</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {hospTypes?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Urgency</Label>
              <Select value={urgencyId} onValueChange={setUrgencyId}>
                <SelectTrigger><SelectValue placeholder="Select urgency" /></SelectTrigger>
                <SelectContent>
                  {urgencies?.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name_ru}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  {departments?.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary Physician (optional)</Label>
              <Select value={physicianId} onValueChange={setPhysicianId}>
                <SelectTrigger><SelectValue placeholder="Select physician" /></SelectTrigger>
                <SelectContent>
                  {physicians?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.profiles?.last_name} {p.profiles?.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdmitDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdmit} disabled={!typeId || !urgencyId || !departmentId || submitting}>
              {submitting ? "Admitting…" : "Admit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
