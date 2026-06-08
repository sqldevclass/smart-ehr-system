import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePhysicianId } from "@/hooks/usePhysicianId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function PhysicianPatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { physicianId, user } = usePhysicianId();
  const queryClient = useQueryClient();

  const [showNewExam, setShowNewExam] = useState(false);
  const [admissionDate, setAdmissionDate] = useState<Date>(new Date());
  const [dischargeDate, setDischargeDate] = useState<Date | undefined>();
  const [examStatus, setExamStatus] = useState("open");
  const [examNotes, setExamNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["physician-patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && !!user,
  });

  const { data: examCards = [], isLoading: examsLoading } = useQuery({
    queryKey: ["exam-cards", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examination_cards")
        .select("id, admission_date, discharge_date, status")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .order("admission_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId && !!user,
  });

  const { data: physicians = [] } = useQuery({
    queryKey: ["hospital-physicians-names", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name)")
        .eq("hospital_id", user!.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      return (data || []).map((p: any) => ({
        id: p.id,
        full_name: `${p.persons?.last_name} ${p.persons?.first_name}`,
      }));
    },
    enabled: !!user,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user,
  });

  const handleCreateExam = async () => {
    if (!admissionDate) {
      toast.error("Admission date is required.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("examination_cards")
        .insert({
          patient_id: patientId!,
          attending_physician_id: physicianId!,
          hospital_id: user!.hospitalId,
          created_by: user!.id,
          admission_date: format(admissionDate, "yyyy-MM-dd"),
          discharge_date: dischargeDate ? format(dischargeDate, "yyyy-MM-dd") : null,
          status: examStatus,
          notes: examNotes.trim() || null,
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Examination card created.");
      queryClient.invalidateQueries({ queryKey: ["exam-cards", patientId] });
      setShowNewExam(false);
      setExamNotes("");
      setDischargeDate(undefined);
      setExamStatus("open");
      setAdmissionDate(new Date());

      // Navigate to the new exam card
      navigate(`/physician/patients/${patientId}/exam/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create examination card.");
    } finally {
      setSaving(false);
    }
  };

  const physicianName = physicians.find((p) => p.id === patient?.primary_staff_role_id)?.full_name || "—";
  const departmentName = departments.find((d) => d.id === patient?.primary_department_id)?.name || "—";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-sm text-destructive">Patient not found.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" onClick={() => navigate("/physician")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Patients
      </Button>

      {/* Patient Info Header */}
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="font-heading text-xl font-bold text-foreground">{patient.full_name}</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Date of Birth" value={patient.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"} />
          <Field label="Phone" value={patient.phone || "—"} />
          <Field label="Email" value={patient.email || "—"} />
          <Field label="Primary Physician" value={physicianName} />
          <Field label="Primary Department" value={departmentName} />
        </div>
      </div>

      {/* Examination Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">Examination Cards</h3>
          <Button onClick={() => setShowNewExam(true)} className="gap-2" size="sm">
            <Plus className="h-4 w-4" /> New Examination Card
          </Button>
        </div>

        {showNewExam && (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h4 className="font-medium text-foreground">New Examination Card</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Admission Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(admissionDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={admissionDate} onSelect={(d) => d && setAdmissionDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Discharge Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dischargeDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dischargeDate ? format(dischargeDate, "PPP") : "Not set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dischargeDate} onSelect={setDischargeDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={examStatus} onValueChange={setExamStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={examNotes} onChange={(e) => setExamNotes(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateExam} disabled={saving}>
                {saving ? "Saving…" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => setShowNewExam(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {examsLoading ? (
          <p className="text-sm text-muted-foreground">Loading examination cards…</p>
        ) : examCards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No examination cards yet.</p>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admission Date</TableHead>
                  <TableHead>Discharge Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {examCards.map((ec) => (
                  <TableRow
                    key={ec.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/physician/patients/${patientId}/exam/${ec.id}`)}
                  >
                    <TableCell>{format(new Date(ec.admission_date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{ec.discharge_date ? format(new Date(ec.discharge_date), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        ec.status === "open" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                      }`}>
                        {ec.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
