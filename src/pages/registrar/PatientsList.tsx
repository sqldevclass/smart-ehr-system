import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Patient {
  id: string;
  patient_number: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  registration_status: string | null;
}

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function PatientsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", user?.hospitalId, search],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("patients")
        .select("id, patient_number, first_name, last_name, middle_name, date_of_birth, gender, phone, registration_status")
        .eq("hospital_id", user.hospitalId)
        .order("created_at", { ascending: false });

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`last_name.ilike.${s},first_name.ilike.${s},phone.ilike.${s}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Patient[];
    },
    enabled: !!user,
  });

  // Patients with uninvoiced physician orders (preliminary, source=physician, not in any invoice_item)
  const { data: pendingOrderPatientIds = new Set<string>() } = useQuery({
    queryKey: ["patients-pending-physician-orders", user?.hospitalId],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase
        .from("visit_services")
        .select("visit:visits!inner(patient_id, hospital_id), source, service_statuses!inner(code), invoice_items(id)")
        .eq("source", "physician")
        .eq("service_statuses.code", "preliminary")
        .eq("visit.hospital_id", user.hospitalId);
      if (error) return new Set<string>();
      const ids = new Set<string>();
      (data || []).forEach((row: any) => {
        if ((!row.invoice_items || row.invoice_items.length === 0) && row.visit?.patient_id) {
          ids.add(row.visit.patient_id);
        }
      });
      return ids;
    },
    enabled: !!user,
  });

  const formatName = (p: Patient) =>
    [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Register Patient
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading patients…</p>
      ) : patients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No patients found.</p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient #</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/registrar/patients/${p.id}`)}
                >
                  <TableCell className="font-mono text-xs">{p.patient_number || "—"}</TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{formatName(p)}</span>
                      {pendingOrderPatientIds.has(p.id) && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          Pending order
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{p.date_of_birth ? format(new Date(p.date_of_birth), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>{p.phone || "—"}</TableCell>
                  <TableCell>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${p.registration_status === "full" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {p.registration_status || "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RegisterPatientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={(newPatientId) => {
          queryClient.invalidateQueries({ queryKey: ["patients"] });
          setDialogOpen(false);
          if (newPatientId) navigate(`/registrar/patients/${newPatientId}`);
        }}
      />
    </div>
  );
}

function RegisterPatientDialog({
  open, onOpenChange, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: (newPatientId?: string) => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState("quick");
  const [saving, setSaving] = useState(false);

  // Quick fields
  const [qFirst, setQFirst] = useState("");
  const [qLast, setQLast] = useState("");
  const [qPhone, setQPhone] = useState("");
  const [qDob, setQDob] = useState("");

  // Full fields (extra)
  const [fMiddle, setFMiddle] = useState("");
  const [fGender, setFGender] = useState("");
  const [fBlood, setFBlood] = useState("");
  const [fNationalId, setFNationalId] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fAddress, setFAddress] = useState("");

  const reset = () => {
    setQFirst(""); setQLast(""); setQPhone(""); setQDob("");
    setFMiddle(""); setFGender(""); setFBlood("");
    setFNationalId(""); setFEmail(""); setFAddress("");
    setTab("quick");
  };

  const submit = async () => {
    if (!user) return;
    if (!qFirst.trim() || !qLast.trim()) {
      toast.error("First and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const base: any = {
        first_name: qFirst.trim(),
        last_name: qLast.trim(),
        phone: qPhone.trim() || null,
        date_of_birth: qDob || null,
        hospital_id: user.hospitalId,
        registered_by: user.id,
        registration_status: tab === "full" ? "full" : "minimal",
      };

      if (tab === "full") {
        base.middle_name = fMiddle.trim() || null;
        base.gender = fGender || null;
        base.blood_type = fBlood || null;
        base.national_id = fNationalId.trim() || null;
        base.email = fEmail.trim() || null;
        base.address = fAddress.trim() || null;
      }

      const { data: newPatient, error } = await supabase
        .from("patients")
        .insert(base)
        .select("id")
        .single();
      if (error) throw error;

      toast.success("Patient registered.");
      reset();
      onSuccess(newPatient?.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to register patient.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Register New Patient</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quick">Quick (Call Center)</TabsTrigger>
            <TabsTrigger value="full">Full Registration</TabsTrigger>
          </TabsList>

          <TabsContent value="quick" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name *"><Input value={qFirst} onChange={(e) => setQFirst(e.target.value)} /></Field>
              <Field label="Last Name *"><Input value={qLast} onChange={(e) => setQLast(e.target.value)} /></Field>
              <Field label="Phone"><Input value={qPhone} onChange={(e) => setQPhone(e.target.value)} /></Field>
              <Field label="Date of Birth"><Input type="date" value={qDob} onChange={(e) => setQDob(e.target.value)} /></Field>
            </div>
          </TabsContent>

          <TabsContent value="full" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name *"><Input value={qFirst} onChange={(e) => setQFirst(e.target.value)} /></Field>
              <Field label="Last Name *"><Input value={qLast} onChange={(e) => setQLast(e.target.value)} /></Field>
              <Field label="Middle Name"><Input value={fMiddle} onChange={(e) => setFMiddle(e.target.value)} /></Field>
              <Field label="Date of Birth"><Input type="date" value={qDob} onChange={(e) => setQDob(e.target.value)} /></Field>
              <Field label="Gender">
                <Select value={fGender} onValueChange={setFGender}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Blood Type">
                <Select value={fBlood} onValueChange={setFBlood}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {BLOOD_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="National ID"><Input value={fNationalId} onChange={(e) => setFNationalId(e.target.value)} /></Field>
              <Field label="Phone"><Input value={qPhone} onChange={(e) => setQPhone(e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} /></Field>
            </div>
            <Field label="Address">
              <Textarea value={fAddress} onChange={(e) => setFAddress(e.target.value)} rows={2} />
            </Field>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
