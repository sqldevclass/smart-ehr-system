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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, CalendarIcon, Edit, Save, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState<Date>();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [passport, setPassport] = useState("");
  const [insurancePolicy, setInsurancePolicy] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [insuranceType, setInsuranceType] = useState("");
  const [primaryPhysicianId, setPrimaryPhysicianId] = useState("");
  const [primaryDepartmentId, setPrimaryDepartmentId] = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

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

  const { data: physicians = [] } = useQuery({
    queryKey: ["physicians", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("hospital_id", user!.hospitalId)
        .eq("role", "physician");
      return data || [];
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

  const startEditing = () => {
    if (!patient) return;
    setFullName(patient.full_name || "");
    setDob(patient.date_of_birth ? new Date(patient.date_of_birth) : undefined);
    setPhone(patient.phone || "");
    setEmail(patient.email || "");
    setAddress(patient.address || "");
    setPassport(patient.passport_number || "");
    setInsurancePolicy(patient.insurance_policy_number || "");
    setInsuranceCompany(patient.insurance_company || "");
    setInsuranceType(patient.insurance_type || "");
    setPrimaryPhysicianId(patient.primary_physician_id || "");
    setPrimaryDepartmentId(patient.primary_department_id || "");
    const contacts = patient.emergency_contacts as EmergencyContact[] | null;
    setEmergencyContacts(contacts || []);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required.");
      return;
    }
    if (!dob) {
      toast.error("Date of birth is required.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("patients")
        .update({
          full_name: fullName.trim(),
          date_of_birth: format(dob, "yyyy-MM-dd"),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          passport_number: passport.trim() || null,
          insurance_policy_number: insurancePolicy.trim() || null,
          insurance_company: insuranceCompany.trim() || null,
          insurance_type: insuranceType.trim() || null,
          primary_physician_id: primaryPhysicianId || null,
          primary_department_id: primaryDepartmentId || null,
          emergency_contacts: emergencyContacts.length > 0 ? emergencyContacts : null,
        })
        .eq("id", patientId!)
        .eq("hospital_id", user!.hospitalId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Patient updated.");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["patient", patientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update.");
    } finally {
      setSaving(false);
    }
  };

  const addContact = () => setEmergencyContacts([...emergencyContacts, { name: "", relationship: "", phone: "" }]);
  const removeContact = (i: number) => setEmergencyContacts(emergencyContacts.filter((_, idx) => idx !== i));
  const updateContact = (i: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...emergencyContacts];
    updated[i] = { ...updated[i], [field]: value };
    setEmergencyContacts(updated);
  };

  const physicianName = physicians.find((p) => p.id === patient?.primary_physician_id)?.full_name || "—";
  const departmentName = departments.find((d) => d.id === patient?.primary_department_id)?.name || "—";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!patient) return <p className="text-sm text-destructive">Patient not found.</p>;

  const contacts = (patient.emergency_contacts as EmergencyContact[] | null) || [];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/registrar")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {!editing ? (
          <Button variant="outline" onClick={startEditing} className="gap-2">
            <Edit className="h-4 w-4" /> Edit
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      {!editing ? (
        /* READ MODE */
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <h2 className="font-heading text-xl font-bold text-foreground">{patient.full_name}</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Date of Birth" value={patient.date_of_birth ? format(new Date(patient.date_of_birth), "MMM d, yyyy") : "—"} />
            <Field label="Phone" value={patient.phone || "—"} />
            <Field label="Email" value={patient.email || "—"} />
            <Field label="Passport" value={patient.passport_number || "—"} />
            <Field label="Address" value={patient.address || "—"} />
            <Field label="Insurance Policy #" value={patient.insurance_policy_number || "—"} />
            <Field label="Insurance Company" value={patient.insurance_company || "—"} />
            <Field label="Insurance Type" value={patient.insurance_type || "—"} />
            <Field label="Primary Physician" value={physicianName} />
            <Field label="Primary Department" value={departmentName} />
          </div>

          {contacts.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-foreground">Emergency Contacts</p>
              {contacts.map((c, i) => (
                <div key={i} className="grid grid-cols-3 gap-2 text-sm rounded-md border p-2">
                  <span>{c.name}</span>
                  <span className="text-muted-foreground">{c.relationship}</span>
                  <span className="text-muted-foreground">{c.phone}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* EDIT MODE */
        <div className="space-y-4 rounded-lg border bg-card p-6">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Date of Birth *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dob && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dob ? format(dob, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dob}
                  onSelect={setDob}
                  disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Passport Number</Label>
            <Input value={passport} onChange={(e) => setPassport(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Insurance Policy #</Label>
              <Input value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Insurance Company</Label>
              <Input value={insuranceCompany} onChange={(e) => setInsuranceCompany(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Insurance Type</Label>
            <Input value={insuranceType} onChange={(e) => setInsuranceType(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Primary Physician</Label>
            <Select value={primaryPhysicianId} onValueChange={setPrimaryPhysicianId}>
              <SelectTrigger><SelectValue placeholder="Select physician" /></SelectTrigger>
              <SelectContent>
                {physicians.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Primary Department</Label>
            <Select value={primaryDepartmentId} onValueChange={setPrimaryDepartmentId}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Emergency Contacts</Label>
              <Button type="button" variant="outline" size="sm" onClick={addContact} className="gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
            {emergencyContacts.map((contact, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={contact.name} onChange={(e) => updateContact(i, "name", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Relationship</Label>
                  <Input value={contact.relationship} onChange={(e) => updateContact(i, "relationship", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={contact.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeContact(i)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
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
