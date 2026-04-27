import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [allergyOpen, setAllergyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: patient, isLoading } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!patientId && !!user,
  });

  const { data: allergies = [] } = useQuery({
    queryKey: ["patient-allergies", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_allergies")
        .select("id, allergy_type, description, severity")
        .eq("patient_id", patientId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["patient-contacts", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_contacts")
        .select("id, name, relationship, phone, is_primary")
        .eq("patient_id", patientId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId,
  });

  const { data: visits = [] } = useQuery({
    queryKey: ["patient-visits", patientId, user?.hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("id, visit_date, status, total_amount, amount_paid, visit_services(id, source, services(name), service_statuses(code, name_ru))")
        .eq("patient_id", patientId!)
        .eq("hospital_id", user!.hospitalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!patientId && !!user,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-sm text-destructive">Patient not found.</p>;

  const fullName = [patient.last_name, patient.first_name, patient.middle_name].filter(Boolean).join(" ");

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" onClick={() => navigate("/registrar")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl font-bold text-foreground">{fullName || "—"}</h2>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </Button>
          </div>
          <span className="font-mono text-xs text-muted-foreground">{patient.patient_number || "—"}</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Date of Birth" value={patient.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"} />
          <Field label="Gender" value={patient.gender || "—"} />
          <Field label="Blood Type" value={patient.blood_type || "—"} />
          <Field label="National ID" value={patient.national_id || "—"} />
          <Field label="Phone" value={patient.phone || "—"} />
          <Field label="Email" value={patient.email || "—"} />
          <Field label="Status" value={patient.registration_status || "—"} />
          <Field label="Address" value={patient.address || "—"} />
        </div>
      </div>

      <Section
        title="Allergies"
        onAdd={() => setAllergyOpen(true)}
        empty={allergies.length === 0}
        emptyText="No allergies recorded."
      >
        {allergies.map((a: any) => (
          <div key={a.id} className="grid grid-cols-3 gap-2 text-sm rounded-md border p-3">
            <span className="capitalize font-medium">{a.allergy_type}</span>
            <span className="text-muted-foreground">{a.description}</span>
            <span className="capitalize text-muted-foreground">{a.severity}</span>
          </div>
        ))}
      </Section>

      <Section
        title="Contacts"
        onAdd={() => setContactOpen(true)}
        empty={contacts.length === 0}
        emptyText="No contacts recorded."
      >
        {contacts.map((c: any) => (
          <div key={c.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 text-sm rounded-md border p-3 items-center">
            <span className="font-medium">{c.name}</span>
            <span className="text-muted-foreground">{c.relationship}</span>
            <span className="text-muted-foreground">{c.phone}</span>
            {c.is_primary && (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Primary</span>
            )}
          </div>
        ))}
      </Section>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Visits</h3>
        </div>
        {visits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No visits yet.</p>
        ) : (
          <div className="space-y-3">
            {visits.map((v: any) => (
              <div key={v.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Visit #{v.id.slice(0, 8)}
                    </div>
                    <div className="text-sm font-medium">
                      {v.visit_date ? format(new Date(v.visit_date), "MMM d, yyyy") : "—"}
                    </div>
                    <span className="inline-block mt-1 rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                      {v.status || "—"}
                    </span>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-semibold">{Number(v.total_amount || 0).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">
                      Paid: {Number(v.amount_paid || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                {v.visit_services?.length > 0 && (
                  <div className="space-y-1">
                    {v.visit_services.map((vs: any) => (
                      <div key={vs.id} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate">{vs.services?.name || "—"}</span>
                        <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground shrink-0">
                          {vs.service_statuses?.name_ru || vs.service_statuses?.code || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/registrar/visits/${v.id}`)}>
                    Open Visit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AllergyDialog
        open={allergyOpen}
        onOpenChange={setAllergyOpen}
        patientId={patientId!}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient-allergies", patientId] })}
      />
      <ContactDialog
        open={contactOpen}
        onOpenChange={setContactOpen}
        patientId={patientId!}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient-contacts", patientId] })}
      />
      <EditPatientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={patient}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["patient", patientId] })}
      />
    </div>
  );
}

function EditPatientDialog({
  open, onOpenChange, patient, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: any;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    first_name: patient.first_name || "",
    last_name: patient.last_name || "",
    middle_name: patient.middle_name || "",
    date_of_birth: patient.date_of_birth || "",
    gender: patient.gender || "",
    blood_type: patient.blood_type || "",
    national_id: patient.national_id || "",
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    registration_status: patient.registration_status || "minimal",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("patients")
        .update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          middle_name: form.middle_name.trim() || null,
          date_of_birth: form.date_of_birth || null,
          gender: form.gender || null,
          blood_type: form.blood_type || null,
          national_id: form.national_id.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          address: form.address.trim() || null,
          registration_status: form.registration_status,
        })
        .eq("id", patient.id);
      if (error) throw error;
      toast.success("Patient updated.");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Patient</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>First name *</Label>
            <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name *</Label>
            <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Middle name</Label>
            <Input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Blood type</Label>
            <Select value={form.blood_type} onValueChange={(v) => set("blood_type", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>National ID</Label>
            <Input value={form.national_id} onChange={(e) => set("national_id", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Registration status</Label>
            <Select value={form.registration_status} onValueChange={(v) => set("registration_status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
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

function Section({
  title, onAdd, empty, emptyText, children,
}: {
  title: string;
  onAdd: () => void;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1">
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}

function AllergyDialog({
  open, onOpenChange, patientId, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId: string;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [type, setType] = useState("drug");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("mild");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("patient_allergies").insert({
        patient_id: patientId,
        allergy_type: type,
        description: description.trim(),
        severity,
        hospital_id: user!.hospitalId,
        recorded_by: user!.id,
      });
      if (error) throw error;
      toast.success("Allergy added.");
      setDescription(""); setType("drug"); setSeverity("mild");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Allergy</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="drug">Drug</SelectItem>
                <SelectItem value="environmental">Environmental</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
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

function ContactDialog({
  open, onOpenChange, patientId, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientId: string;
  onSuccess: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("patient_contacts").insert({
        patient_id: patientId,
        name: name.trim(),
        relationship: relationship.trim() || null,
        phone: phone.trim() || null,
        is_primary: isPrimary,
        hospital_id: user!.hospitalId,
      });
      if (error) throw error;
      toast.success("Contact added.");
      setName(""); setRelationship(""); setPhone(""); setIsPrimary(false);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Relationship</Label>
            <Input value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Primary contact</Label>
            <Switch checked={isPrimary} onCheckedChange={setIsPrimary} />
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
