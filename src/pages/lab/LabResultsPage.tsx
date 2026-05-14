import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Flag = "normal" | "high" | "low" | "critical_high" | "critical_low" | "pending";

const computeFlag = (value: string, refMin: any, refMax: any, critMin: any, critMax: any): Flag => {
  const n = parseFloat(value);
  if (isNaN(n)) return "normal";
  if (critMin != null && n < Number(critMin)) return "critical_low";
  if (critMax != null && n > Number(critMax)) return "critical_high";
  if (refMin != null && n < Number(refMin)) return "low";
  if (refMax != null && n > Number(refMax)) return "high";
  return "normal";
};

export const FlagBadge = ({ flag }: { flag: Flag | string | null }) => {
  if (!flag || flag === "pending") return <span className="text-muted-foreground">–</span>;
  const map: Record<string, { cls: string; label: string }> = {
    normal: { cls: "bg-green-100 text-green-900", label: "Normal" },
    high: { cls: "bg-red-100 text-red-900", label: "↑ High" },
    low: { cls: "bg-red-100 text-red-900", label: "↓ Low" },
    critical_high: { cls: "bg-red-700 text-white font-bold", label: "↑↑ Crit" },
    critical_low: { cls: "bg-red-700 text-white font-bold", label: "↓↓ Crit" },
  };
  const { cls, label } = map[flag] || { cls: "bg-muted", label: flag };
  return <span className={cn("rounded px-2 py-0.5 text-xs", cls)}>{label}</span>;
};

export default function LabResultsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: samples = [], refetch } = useQuery({
    queryKey: ["lab-samples-today", user?.hospitalId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("lab_samples")
        .select("id, barcode, status, drawn_at, notes, visit_service_id, patients(first_name, last_name, patient_number, date_of_birth, gender), visit_services(services(id, name, service_type_id))")
        .eq("hospital_id", user!.hospitalId)
        .in("status", ["drawn", "in_progress", "completed"])
        .gte("drawn_at", today.toISOString())
        .order("drawn_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const pending = useMemo(() => samples.filter((s: any) => s.status === "drawn" || s.status === "in_progress"), [samples]);
  const completed = useMemo(() => samples.filter((s: any) => s.status === "completed"), [samples]);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [activeSample, setActiveSample] = useState<any>(null);

  const openResults = (s: any) => { setActiveSample(s); setResultsOpen(true); };

  const renderTable = (rows: any[], allowEnter: boolean) => (
    <div className="rounded-lg border bg-card overflow-x-auto">
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No samples.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Drawn</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s, i) => {
              const p = s.patients;
              return (
                <TableRow key={s.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">
                    {[p?.last_name, p?.first_name].filter(Boolean).join(" ") || "—"}
                    <div className="text-xs text-muted-foreground font-mono">#{p?.patient_number}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.barcode}</TableCell>
                  <TableCell>{s.visit_services?.services?.name || "—"}</TableCell>
                  <TableCell>{s.drawn_at ? format(new Date(s.drawn_at), "HH:mm") : "—"}</TableCell>
                  <TableCell className="text-right">
                    {allowEnter ? (
                      <Button size="sm" onClick={() => openResults(s)}>Enter Results</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openResults(s)}>View</Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Lab Results</h1>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="pt-4">
          {renderTable(pending, true)}
        </TabsContent>
        <TabsContent value="completed" className="pt-4">
          {renderTable(completed, false)}
        </TabsContent>
      </Tabs>

      {activeSample && (
        <ResultsDialog
          open={resultsOpen}
          onOpenChange={setResultsOpen}
          sample={activeSample}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["lab-samples-today"] });
            refetch();
          }}
        />
      )}
    </div>
  );
}

function ResultsDialog({
  open, onOpenChange, sample, onSaved,
}: { open: boolean; onOpenChange: (b: boolean) => void; sample: any; onSaved: () => void }) {
  const { user } = useAuth();
  const serviceId = sample?.visit_services?.services?.id;
  const gender = sample?.patients?.gender as string | null;

  const { data: templates = [] } = useQuery({
    queryKey: ["lab-templates", serviceId, user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lab_parameter_templates")
        .select("*")
        .eq("service_id", serviceId)
        .eq("hospital_id", user!.hospitalId)
        .order("sort_order");
      return data || [];
    },
    enabled: !!serviceId && !!user,
  });

  const { data: existing = [] } = useQuery({
    queryKey: ["lab-results-for-sample", sample?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("lab_results")
        .select("*")
        .eq("lab_sample_id", sample.id);
      return data || [];
    },
    enabled: !!sample?.id,
  });

  const existingByTemplate = useMemo(() => {
    const m: Record<string, any> = {};
    existing.forEach((r: any) => { if (r.parameter_template_id) m[r.parameter_template_id] = r; });
    return m;
  }, [existing]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Initialize values from existing on open
  useEffect(() => {
    const init: Record<string, string> = {};
    templates.forEach((t: any) => {
      const ex = existingByTemplate[t.id];
      init[t.id] = ex?.value ?? "";
    });
    setValues(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, existing]);

  const isCompleted = sample?.status === "completed";

  const refRangeFor = (t: any) => {
    if (gender === "male" && t.ref_min_male != null) return [t.ref_min_male, t.ref_max_male];
    if (gender === "female" && t.ref_min_female != null) return [t.ref_min_female, t.ref_max_female];
    return [t.ref_min_male ?? t.ref_min_female, t.ref_max_male ?? t.ref_max_female];
  };

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const t of templates) {
        const v = values[t.id];
        if (v == null || v === "") continue;
        const [refMin, refMax] = refRangeFor(t);
        const ex = existingByTemplate[t.id];
        if (ex) {
          const { error } = await supabase
            .from("lab_results")
            .update({ value: v })
            .eq("id", ex.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("lab_results").insert({
            lab_sample_id: sample.id,
            hospital_id: user.hospitalId,
            parameter_template_id: t.id,
            parameter_name: t.name,
            value: v,
            unit: t.unit,
            ref_min: refMin,
            ref_max: refMax,
            critical_min: t.critical_min,
            critical_max: t.critical_max,
          });
          if (error) throw error;
        }
      }

      const { error: sErr } = await supabase
        .from("lab_samples")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", sample.id);
      if (sErr) throw sErr;

      const { error: cErr } = await supabase.rpc("complete_service", {
        p_visit_service_id: sample.visit_service_id,
        p_completed_by: user.id,
      });
      if (cErr) throw cErr;

      toast.success("Results confirmed.");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isCompleted ? "View Results" : "Enter Results"} — {sample?.barcode}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">No parameter template defined for this service.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parameter</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Ref Range</TableHead>
                  <TableHead>Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t: any) => {
                  const [refMin, refMax] = refRangeFor(t);
                  const v = values[t.id] ?? "";
                  const flag = computeFlag(v, refMin, refMax, t.critical_min, t.critical_max);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.unit || "—"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={v}
                          disabled={isCompleted}
                          onChange={(e) => setValues((s) => ({ ...s, [t.id]: e.target.value }))}
                          className="h-8 w-28"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {refMin != null || refMax != null ? `${refMin ?? "—"} – ${refMax ?? "—"}` : "—"}
                      </TableCell>
                      <TableCell>{v ? <FlagBadge flag={flag} /> : <span className="text-muted-foreground">–</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!isCompleted && (
            <Button onClick={handleConfirm} disabled={saving || templates.length === 0}>
              {saving ? "Saving…" : "Confirm Results"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
