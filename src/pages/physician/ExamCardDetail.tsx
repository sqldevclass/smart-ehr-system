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
import { ArrowLeft, CalendarIcon, Edit, Save, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ExamCardDetail() {
  const { patientId, examId } = useParams();
  const navigate = useNavigate();
  const { physicianId, user } = usePhysicianId();
  const queryClient = useQueryClient();

  // Header edit state
  const [editing, setEditing] = useState(false);
  const [admDate, setAdmDate] = useState<Date>(new Date());
  const [disDate, setDisDate] = useState<Date | undefined>();
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState("");
  const [headerSaving, setHeaderSaving] = useState(false);

  // Lab result inline form
  const [showLabForm, setShowLabForm] = useState(false);
  const [labTestName, setLabTestName] = useState("");
  const [labTestDate, setLabTestDate] = useState<Date>(new Date());
  const [labResults, setLabResults] = useState("");
  const [labPerformedBy, setLabPerformedBy] = useState("");
  const [labSaving, setLabSaving] = useState(false);

  // Service inline form
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [servicePerformedAt, setServicePerformedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [servicePhysicianId, setServicePhysicianId] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [serviceSaving, setServiceSaving] = useState(false);

  // Queries
  const { data: examCard, isLoading } = useQuery({
    queryKey: ["exam-card", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("examination_cards")
        .select("*")
        .eq("id", examId!)
        .eq("hospital_id", user!.hospitalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!examId && !!user,
  });

  const { data: physicians = [] } = useQuery({
    queryKey: ["hospital-physicians", user?.hospitalId],
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

  const { data: labResultsData = [], isLoading: labsLoading } = useQuery({
    queryKey: ["lab-results", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_results")
        .select("*")
        .eq("examination_card_id", examId!)
        .order("test_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!examId,
  });

  const { data: serviceLogs = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["service-logs", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_logs")
        .select("*")
        .eq("examination_card_id", examId!)
        .order("performed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!examId,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user,
  });

  const attendingPhysician = physicians.find((p) => p.id === examCard?.attending_physician_id)?.full_name || "—";

  // Header edit handlers
  const startEditing = () => {
    if (!examCard) return;
    setAdmDate(new Date(examCard.admission_date));
    setDisDate(examCard.discharge_date ? new Date(examCard.discharge_date) : undefined);
    setStatus(examCard.status || "open");
    setNotes(examCard.notes || "");
    setEditing(true);
  };

  const handleSaveHeader = async () => {
    setHeaderSaving(true);
    try {
      const { error } = await supabase
        .from("examination_cards")
        .update({
          admission_date: format(admDate, "yyyy-MM-dd"),
          discharge_date: disDate ? format(disDate, "yyyy-MM-dd") : null,
          status,
          notes: notes.trim() || null,
        })
        .eq("id", examId!);
      if (error) { toast.error(error.message); return; }
      toast.success("Examination card updated.");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["exam-card", examId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setHeaderSaving(false);
    }
  };

  // Lab result save
  const handleSaveLab = async () => {
    if (!labTestName.trim()) { toast.error("Test name is required."); return; }
    setLabSaving(true);
    try {
      const { error } = await supabase.from("lab_results").insert({
        examination_card_id: examId!,
        hospital_id: user!.hospitalId,
        created_by: user!.id,
        test_name: labTestName.trim(),
        test_date: format(labTestDate, "yyyy-MM-dd"),
        results: labResults.trim() || null,
        performed_by: labPerformedBy || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Lab result added.");
      setShowLabForm(false);
      setLabTestName("");
      setLabResults("");
      setLabPerformedBy("");
      setLabTestDate(new Date());
      queryClient.invalidateQueries({ queryKey: ["lab-results", examId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLabSaving(false);
    }
  };

  // Service log save
  const handleSaveService = async () => {
    if (!serviceId) { toast.error("Service is required."); return; }
    setServiceSaving(true);
    try {
      const { error } = await supabase.from("service_logs").insert({
        examination_card_id: examId!,
        hospital_id: user!.hospitalId,
        created_by: user!.id,
        service_id: serviceId,
        performed_at: servicePerformedAt,
        physician_id: servicePhysicianId || null,
        notes: serviceNotes.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Service recorded.");
      setShowServiceForm(false);
      setServiceId("");
      setServicePhysicianId("");
      setServiceNotes("");
      setServicePerformedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      queryClient.invalidateQueries({ queryKey: ["service-logs", examId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setServiceSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!examCard) return <p className="text-sm text-destructive">Examination card not found.</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/physician/patients/${patientId}`)} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Patient
      </Button>

      {/* Header */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-foreground">Examination Card</h2>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          ) : (
            <Button size="sm" onClick={handleSaveHeader} disabled={headerSaving} className="gap-2">
              <Save className="h-4 w-4" /> {headerSaving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>

        {!editing ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-muted-foreground">Admission Date</p><p className="font-medium text-foreground">{format(new Date(examCard.admission_date), "MMM d, yyyy")}</p></div>
            <div><p className="text-muted-foreground">Discharge Date</p><p className="font-medium text-foreground">{examCard.discharge_date ? format(new Date(examCard.discharge_date), "MMM d, yyyy") : "—"}</p></div>
            <div><p className="text-muted-foreground">Status</p><p className="font-medium text-foreground">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${examCard.status === "open" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>{examCard.status}</span>
            </p></div>
            <div><p className="text-muted-foreground">Attending Physician</p><p className="font-medium text-foreground">{attendingPhysician}</p></div>
            {examCard.notes && <div className="col-span-2"><p className="text-muted-foreground">Notes</p><p className="font-medium text-foreground">{examCard.notes}</p></div>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Admission Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />{format(admDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={admDate} onSelect={(d) => d && setAdmDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Discharge Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !disDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />{disDate ? format(disDate, "PPP") : "Not set"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={disDate} onSelect={setDisDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}
      </div>

      {/* Lab Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">Lab Results</h3>
          <Button size="sm" onClick={() => setShowLabForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Lab Result
          </Button>
        </div>

        {showLabForm && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Test Name *</Label>
                <Input value={labTestName} onChange={(e) => setLabTestName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Test Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />{format(labTestDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={labTestDate} onSelect={(d) => d && setLabTestDate(d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Results</Label>
              <Textarea value={labResults} onChange={(e) => setLabResults(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Performed By</Label>
              <Select value={labPerformedBy} onValueChange={setLabPerformedBy}>
                <SelectTrigger><SelectValue placeholder="Select physician" /></SelectTrigger>
                <SelectContent>
                  {physicians.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveLab} disabled={labSaving}>{labSaving ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={() => setShowLabForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {labsLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : labResultsData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lab results yet.</p>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Test Date</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Performed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labResultsData.map((lr) => (
                  <TableRow key={lr.id}>
                    <TableCell className="font-medium">{lr.test_name}</TableCell>
                    <TableCell>{format(new Date(lr.test_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{lr.results || "—"}</TableCell>
                    <TableCell>{physicians.find((p) => p.id === lr.performed_by)?.full_name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Services Rendered */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold text-foreground">Services Rendered</h3>
          <Button size="sm" onClick={() => setShowServiceForm(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Service
          </Button>
        </div>

        {showServiceForm && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Service *</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Performed At</Label>
                <Input type="datetime-local" value={servicePerformedAt} onChange={(e) => setServicePerformedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Physician</Label>
                <Select value={servicePhysicianId} onValueChange={setServicePhysicianId}>
                  <SelectTrigger><SelectValue placeholder="Select physician" /></SelectTrigger>
                  <SelectContent>
                    {physicians.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={serviceNotes} onChange={(e) => setServiceNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveService} disabled={serviceSaving}>{serviceSaving ? "Saving…" : "Save"}</Button>
              <Button variant="outline" onClick={() => setShowServiceForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {servicesLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : serviceLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No services recorded yet.</p>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Performed At</TableHead>
                  <TableHead>Physician</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceLogs.map((sl) => (
                  <TableRow key={sl.id}>
                    <TableCell className="font-medium">{services.find((s) => s.id === sl.service_id)?.name || "—"}</TableCell>
                    <TableCell>{sl.performed_at ? format(new Date(sl.performed_at), "MMM d, yyyy HH:mm") : "—"}</TableCell>
                    <TableCell>{physicians.find((p) => p.id === sl.physician_id)?.full_name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{sl.notes || "—"}</TableCell>
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
