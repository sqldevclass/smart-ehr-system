import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitService: {
    id: string;
    patient_id: string;
    patients?: { first_name?: string; last_name?: string; patient_number?: string };
    services?: { name?: string };
  } | null;
  barcodePrefix: string;
  sampleStatus: "in_progress" | "drawn";
  hospitalId: string;
  onDrawn?: (visitServiceIds: string[]) => void | Promise<void>;
}

export default function DrawSampleDialog({
  open,
  onOpenChange,
  visitService,
  barcodePrefix,
  sampleStatus,
  hospitalId,
  onDrawn,
}: Props) {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");
  const [savedBarcode, setSavedBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupedServices, setGroupedServices] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !visitService) return;
    setBarcode("");
    setNotes("");
    setSavedBarcode(null);
    setSaving(false);
    setGroupedServices([visitService]);

    (async () => {
      const { data: triggerRow } = await supabase
        .from("visit_services")
        .select("services!inner(service_group_id, service_groups!inner(color))")
        .eq("id", visitService.id)
        .maybeSingle();
      const color = (triggerRow as any)?.services?.service_groups?.color;
      if (!color) return;

      const { data: preliminaryStatus } = await supabase
        .from("service_statuses")
        .select("id")
        .eq("code", "preliminary")
        .maybeSingle();
      if (!preliminaryStatus) return;

      const { data: siblings } = await supabase
        .from("visit_services")
        .select(`
          id, patient_id,
          patients(first_name, last_name, patient_number),
          services!inner(name, service_group_id, service_groups!inner(color))
        `)
        .eq("hospital_id", hospitalId)
        .eq("patient_id", visitService.patient_id)
        .eq("status_id", preliminaryStatus.id)
        .neq("id", visitService.id);

      const matched = (siblings || []).filter(
        (s: any) => s.services?.service_groups?.color === color,
      );
      if (matched.length > 0) {
        setGroupedServices([visitService, ...matched]);
      }
    })();
  }, [open, visitService?.id, hospitalId]);

  const saveDraw = async () => {
    if (!visitService || !user) return;
    setSaving(true);
    try {
      const finalBarcode = barcode.trim() || `${barcodePrefix}-${Date.now()}`;
      const { data: inserted, error: insertErr } = await supabase
        .from("lab_samples")
        .insert({
          visit_service_id: visitService.id,
          patient_id: visitService.patient_id,
          hospital_id: user.hospitalId,
          barcode: finalBarcode,
          status: sampleStatus,
          drawn_by: user.id,
          drawn_at: new Date().toISOString(),
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const { error: junctionErr } = await supabase
        .from("lab_sample_services")
        .insert(
          groupedServices.map((s) => ({
            hospital_id: user.hospitalId,
            sample_id: inserted.id,
            visit_service_id: s.id,
          })),
        );
      if (junctionErr) throw junctionErr;

      if (onDrawn) await onDrawn(groupedServices.map((s) => s.id));

      toast.success(
        groupedServices.length > 1
          ? `Sample drawn for ${groupedServices.length} tests. Barcode: ${finalBarcode}`
          : `Sample drawn. Barcode: ${finalBarcode}`,
      );
      setSavedBarcode(finalBarcode);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const printLabel = () => {
    if (!savedBarcode || !visitService) return;
    const w = window.open("", "_blank", "width=400,height=300");
    if (!w) return;
    const p = visitService.patients;
    const patientName = [p?.last_name, p?.first_name].filter(Boolean).join(" ");
    const testList = groupedServices
      .map((s) => s.services?.name || "")
      .filter(Boolean)
      .map((n) => `<div>${n}</div>`)
      .join("");
    w.document.write(`
      <html><head><title>Label ${savedBarcode}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:20px}.bc{font-size:32px;font-weight:bold;letter-spacing:2px;margin:20px 0;border:2px solid #000;padding:10px;font-family:monospace}.tests{font-size:12px;margin:8px 0}</style>
      </head><body>
      <h2>${patientName}</h2>
      <p>#${p?.patient_number || ""}</p>
      <div class="tests">${testList}</div>
      <div class="bc">${savedBarcode}</div>
      <p>${format(new Date(), "MMM d, yyyy HH:mm")}</p>
      <script>window.print();setTimeout(()=>window.close(),500);</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Draw Sample</DialogTitle></DialogHeader>
        {visitService && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>{[visitService.patients?.last_name, visitService.patients?.first_name].filter(Boolean).join(" ")}</p>
              {groupedServices.length > 1 ? (
                <div className="mt-1">
                  <p className="text-xs uppercase tracking-wide">Комбинированная пробирка ({groupedServices.length}):</p>
                  <ul className="list-disc list-inside">
                    {groupedServices.map((s) => (
                      <li key={s.id}>{s.services?.name}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>{visitService.services?.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Barcode (auto if empty)</Label>
              <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={`${barcodePrefix}-...`} disabled={!!savedBarcode} />
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button onClick={printLabel}>Print Label</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={saveDraw} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
