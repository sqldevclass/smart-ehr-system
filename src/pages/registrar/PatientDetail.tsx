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
import { ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [allergyOpen, setAllergyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

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
          <h2 className="font-heading text-xl font-bold text-foreground">{fullName || "—"}</h2>
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
    </div>
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
