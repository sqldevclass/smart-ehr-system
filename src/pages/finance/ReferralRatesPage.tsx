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

interface RateRow {
  service_type_id: string | null;
  service_id: string | null;
  value: number;
  scope_label: string;
}

export default function ReferralRatesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [scopeKind, setScopeKind] = useState<"type" | "service">("type");
  const [scopeValue, setScopeValue] = useState("");
  const [rateValue, setRateValue] = useState("");
  const [saving, setSaving] = useState(false);

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
        .select("id, name")
        .eq("hospital_id", user.hospitalId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["hospital-referral-rates", user?.hospitalId],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("hospital_referral_rates")
        .select(`
          service_type_id, service_id, value,
          service_types(name_ru),
          services(name)
        `)
        .eq("hospital_id", user.hospitalId);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        service_type_id: r.service_type_id,
        service_id: r.service_id,
        value: r.value,
        scope_label: r.services?.name
          ? r.services.name
          : r.service_types?.name_ru
          ? r.service_types.name_ru
          : "All service types (default)",
      })) as RateRow[];
    },
    enabled: !!user,
  });

  const openAdd = () => {
    setScopeKind("type");
    setScopeValue("");
    setRateValue("");
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (!user || !scopeValue || rateValue === "") {
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
      const { error } = await supabase.rpc("set_referral_rate_for_all_physicians", {
        p_hospital_id: user.hospitalId,
        p_value: numValue,
        p_service_type_id: scopeKind === "type" ? scopeValue : null,
        p_service_id: scopeKind === "service" ? scopeValue : null,
      });
      if (error) throw error;
      toast.success("Referral rate applied to all physicians.");
      setAddOpen(false);
      queryClient.invalidateQueries({ queryKey: ["hospital-referral-rates", user.hospitalId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save rate.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (r: RateRow) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("end_referral_rate_for_all_physicians", {
        p_hospital_id: user.hospitalId,
        p_service_type_id: r.service_type_id,
        p_service_id: r.service_id,
      });
      if (error) throw error;
      toast.success("Referral rate ended for all physicians.");
      queryClient.invalidateQueries({ queryKey: ["hospital-referral-rates", user.hospitalId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to end rate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Referral Rates</h1>
        <Button size="sm" onClick={openAdd} className="gap-1">
          <Plus className="h-4 w-4" /> Set Rate
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        One rate per service/service type, applied to every physician at once. A newly hired physician
        automatically gets whatever is set here.
      </p>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scope</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">No referral rates configured.</TableCell>
              </TableRow>
            ) : rates.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.scope_label}</TableCell>
                <TableCell>{r.value}%</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => handleEnd(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Referral Rate (All Physicians)</DialogTitle>
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Applying…" : "Apply to All Physicians"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
