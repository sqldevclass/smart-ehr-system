import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  userId: string;
  onSuccess: () => void;
}

export default function RegisterPatientSheet({ open, onOpenChange, hospitalId, userId, onSuccess }: Props) {
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
  const [saving, setSaving] = useState(false);

  const { data: physicians = [] } = useQuery({
    queryKey: ["physicians", hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name), specializations!specialization_id(name)")
        .eq("hospital_id", hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      
      return data || [];
    },
    enabled: !!hospitalId,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name")
        .eq("hospital_id", hospitalId);
      return data || [];
    },
    enabled: !!hospitalId,
  });

  const resetForm = () => {
    setFullName("");
    setDob(undefined);
    setPhone("");
    setEmail("");
    setAddress("");
    setPassport("");
    setInsurancePolicy("");
    setInsuranceCompany("");
    setInsuranceType("");
    setPrimaryPhysicianId("");
    setPrimaryDepartmentId("");
    setEmergencyContacts([]);
  };

  const addContact = () => {
    setEmergencyContacts([...emergencyContacts, { name: "", relationship: "", phone: "" }]);
  };

  const removeContact = (index: number) => {
    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setEmergencyContacts(updated);
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
      const { error } = await supabase.from("patients").insert({
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
        hospital_id: hospitalId,
        created_by: userId,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Patient registered successfully.");
      resetForm();
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to register patient.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Register New Patient</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] px-6 py-4">
          <div className="space-y-4 pb-6">
            {/* Full name */}
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Patient full name" />
            </div>

            {/* Date of Birth */}
            <div className="space-y-1.5">
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !dob && "text-muted-foreground")}
                  >
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

            {/* Phone / Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Patient address" rows={2} />
            </div>

            {/* Passport */}
            <div className="space-y-1.5">
              <Label>Passport Number</Label>
              <Input value={passport} onChange={(e) => setPassport(e.target.value)} />
            </div>

            {/* Insurance */}
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
              <Input value={insuranceType} onChange={(e) => setInsuranceType(e.target.value)} placeholder="e.g. Private, Public" />
            </div>

            {/* Primary Physician */}
            <div className="space-y-1.5">
              <Label>Primary Physician</Label>
              <Select value={primaryPhysicianId} onValueChange={setPrimaryPhysicianId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select physician" />
                </SelectTrigger>
                <SelectContent>
                  {physicians.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.profiles?.full_name} — {p.specializations?.name || "—"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Primary Department */}
            <div className="space-y-1.5">
              <Label>Primary Department</Label>
              <Select value={primaryDepartmentId} onValueChange={setPrimaryDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Emergency Contacts */}
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
                    <Input
                      value={contact.name}
                      onChange={(e) => updateContact(i, "name", e.target.value)}
                      placeholder="Name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Relationship</Label>
                    <Input
                      value={contact.relationship}
                      onChange={(e) => updateContact(i, "relationship", e.target.value)}
                      placeholder="Relationship"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={contact.phone}
                      onChange={(e) => updateContact(i, "phone", e.target.value)}
                      placeholder="Phone"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeContact(i)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full mt-4">
              {saving ? "Saving…" : "Register Patient"}
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
