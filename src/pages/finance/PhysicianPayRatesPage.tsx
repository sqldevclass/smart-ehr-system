import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface PhysicianRow {
  id: string;
  full_name: string;
  department_name: string | null;
}

interface RateRow {
  id: string;
  pay_rate_type_id: string;
  type_code: string;
  value: number;
  service_type_id: string | null;
  service_id: string | null;
  scope_label: string;
}

const SCOPED_TYPES = ["own_service", "referral"];

export default function PhysicianPayRatesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addTypeCode, setAddTypeCode] = useState<"own_service" | "referral">("own_service");
  const [scopeKind, setScopeKind] = useState<"type" | "service">("type");
  const [scopeValue, setScopeValue] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [basePayInput, setBasePayInput] = useState("");
  const [bucketInput, setBucketInput] = useState("");

  const { data: rateTypes = [] } = useQuery({
    queryKey: ["pay-rate-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pay_rate_types")
        .select("id, code, name_ru, value_kind")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: physicians = [], isLoading } = useQuery({
    queryKey: ["finance-physicians", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("staff_roles")
        .select("id, persons!inner(first_name, last_name), departments!department_id(name)")
        .eq("hospital_id", user.hospitalId)
        .eq("role_type", "physician")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        full_name: `${p.persons?.last_name ?? ""} ${p.persons?.first_name ?? ""}`.trim() || "Unknown",
        department_name: p.departments?.name ?? null,
      })) as PhysicianRow[];
    },
    enabled: !!user,
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service_types_all", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("service_types")
        .select("id, name_ru, name_en")
        .or(`hospital_id.is.null,hospital_id.eq.${user.hospitalId}`)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services_all", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_type_id")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: rates = [], isLoading: ratesLoading } = useQuery({
    queryKey: ["physician-pay-rates", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data, error } = await supabase
        .from("physician_pay_rates")
        .select(`
          id, value, service_type_id, service_id, pay_rate_type_id,
          pay_rate_types!inner(code),
          service_types(name_ru),
          services(name)
        `)
        .eq("staff_role_id", selectedId)
        .is("valid_to", null);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        pay_rate_type_id: r.pay_rate_type_id,
        type_code: r.pay_rate_types?.code,
        value: r.value,
        service_type_id: r.service_type_id,
        service_id: r.service_id,
        scope_label: r.services?.name
          ? r.services.name
          : r.service_types?.name_ru
          ? r.service_types.name_ru
          : "All service types (default)",
      })) as RateRow[];
    },
    enabled: !!selectedId,
  });

  const basePay = rates.find((r) => r.type_code === "base_pay");
  const bucket = rates.find((r) => r.type_code === "department_bucket");
  const ownServiceRates = rates.filter((r) => r.type_code === "own_service");
  const referralRates = rates.filter((r) => r.type_code === "referral");

  const selectPhysician = (p: PhysicianRow) => {
    setSelectedId(p.id);
    setBasePayInput("");
    setBucketInput("");
  };

  const typeIdFor = (code: string) => rateTypes.find((t: any) => t.code === code)?.id;

  const saveFlatRate = async (code: "base_pay" | "department_bucket", value: string) => {
    if (!selectedId || !user || value === "") return;
    const numValue = Number(value);
    if (isNaN(numValue) || numValue < 0) {
      toast.error("Enter a valid non-negative number.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_physician_pay_rate", {
        p_staff_role_id: selectedId,
        p_pay_rate_type_id: typeIdFor(code),
        p_value: numValue,
      });
      if (error) throw error;
      toast.success("Saved. This rate applies going forward from now.");
      queryClient.invalidateQueries({ queryKey: ["physician-pay-rates", selectedId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const openAdd = (code: "own_service" | "referral") => {
    setAddTypeCode(code);
    setScopeKind("type");
    setScopeValue("");
    setRateValue("");
    setAddOpen(true);
  };

  const handleAddScopedRate = async () => {
    if (!selectedId || !user || !scopeValue || rateValue === "") {
      toast.error("Select a scope and enter a value.");
      return;
    }
    const numValue = Number(rateValue);
    if (isNaN(numValue) || numValue < 0) {
      toast.error("Enter a valid non-negative number.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("set_physician_pay_rate", {
        p_staff_role_id: selectedId,
        p_pay_rate_type_id: typeIdFor(addTypeCode),
        p_value: numValue,
        p_service_type_id: scopeKind === "type" ? scopeValue : null,
        p_service_id: scopeKind === "service" ? scopeValue : null,
      });
      if (error) throw error;
      toast.success("Rate added.");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["physician-pay-rates", selectedId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to add rate. Check it isn't a duplicate scope.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("end_physician_pay_rate", { p_rate_id: id });
      if (error) throw error;
      toast.success("Rate ended.");
      queryClient.invalidateQueries({ queryKey: ["physician-pay-rates", selectedId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to end rate.");
    } finally {
      setSaving(false);
    }
  };

  const selectedPhysician = physicians.find((p) => p.id === selectedId);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">Physician Pay Rates</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Physician</TableHead>
                  <TableHead>Department</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {physicians.map((p) => (
                  <TableRow
                    key={p.id}
                    className={selectedId === p.id ? "bg-muted cursor-pointer" : "cursor-pointer"}
                    onClick={() => selectPhysician(p)}
                  >
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>{p.department_name || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!selectedId ? (
            <p className="text-muted-foreground">Select a physician to configure their pay rates.</p>
          ) : ratesLoading ? (
            <p className="text-muted-foreground">Loading rates…</p>
          ) : (
            <>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {selectedPhysician?.full_name}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="basePay">Base Pay (flat amount)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="basePay"
                      type="number"
                      min={0}
                      placeholder={basePay ? String(basePay.value) : "0"}
                      value={basePayInput}
                      onChange={(e) => setBasePayInput(e.target.value)}
                    />
                    <Button
                      onClick={() => saveFlatRate("base_pay", basePayInput || String(basePay?.value ?? ""))}
                      disabled={saving}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bucket">Department Bucket (%)</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bucket"
                      type="number"
                      min={0}
                      placeholder={bucket ? String(bucket.value) : "0"}
                      value={bucketInput}
                      onChange={(e) => setBucketInput(e.target.value)}
                    />
                    <Button
                      onClick={() => saveFlatRate("department_bucket", bucketInput || String(bucket?.value ?? ""))}
                      disabled={saving}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Own-Service Rates (%)</h3>
                  <Button size="sm" onClick={() => openAdd("own_service")} className="gap-1">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ownServiceRates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">No rates configured.</TableCell>
                      </TableRow>
                    ) : ownServiceRates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.scope_label}</TableCell>
                        <TableCell>{r.value}%</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Referral Rates (%)</h3>
                  <Button size="sm" onClick={() => openAdd("referral")} className="gap-1">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referralRates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground">No rates configured.</TableCell>
                      </TableRow>
                    ) : referralRates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.scope_label}</TableCell>
                        <TableCell>{r.value}%</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {addTypeCode === "own_service" ? "Own-Service" : "Referral"} Rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scopeKind} onValueChange={(v) => { setScopeKind(v as "type" | "service"); setScopeValue(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select scope kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="type">Service Type (broad)</SelectItem>
                  <SelectItem value="service">Specific Service (overrides type-level)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{scopeKind === "type" ? "Service Type" : "Service"}</Label>
              <Select value={scopeValue} onValueChange={setScopeValue}>
                <SelectTrigger>
                  <SelectValue placeholder={scopeKind === "type" ? "Select service type" : "Select service"} />
                </SelectTrigger>
                <SelectContent>
                  {(scopeKind === "type" ? serviceTypes : services).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name_ru || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rateValue">Rate (%)</Label>
              <Input id="rateValue" type="number" min={0} value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddScopedRate} disabled={saving}>
              {saving ? "Saving…" : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
