import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { format } from "date-fns";

export default function BloodDrawPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types-lab", user?.hospitalId],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_types")
        .select("id, code")
        .eq("hospital_id", user!.hospitalId);
      return data || [];
    },
    enabled: !!user,
  });
  const labTypeIds = useMemo(
    () => serviceTypes.filter((t: any) => t.code === "laboratory").map((t: any) => t.id),
    [serviceTypes],
  );

  const { data: statuses = [] } = useQuery({
    queryKey: ["service-statuses-lab"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_statuses")
        .select("id, code")
        .in("code", ["ready_for_execution", "in_progress"]);
      return data || [];
    },
  });
  const readyId = statuses.find((s: any) => s.code === "ready_for_execution")?.id;
  const inProgressId = statuses.find((s: any) => s.code === "in_progress")?.id;

  const { data: rawServices = [], refetch } = useQuery({
    queryKey: ["lab-blood-draw", user?.hospitalId, readyId],
    queryFn: async () => {
      if (!readyId) return [];
      const { data, error } = await supabase
        .from("visit_services")
        .select("id, scheduled_at, visit_id, patient_id, patients(first_name, last_name, patient_number, date_of_birth), services(id, name, service_type_id), service_statuses(code)")
        .eq("hospital_id", user!.hospitalId)
        .eq("status_id", readyId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!readyId,
  });

  const labServices = useMemo(
    () => rawServices.filter((vs: any) => labTypeIds.includes(vs.services?.service_type_id)),
    [rawServices, labTypeIds],
  );

  const [drawOpen, setDrawOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");
  const [savedBarcode, setSavedBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openDraw = (vs: any) => {
    setSelected(vs);
    setBarcode("");
    setNotes("");
    setSavedBarcode(null);
    setDrawOpen(true);
  };

  const saveDraw = async () => {
    if (!selected || !user || !inProgressId) return;
    setSaving(true);
    try {
      const finalBarcode = barcode.trim() || `LAB-${Date.now()}`;
      const { error: insertErr } = await supabase.from("lab_samples").insert({
        visit_service_id: selected.id,
        patient_id: selected.patient_id,
        hospital_id: user.hospitalId,
        barcode: finalBarcode,
        status: 'in_progress',
        drawn_by: user.id,
        drawn_at: new Date().toISOString(),
        notes: notes.trim() || null,
      });
      if (insertErr) throw insertErr;

      const { error: updErr } = await supabase
        .from("visit_services")
        .update({ status_id: inProgressId })
        .eq("id", selected.id);
      if (updErr) throw updErr;

      toast.success(`Sample drawn. Barcode: ${finalBarcode}`);
      setSavedBarcode(finalBarcode);
      qc.invalidateQueries({ queryKey: ["lab-blood-draw"] });
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const printLabel = () => {
    if (!savedBarcode || !selected) return;
    const w = window.open("", "_blank", "width=400,height=300");
    if (!w) return;
    const p = selected.patients;
    const patientName = [p?.last_name, p?.first_name].filter(Boolean).join(" ");
    w.document.write(`
      <html><head><title>Label ${savedBarcode}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}.bc{font-size:32px;font-weight:bold;letter-spacing:2px;margin:20px 0;border:2px solid #000;padding:10px;font-family:monospace}</style>
      </head><body>
      <h2>${patientName}</h2>
      <p>#${p?.patient_number || ""}</p>
      <p>${selected.services?.name || ""}</p>
      <div class="bc">${savedBarcode}</div>
      <p>${format(new Date(), "MMM d, yyyy HH:mm")}</p>
      <script>window.print();setTimeout(()=>window.close(),500);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Blood Draw</h1>

      <div className="rounded-lg border bg-card overflow-x-auto">
        {labServices.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No lab services awaiting blood draw.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Patient #</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labServices.map((vs: any, i: number) => {
                const p = vs.patients;
                return (
                  <TableRow key={vs.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {[p?.last_name, p?.first_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p?.patient_number || "—"}</TableCell>
                    <TableCell>{vs.services?.name || "—"}</TableCell>
                    <TableCell>{vs.scheduled_at ? format(new Date(vs.scheduled_at), "MMM d HH:mm") : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => openDraw(vs)}>Draw Sample</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Draw Sample</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>{[selected.patients?.last_name, selected.patients?.first_name].filter(Boolean).join(" ")}</p>
                <p>{selected.services?.name}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Barcode (auto if empty)</Label>
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="LAB-..." disabled={!!savedBarcode} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!!savedBarcode} />
              </div>
              {savedBarcode && (
                <div className="rounded border bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Saved Barcode</p>
                  <p className="font-mono text-lg font-bold">{savedBarcode}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {savedBarcode ? (
              <>
                <Button variant="outline" onClick={() => setDrawOpen(false)}>Close</Button>
                <Button onClick={printLabel}>Print Label</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setDrawOpen(false)}>Cancel</Button>
                <Button onClick={saveDraw} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
