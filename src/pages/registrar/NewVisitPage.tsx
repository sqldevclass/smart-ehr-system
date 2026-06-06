import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, X, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Patient {
  id: string;
  patient_number: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  date_of_birth: string | null;
  phone: string | null;
}

interface ServiceType { id: string; name_en: string | null; name_ru: string | null; code: string | null; }
interface ServiceGroup { id: string; name: string; }
interface ServiceRow {
  id: string;
  name: string;
  cost: number;
  cost_with_vat: number | null;
  service_group_id: string | null;
}

interface BasketItem {
  service: ServiceRow;
  assignedPhysicianId: string | null;
}

const REG_SOURCES = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google_search", label: "Google Search" },
  { value: "friend_recommendation", label: "Friend Recommendation" },
  { value: "doctor_referral", label: "Doctor Referral" },
  { value: "other", label: "Other" },
];

const formatPatientName = (p: Patient) =>
  [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(" ") || "—";

export default function NewVisitPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [search, setSearch] = useState("");

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [registrationSource, setRegistrationSource] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // ---- Patient search ----
  const { data: patients = [] } = useQuery({
    queryKey: ["new-visit-patients", user?.hospitalId, search],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from("patients")
        .select("id, patient_number, first_name, last_name, middle_name, date_of_birth, phone")
        .eq("hospital_id", user.hospitalId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(
          `last_name.ilike.${s},first_name.ilike.${s},phone.ilike.${s},patient_number.ilike.${s}`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Patient[];
    },
    enabled: !!user && !selectedPatient,
  });

  // ---- Service catalog ----
  const { data: types = [] } = useQuery({
    queryKey: ["nv-service-types", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_types")
        .select("id, name_en, name_ru, code")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as ServiceType[];
    },
    enabled: !!user && !!selectedPatient,
  });

  useEffect(() => {
    if (!selectedTypeId && types.length > 0) setSelectedTypeId(types[0].id);
  }, [types, selectedTypeId]);

  const { data: groups = [] } = useQuery({
    queryKey: ["nv-service-groups", user?.hospitalId, selectedTypeId],
    queryFn: async () => {
      if (!user || !selectedTypeId) return [];
      const { data, error } = await supabase
        .from("service_groups")
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("service_type_id", selectedTypeId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as ServiceGroup[];
    },
    enabled: !!user && !!selectedTypeId,
  });

  useEffect(() => {
    setSelectedGroupId(groups[0]?.id ?? null);
  }, [groups]);

  const { data: services = [] } = useQuery({
    queryKey: ["nv-services", user?.hospitalId, selectedGroupId],
    queryFn: async () => {
      if (!user || !selectedGroupId) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, cost, cost_with_vat, service_group_id")
        .eq("hospital_id", user.hospitalId)
        .eq("service_group_id", selectedGroupId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as ServiceRow[];
    },
    enabled: !!user && !!selectedGroupId,
  });

  const basketTotal = useMemo(
    () => basket.reduce((sum, b) => sum + Number(b.service.cost_with_vat ?? b.service.cost ?? 0), 0),
    [basket]
  );

  const addToBasket = (s: ServiceRow) => {
    if (basket.some((b) => b.service.id === s.id)) {
      toast.info("Service already in basket.");
      return;
    }
    setBasket((b) => [...b, { service: s, assignedPhysicianId: null }]);
  };

  const removeFromBasket = (serviceId: string) => {
    setBasket((b) => b.filter((x) => x.service.id !== serviceId));
  };

  const setBasketPhysician = (serviceId: string, physicianId: string) => {
    setBasket((b) =>
      b.map((x) => (x.service.id === serviceId ? { ...x, assignedPhysicianId: physicianId } : x))
    );
  };

  const handleCreateInvoice = async () => {
    if (!user || !selectedPatient) return;
    if (basket.length === 0) { toast.error("Add at least one service."); return; }
    if (!registrationSource) { toast.error("Select a registration source."); return; }

    setSubmitting(true);
    try {
      // Preliminary status
      const { data: prelim, error: psErr } = await supabase
        .from("service_statuses")
        .select("id")
        .eq("code", "preliminary")
        .single();
      if (psErr) throw psErr;

      // Create visit
      const { data: visit, error: vErr } = await supabase
        .from("visits")
        .insert({
          patient_id: selectedPatient.id,
          hospital_id: user.hospitalId,
          visit_type: "outpatient",
          visit_date: new Date().toISOString().slice(0, 10),
          registration_source: registrationSource,
          total_amount: basketTotal,
        })
        .select("id")
        .single();
      if (vErr) throw vErr;

      // visit_services
      const vsRows = basket.map((b) => ({
        visit_id: visit.id,
        patient_id: selectedPatient.id,
        hospital_id: user.hospitalId,
        service_id: b.service.id,
        assigned_staff_role_id: b.assignedPhysicianId,
        status_id: prelim.id,
        source: "registrar",
        cost_at_time: Number(b.service.cost_with_vat ?? b.service.cost ?? 0),
        created_by: user.id,
      }));
      const { data: insertedVs, error: vsErr } = await supabase
        .from("visit_services")
        .insert(vsRows)
        .select("id, cost_at_time, service_id");
      if (vsErr) throw vsErr;

      // Invoice
      const { data: invoice, error: iErr } = await supabase
        .from("invoices")
        .insert({
          visit_id: visit.id,
          hospital_id: user.hospitalId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (iErr) throw iErr;

      // Invoice items
      const itemRows = (insertedVs || []).map((vs: any) => ({
        invoice_id: invoice.id,
        visit_service_id: vs.id,
        amount: vs.cost_at_time,
      }));
      const { error: iiErr } = await supabase.from("invoice_items").insert(itemRows);
      if (iiErr) throw iiErr;

      toast.success("Visit and invoice created.");
      navigate(`/registrar/visits/${visit.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create visit.");
    } finally {
      setSubmitting(false);
    }
  };

  // ----- Step 1: Patient search -----
  if (!selectedPatient) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-xl font-semibold">New Visit</h1>
          <p className="text-sm text-muted-foreground">Step 1 — Select patient</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or patient number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" onClick={() => navigate("/registrar")}>
            Register New Patient
          </Button>
        </div>

        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient #</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                    No patients found.
                  </TableCell>
                </TableRow>
              ) : (
                patients.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedPatient(p)}
                  >
                    <TableCell className="font-mono text-xs">{p.patient_number || "—"}</TableCell>
                    <TableCell className="font-medium">{formatPatientName(p)}</TableCell>
                    <TableCell>{p.date_of_birth ? format(new Date(p.date_of_birth), "MMM d, yyyy") : "—"}</TableCell>
                    <TableCell>{p.phone || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  // ----- Step 2+: Service selection + basket -----
  return (
    <div className="space-y-4">
      {/* Patient header */}
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">
            {selectedPatient.patient_number || "—"}
          </div>
          <div className="font-semibold text-lg">{formatPatientName(selectedPatient)}</div>
          <div className="text-sm text-muted-foreground">
            DOB: {selectedPatient.date_of_birth ? format(new Date(selectedPatient.date_of_birth), "MMM d, yyyy") : "—"}
            {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ""}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedPatient(null);
            setBasket([]);
            setRegistrationSource("");
          }}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Change patient
        </Button>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Service catalog */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="font-semibold">Service Catalog</div>

            {types.length > 0 && (
              <Tabs value={selectedTypeId ?? ""} onValueChange={setSelectedTypeId}>
                <TabsList className="flex-wrap h-auto">
                  {types.map((t) => (
                    <TabsTrigger key={t.id} value={t.id}>
                      {t.name_en || t.name_ru || t.code || "—"}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {groups.length > 0 ? (
              <Select value={selectedGroupId ?? ""} onValueChange={setSelectedGroupId}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No groups for this type.</p>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="w-32">Cost (incl. VAT)</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                      No services in this group.
                    </TableCell>
                  </TableRow>
                ) : (
                  services.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{Number(s.cost_with_vat ?? s.cost ?? 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => addToBasket(s)} className="gap-1">
                          <Plus className="h-3 w-3" /> Add
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Basket */}
        <div className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="font-semibold">Basket ({basket.length})</div>
            {basket.length === 0 ? (
              <p className="text-sm text-muted-foreground">No services added yet.</p>
            ) : (
              <div className="space-y-3">
                {basket.map((b) => (
                  <BasketRow
                    key={b.service.id}
                    item={b}
                    onRemove={() => removeFromBasket(b.service.id)}
                    onPhysicianChange={(id) => setBasketPhysician(b.service.id, id)}
                  />
                ))}
              </div>
            )}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-semibold">{basketTotal.toFixed(2)}</span>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>How did the patient hear about us?</Label>
              <Select value={registrationSource} onValueChange={setRegistrationSource}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {REG_SOURCES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              onClick={handleCreateInvoice}
              disabled={submitting || basket.length === 0 || !registrationSource}
            >
              {submitting ? "Creating…" : "Create Invoice"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface PhysicianOption {
  id: string;
  full_name: string;
}

function BasketRow({
  item, onRemove, onPhysicianChange,
}: {
  item: BasketItem;
  onRemove: () => void;
  onPhysicianChange: (id: string) => void;
}) {
  const { user } = useAuth();
  const serviceId = item.service.id;

  const { data: physicians = [] } = useQuery({
    queryKey: ["nv-service-physicians", user?.hospitalId, serviceId],
    queryFn: async () => {
      if (!user) return [] as PhysicianOption[];

      // Privileged physicians for this service
      const { data: privs } = await supabase
        .from("physician_service_privileges")
        .select("staff_role_id")
        .eq("service_id", serviceId)
        .eq("hospital_id", user.hospitalId);

      const ids = (privs || []).map((p: any) => p.staff_role_id);

      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("staff_roles")
          .select("id, persons!inner(first_name, last_name)")
          .eq("hospital_id", user.hospitalId)
          .eq("role_type", "physician")
          .eq("is_active", true)
          .in("id", ids);
        if (error) throw error;
        return (data || []).map((p: any) => ({
          id: p.id,
          full_name: `${p.persons?.last_name ?? ""} ${p.persons?.first_name ?? ""}`.trim() || "Unknown",
        })) as PhysicianOption[];
      }

      // Fallback: all active physicians
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name)")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        full_name: `${p.persons?.last_name ?? ""} ${p.persons?.first_name ?? ""}`.trim() || "Unknown",
      })) as PhysicianOption[];
    },
    enabled: !!user,
  });

  const cost = Number(item.service.cost_with_vat ?? item.service.cost ?? 0);

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="font-medium text-sm">{item.service.name}</div>
          <div className="text-xs text-muted-foreground">{cost.toFixed(2)}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Select value={item.assignedPhysicianId ?? ""} onValueChange={onPhysicianChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Assign physician (optional)" />
        </SelectTrigger>
        <SelectContent>
          {physicians.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
